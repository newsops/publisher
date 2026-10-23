import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace,
  openWorkspace,
} from '../../../packages/operator/src/index.ts'
import { workspaceSyncPort } from '../../../packages/operator/src/core/workspace-ports.ts'

const resources = []
const directories = []
afterEach(async () => {
  for (const workspace of resources.splice(0)) workspace.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-checkpoint-'),
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
  const port = workspaceSyncPort(workspace)
  const namespace = 'a'.repeat(32)
  const prepare = (operationId) => {
    port.prepareOperation({
      operationId,
      intent: JSON.stringify({ operationId, namespace }),
    })
    port.recordPreparedPayload({
      operationId,
      payload: `exact bytes for ${operationId}`,
    })
  }
  const confirm = (operationId, sequence, revision = 0) =>
    port.recordRemoteReceipt({
      operationId,
      namespace,
      sequence,
      capturedRevision: revision,
      commitId: `commit-${operationId}`,
      headId: `head-${operationId}`,
    })
  return { location, workspace, port, namespace, prepare, confirm }
}

describe('ARCH-008 private remote baseline and public authority', () => {
  it('does not expose raw synchronization receipts or prepared journals from the public facade', async () => {
    const { workspace } = await fixture()
    expect(Object.keys(workspace).sort()).toEqual([
      'close',
      'execute',
      'read',
      'status',
    ])
    expect('recordRemoteReceipt' in workspace).toBe(false)
    expect('prepareOperation' in workspace).toBe(false)
  })

  it('persists the confirmed remote baseline without dirtying source or regressing on replay', async () => {
    const { location, workspace, port, namespace, prepare, confirm } =
      await fixture()
    expect(port.remoteCheckpoint(namespace)).toBeUndefined()
    prepare('one')
    confirm('one', 1)
    workspace.execute({
      operationId: 'source-edit',
      expectedRevision: 0,
      command: { kind: 'guidance.update', markdown: 'Later source' },
    })
    prepare('two')
    confirm('two', 2, 1)
    confirm('one', 1)
    expect(port.remoteCheckpoint(namespace)).toEqual({
      commitId: 'commit-two',
      headId: 'head-two',
      sequence: 2,
    })
    expect(workspace.status()).toMatchObject({
      currentRevision: 1,
      syncedRevision: 1,
      dirty: false,
    })
    workspace.close()
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(workspaceSyncPort(reopened).remoteCheckpoint(namespace)).toEqual({
      commitId: 'commit-two',
      headId: 'head-two',
      sequence: 2,
    })
  })

  it('rejects conflicting or skipped sequence checkpoints atomically', async () => {
    const { port, namespace, prepare, confirm } = await fixture()
    prepare('one')
    confirm('one', 1)
    prepare('conflict')
    expect(() => confirm('conflict', 1)).toThrow(/checkpoint identity conflict/)
    expect(port.operation('conflict')).toMatchObject({ kind: 'prepared' })
    prepare('gap')
    expect(() => confirm('gap', 3)).toThrow(/sequence gap/)
    expect(port.operation('gap')).toMatchObject({ kind: 'prepared' })
    expect(port.remoteCheckpoint(namespace)).toEqual({
      commitId: 'commit-one',
      headId: 'head-one',
      sequence: 1,
    })
    expect(port.remoteCheckpoint('b'.repeat(32))).toBeUndefined()
  })
})
