import { closeSync, fsyncSync, openSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import type {
  CapturedWorkspace,
  RemoteOperation,
  StoredMutation,
  WorkspaceContent,
  WorkspaceState,
  WorkspaceStore,
  RemoteReceipt,
} from '../core/workspace-types'
import {
  decodeContent,
  encodeContent,
  rowRevision,
  rowString,
  sqliteFailure,
} from './sqlite-codec'
import { SqliteOperationLedger } from './sqlite-operations'

function flushCapture(path: string): void {
  const file = openSync(path, 'r')
  try {
    fsyncSync(file)
  } finally {
    closeSync(file)
  }
  const directory = openSync(dirname(path), 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  private closed = false
  private readonly ledger: SqliteOperationLedger
  constructor(
    private readonly db: DatabaseSync,
    private readonly path: string,
  ) {
    this.ledger = new SqliteOperationLedger(db, path)
  }

  readState(): WorkspaceState {
    const row = this.db
      .prepare('SELECT * FROM workspace WHERE singleton=1')
      .get()
    if (!row) throw sqliteFailure('CORRUPT', 'workspace authority row missing')
    const currentRevision = rowRevision(row.revision)
    const syncedRevision =
      row.synced_revision === null ? null : rowRevision(row.synced_revision)
    const siteId = rowString(row.site_id)
    const data = decodeContent(row.payload, row.digest)
    if (
      data.content.siteId !== siteId ||
      (syncedRevision !== null && syncedRevision > currentRevision)
    )
      throw sqliteFailure('CORRUPT', 'corrupt workspace authority metadata')
    return {
      siteId,
      writerId: rowString(row.writer_id),
      currentRevision,
      syncedRevision,
      dirty: currentRevision !== syncedRevision,
      data,
    }
  }

  writeSource(data: WorkspaceContent, revision: number): void {
    const encoded = encodeContent(data)
    this.db
      .prepare(
        'UPDATE workspace SET payload=?, digest=?, revision=? WHERE singleton=1',
      )
      .run(encoded.payload, encoded.digest, revision)
  }

  transaction<T>(run: () => T): T {
    try {
      this.db.exec('BEGIN IMMEDIATE')
    } catch (error) {
      if (
        error instanceof Error &&
        'errcode' in error &&
        (error.errcode === 5 || error.errcode === 6)
      )
        throw sqliteFailure('BUSY', 'workspace busy; retry the same operation')
      throw error
    }
    try {
      const result = run()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  mutation(operationId: string): StoredMutation | undefined {
    const row = this.db
      .prepare('SELECT * FROM mutations WHERE operation_id=?')
      .get(operationId)
    return row
      ? {
          operationId,
          fingerprint: rowString(row.fingerprint),
          revision: rowRevision(row.revision),
        }
      : undefined
  }

  putMutation(receipt: StoredMutation): void {
    this.db
      .prepare('INSERT INTO mutations VALUES (?, ?, ?)')
      .run(receipt.operationId, receipt.fingerprint, receipt.revision)
  }

  operation(operationId: string): RemoteOperation | undefined {
    return this.ledger.operation(operationId)
  }

  remoteCheckpoint(namespace: string) {
    return this.ledger.remoteCheckpoint(namespace)
  }

  preparationMayResume(): boolean {
    return (
      this.db
        .prepare('SELECT recovery_copy FROM workspace WHERE singleton=1')
        .get()?.recovery_copy === 0
    )
  }

  putOperation(operation: RemoteOperation): void {
    this.ledger.putOperation(operation)
  }

  putPreparedPayload(input: { operationId: string; payload: string }): void {
    this.ledger.putPreparedPayload(input)
  }

  confirmOperation(input: RemoteReceipt): void {
    this.ledger.confirmOperation(input)
  }

  async capture(destination: string): Promise<CapturedWorkspace> {
    const descriptor = openSync(destination, 'wx', 0o600)
    closeSync(descriptor)
    const source = new DatabaseSync(this.path, { readOnly: true })
    try {
      await backup(source, destination)
    } finally {
      source.close()
    }
    const marker = new DatabaseSync(destination)
    try {
      marker.exec(
        'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; UPDATE workspace SET recovery_copy=1 WHERE singleton=1',
      )
    } finally {
      marker.close()
    }
    flushCapture(destination)
    const image = new DatabaseSync(destination, { readOnly: true })
    try {
      const captured = new SqliteWorkspaceStore(image, destination).readState()
      const text = JSON.stringify({
        posts: captured.data.content.posts,
        authors: captured.data.content.authors,
      })
      if (/(?:\/media\/|\\u002[fF]media\\u002[fF])/.test(text))
        throw sqliteFailure(
          'UNSUPPORTED',
          'local media closure is not implemented; capture refused',
        )
      return {
        path: destination,
        revision: captured.currentRevision,
        bytes: new Uint8Array(await readFile(destination)),
        media: [],
      }
    } finally {
      image.close()
    }
  }

  close(): void {
    if (!this.closed) {
      this.db.close()
      this.closed = true
    }
  }
}
