import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace as createPublicWorkspace,
  openWorkspace as openPublicWorkspace,
  WorkspaceError,
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

async function fixture(siteId = 'example') {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-local-first-'),
  )
  directories.push(directory)
  const database = path.join(directory, 'workspace.sqlite')
  const workspace = createWorkspace({
    path: database,
    siteId,
    writerId: 'writer-one',
    identity: {
      name: 'Example News',
      canonicalOrigin: 'https://example.com',
      themeId: 'editorial',
    },
  })
  resources.push(workspace)
  return { directory, database, workspace }
}

function edit(workspace, operationId, markdown = operationId) {
  return workspace.execute({
    operationId,
    expectedRevision: workspace.status().currentRevision,
    command: { kind: 'guidance.update', markdown },
  })
}

describe('ARCH-008 real local SQLite authority', () => {
  it('starts empty, preserves site isolation and requires explicit create versus open', async () => {
    const first = await fixture('first')
    const second = await fixture('second')
    expect(first.workspace.read().content.posts).toEqual([])
    expect(first.workspace.read().content.authors).toEqual([])
    expect(first.workspace.read().content.categories).toEqual([])
    edit(first.workspace, 'first-edit', 'Private first site guidance')
    expect(second.workspace.read().guidance).toBe('')
    expect(() =>
      createWorkspace({
        path: first.database,
        siteId: 'first',
        writerId: 'writer-one',
        identity: {
          name: 'Example',
          canonicalOrigin: 'https://example.com',
          themeId: 'editorial',
        },
      }),
    ).toThrow(/exist/i)
    expect(() =>
      openWorkspace({
        path: path.join(first.directory, 'missing.sqlite'),
        siteId: 'first',
        writerId: 'writer-one',
      }),
    ).toThrow(/missing/i)
    expect(() =>
      openWorkspace({
        path: first.database,
        siteId: 'second',
        writerId: 'writer-one',
      }),
    ).toThrow(/site/i)
  })

  it('checks writer and revision while same-operation replay never repeats a mutation', async () => {
    const { workspace, database } = await fixture()
    const request = {
      operationId: 'edit-one',
      expectedRevision: 0,
      command: { kind: 'guidance.update', markdown: 'Original instructions' },
    }
    expect(workspace.execute(request)).toMatchObject({
      revision: 1,
      operationId: 'edit-one',
    })
    expect(workspace.execute(request)).toMatchObject({
      revision: 1,
      operationId: 'edit-one',
    })
    expect(() =>
      workspace.execute({
        ...request,
        command: { kind: 'guidance.update', markdown: 'Changed intent' },
      }),
    ).toThrow(/operation.*conflict/i)
    expect(() =>
      workspace.execute({ ...request, operationId: 'stale-edit' }),
    ).toThrow(/revision/i)
    const other = openWorkspace({
      path: database,
      siteId: 'example',
      writerId: 'other-writer',
    })
    resources.push(other)
    expect(() => edit(other, 'denied')).toThrow(/writer/i)
    expect(workspace.status().currentRevision).toBe(1)
  })

  it('uses SQLite OS-backed locks and releases them when a process terminates', async () => {
    const { workspace, database } = await fixture()
    const lock = new DatabaseSync(database)
    lock.exec('BEGIN IMMEDIATE')
    try {
      expect(() => edit(workspace, 'blocked')).toThrow(WorkspaceError)
    } finally {
      lock.exec('ROLLBACK')
      lock.close()
    }
    edit(workspace, 'unblocked')
    const script =
      "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); process.exit(0)"
    expect(spawnSync(process.execPath, ['-e', script, database]).status).toBe(0)
    expect(edit(workspace, 'after-process-exit')).toMatchObject({ revision: 2 })
  })

  it('atomically rolls source changes back when receipt persistence fails', async () => {
    const { workspace, database } = await fixture()
    const storage = new DatabaseSync(database)
    storage.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON mutations WHEN NEW.operation_id='storage-fault' BEGIN SELECT RAISE(ABORT, 'receipt storage fault'); END",
    )
    storage.close()
    expect(() => edit(workspace, 'storage-fault', 'Must not survive')).toThrow(
      /receipt storage fault/,
    )
    expect(workspace.status().currentRevision).toBe(0)
    expect(workspace.read().guidance).toBe('')
    expect(edit(workspace, 'healthy', 'Durable instructions')).toMatchObject({
      revision: 1,
    })
  })

  it('captures a consistent backup and records remote receipts without hiding later edits', async () => {
    const { workspace, database, directory } = await fixture()
    for (let index = 1; index <= 7; index++) edit(workspace, `edit-${index}`)
    workspace.prepareOperation({
      operationId: 'sync-seven',
      intent: '{"capturedRevision":7}',
    })
    const snapshot = await workspace.capture({
      destination: path.join(directory, 'capture.sqlite'),
    })
    expect(snapshot.revision).toBe(7)
    expect(snapshot.media).toEqual([])
    expect(snapshot.bytes).toEqual(
      new Uint8Array(await readFile(snapshot.path)),
    )
    edit(workspace, 'edit-eight')
    workspace.recordPreparedPayload({
      operationId: 'sync-seven',
      payload: 'exact protected snapshot bytes',
    })
    workspace.recordRemoteReceipt({
      operationId: 'sync-seven',
      commitId: 'commit-seven',
      capturedRevision: snapshot.revision,
      namespace: 'a'.repeat(32),
      headId: 'head-seven',
      sequence: 1,
    })
    expect(workspace.status()).toMatchObject({
      currentRevision: 8,
      syncedRevision: 7,
      dirty: true,
    })
    expect(workspace.operation('sync-seven')).toMatchObject({
      kind: 'confirmed',
      commitId: 'commit-seven',
      capturedRevision: 7,
    })
    const restored = openWorkspace({
      path: snapshot.path,
      siteId: 'example',
      writerId: 'writer-one',
    })
    resources.push(restored)
    expect(restored.status().currentRevision).toBe(7)
    expect(restored.operation('sync-seven')).toMatchObject({ kind: 'prepared' })
    workspace.close()
    const reopened = openWorkspace({
      path: database,
      siteId: 'example',
      writerId: 'writer-one',
    })
    resources.push(reopened)
    expect(reopened.status()).toMatchObject({
      currentRevision: 8,
      syncedRevision: 7,
      dirty: true,
    })
  })

  it('preserves stable prepared bytes, rejects conflicting receipts and refuses corrupt databases', async () => {
    const { workspace, directory } = await fixture()
    expect(
      workspace.prepareOperation({
        operationId: 'stable-sync',
        intent: 'exact-ciphertext-reference',
      }),
    ).toMatchObject({ kind: 'prepared' })
    expect(
      workspace.prepareOperation({
        operationId: 'stable-sync',
        intent: 'exact-ciphertext-reference',
      }),
    ).toMatchObject({ kind: 'prepared' })
    expect(() =>
      workspace.prepareOperation({
        operationId: 'stable-sync',
        intent: 'different',
      }),
    ).toThrow(/operation.*conflict/i)
    workspace.recordPreparedPayload({
      operationId: 'stable-sync',
      payload: 'exact encrypted bytes',
    })
    expect(() =>
      workspace.recordPreparedPayload({
        operationId: 'stable-sync',
        payload: 'different encrypted bytes',
      }),
    ).toThrow(/operation.*conflict/i)
    workspace.recordRemoteReceipt({
      operationId: 'stable-sync',
      commitId: 'commit-zero',
      capturedRevision: 0,
      namespace: 'a'.repeat(32),
      headId: 'head-zero',
      sequence: 1,
    })
    expect(() =>
      workspace.recordRemoteReceipt({
        operationId: 'stable-sync',
        commitId: 'other',
        capturedRevision: 0,
        namespace: 'a'.repeat(32),
        headId: 'head-zero',
        sequence: 1,
      }),
    ).toThrow(/operation.*conflict/i)
    const corrupt = path.join(directory, 'corrupt.sqlite')
    await writeFile(corrupt, 'not a SQLite database', { mode: 0o600 })
    expect(() =>
      openWorkspace({
        path: corrupt,
        siteId: 'example',
        writerId: 'writer-one',
      }),
    ).toThrow(WorkspaceError)
    expect(await readFile(corrupt, 'utf8')).toBe('not a SQLite database')
  })
})
