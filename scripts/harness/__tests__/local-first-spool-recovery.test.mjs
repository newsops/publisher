import { afterEach, describe, expect, it } from 'vitest'
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  rename,
} from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace as createPublicWorkspace,
  openWorkspace as openPublicWorkspace,
} from '../../../packages/operator/src/index.ts'
import { workspaceSyncPort } from '../../../packages/operator/src/core/workspace-ports.ts'

const createWorkspace = (input) =>
  workspaceSyncPort(createPublicWorkspace(input))
const openWorkspace = (input) => workspaceSyncPort(openPublicWorkspace(input))

const resources = []
const directories = []
afterEach(async () => {
  for (const workspace of resources.splice(0)) workspace.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function interruptedSpool() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-spool-recovery-'),
  )
  directories.push(directory)
  const database = path.join(directory, 'workspace.sqlite')
  const location = { path: database, siteId: 'example', writerId: 'writer-one' }
  const workspace = createWorkspace({
    ...location,
    identity: {
      name: 'Example News',
      canonicalOrigin: 'https://example.com',
      themeId: 'editorial',
    },
  })
  resources.push(workspace)
  workspace.prepareOperation({
    operationId: 'interrupted',
    intent: 'exact original logical intent',
  })
  const fault = new DatabaseSync(database)
  fault.exec(
    "CREATE TRIGGER fail_spool_digest BEFORE UPDATE OF payload_digest ON operations BEGIN SELECT RAISE(ABORT, 'digest commit interrupted'); END",
  )
  expect(() =>
    workspace.recordPreparedPayload({
      operationId: 'interrupted',
      payload: 'EXACT ORIGINAL ENCRYPTED BYTES',
    }),
  ).toThrow(/digest commit interrupted/)
  expect(
    fault.prepare('SELECT payload_digest FROM operations').get().payload_digest,
  ).toBe(null)
  fault.exec('DROP TRIGGER fail_spool_digest')
  fault.close()
  workspace.close()
  const [filename] = await readdir(`${database}.operations`)
  const spoolPath = path.join(`${database}.operations`, filename)
  return { database, location, spoolPath }
}

describe('ARCH-008 interrupted private spool durability', () => {
  it('adopts the exact durable spool after digest transaction failure before any re-encryption', async () => {
    const { database, location, spoolPath } = await interruptedSpool()
    const original = await readFile(spoolPath)
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(reopened.operation('interrupted')).toMatchObject({
      kind: 'prepared',
      stage: 'payload',
      payload: 'EXACT ORIGINAL ENCRYPTED BYTES',
    })
    const observer = new DatabaseSync(database)
    expect(
      observer.prepare('SELECT payload_digest FROM operations').get()
        .payload_digest,
    ).toMatch(/^[a-f0-9]{64}$/)
    observer.close()
    expect(() =>
      reopened.recordPreparedPayload({
        operationId: 'interrupted',
        payload: 'newly encrypted different bytes',
      }),
    ).toThrow(/operation.*conflict/)
    expect(await readFile(spoolPath)).toEqual(original)
    expect(reopened.status().currentRevision).toBe(0)
  })

  it('refuses an orphan belonging to a different logical intent', async () => {
    const { database, location, spoolPath } = await interruptedSpool()
    const original = await readFile(spoolPath)
    const changed = new DatabaseSync(database)
    changed
      .prepare('UPDATE operations SET intent=?')
      .run('different logical intent')
    changed.close()
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(() => reopened.operation('interrupted')).toThrow(
      /logical intent conflict/,
    )
    const observer = new DatabaseSync(database)
    expect(
      observer.prepare('SELECT payload_digest FROM operations').get()
        .payload_digest,
    ).toBe(null)
    observer.close()
    expect(await readFile(spoolPath)).toEqual(original)
  })

  it('keeps spool permissions private and refuses insecure files', async () => {
    const { location, spoolPath } = await interruptedSpool()
    expect((await stat(path.dirname(spoolPath))).mode & 0o077).toBe(0)
    expect((await stat(spoolPath)).mode & 0o077).toBe(0)
    await chmod(spoolPath, 0o644)
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(() => reopened.operation('interrupted')).toThrow(
      /insecure.*spool file/,
    )
  })

  it('refuses a symlink in place of the immutable spool', async () => {
    const { location, spoolPath } = await interruptedSpool()
    const retained = `${spoolPath}.retained`
    await rename(spoolPath, retained)
    await symlink(retained, spoolPath)
    const reopened = openWorkspace(location)
    resources.push(reopened)
    expect(() => reopened.operation('interrupted')).toThrow(
      /invalid.*spool file/,
    )
  })

  it('does not let a different writer adopt an interrupted spool', async () => {
    const { database, location } = await interruptedSpool()
    const other = openWorkspace({ ...location, writerId: 'other-writer' })
    resources.push(other)
    expect(() => other.operation('interrupted')).toThrow(
      /writer authority denied/,
    )
    const observer = new DatabaseSync(database)
    expect(
      observer.prepare('SELECT payload_digest FROM operations').get()
        .payload_digest,
    ).toBe(null)
    observer.close()
  })
})
