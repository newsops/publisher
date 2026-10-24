import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
} from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace,
  openWorkspace,
  WorkspaceError,
} from '../../../packages/operator/src/index.ts'
import { workspaceSyncPort } from '../../../packages/operator/src/core/workspace-ports.ts'

const syncBoundary = vi.hoisted(() => ({ calls: [], failInode: undefined }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fsyncSync(descriptor) {
      const info = actual.fstatSync(descriptor)
      const inode = `${info.dev}:${info.ino}`
      syncBoundary.calls.push(inode)
      if (inode === syncBoundary.failInode)
        throw new Error('parent directory fsync interrupted')
      actual.fsyncSync(descriptor)
    },
  }
})

const resources = []
const directories = []
afterEach(async () => {
  syncBoundary.failInode = undefined
  syncBoundary.calls.length = 0
  for (const workspace of resources.splice(0)) workspace.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-private-files-'),
  )
  directories.push(directory)
  const location = {
    path: path.join(directory, 'workspace.sqlite'),
    siteId: 'example',
    writerId: 'writer-one',
  }
  const workspace = createWorkspace({
    ...location,
    identity: {
      name: 'Example News',
      canonicalOrigin: 'https://example.com',
      themeId: 'editorial',
    },
  })
  resources.push(workspace)
  return { directory, location, workspace, port: workspaceSyncPort(workspace) }
}

async function inode(path) {
  const info = await stat(path)
  return `${info.dev}:${info.ino}`
}

describe('ARCH-008 private local filesystem durability', () => {
  it('flushes the newly-created spool directory parent before committing its digest', async () => {
    const { directory, location, port } = await fixture()
    port.prepareOperation({
      operationId: 'first-spool',
      intent: 'pinned intent',
    })
    port.recordPreparedPayload({
      operationId: 'first-spool',
      payload: 'exact original bytes',
    })
    expect(syncBoundary.calls).toContain(await inode(directory))
    expect(syncBoundary.calls).toContain(
      await inode(`${location.path}.operations`),
    )
  })

  it('does not commit a spool digest after parent-fsync failure and recovers the exact original bytes', async () => {
    const { directory, location, port } = await fixture()
    port.prepareOperation({
      operationId: 'interrupted-parent',
      intent: 'pinned intent',
    })
    syncBoundary.failInode = await inode(directory)
    expect(() =>
      port.recordPreparedPayload({
        operationId: 'interrupted-parent',
        payload: 'exact original bytes',
      }),
    ).toThrow(/parent directory fsync interrupted/)
    const observer = new DatabaseSync(location.path)
    expect(
      observer.prepare('SELECT payload_digest FROM operations').get()
        .payload_digest,
    ).toBe(null)
    observer.close()
    const [filename] = await readdir(`${location.path}.operations`)
    const spoolPath = path.join(`${location.path}.operations`, filename)
    const original = await readFile(spoolPath)
    syncBoundary.failInode = undefined
    expect(port.operation('interrupted-parent')).toMatchObject({
      kind: 'prepared',
      stage: 'payload',
      payload: 'exact original bytes',
    })
    expect(await readFile(spoolPath)).toEqual(original)
  })

  it('rejects a permissive plaintext database without silently changing its permissions', async () => {
    const { location, workspace } = await fixture()
    workspace.close()
    await chmod(location.path, 0o644)
    expect(() => openWorkspace(location)).toThrow(WorkspaceError)
    expect((await stat(location.path)).mode & 0o777).toBe(0o644)
  })

  it('opens a private 0600 database and refuses both live and dangling symlinks', async () => {
    const { directory, location, workspace } = await fixture()
    workspace.close()
    await chmod(location.path, 0o600)
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(reopened.status().siteId).toBe('example')
    const link = path.join(directory, 'linked.sqlite')
    await symlink(location.path, link)
    expect(() => openWorkspace({ ...location, path: link })).toThrow(
      WorkspaceError,
    )
    const dangling = path.join(directory, 'dangling.sqlite')
    await symlink(path.join(directory, 'missing.sqlite'), dangling)
    expect(() => openWorkspace({ ...location, path: dangling })).toThrow(
      WorkspaceError,
    )
  })
})
