import type { DatabaseSync } from 'node:sqlite'
import type {
  RemoteCheckpoint,
  RemoteOperation,
  RemoteReceipt,
} from '../core/workspace-types'
import { rowRevision, rowString, sqliteFailure } from './sqlite-codec'
import { spoolDigest, SqliteOperationSpool } from './sqlite-spool'

export class SqliteOperationLedger {
  private readonly spool: SqliteOperationSpool
  constructor(
    private readonly db: DatabaseSync,
    path: string,
  ) {
    const siteId = rowString(
      db.prepare('SELECT site_id FROM workspace WHERE singleton=1').get()
        ?.site_id,
    )
    this.spool = new SqliteOperationSpool(path, siteId)
  }

  operation(operationId: string): RemoteOperation | undefined {
    const row = this.db
      .prepare('SELECT * FROM operations WHERE operation_id=?')
      .get(operationId)
    if (!row) return undefined
    const base = { operationId, intent: rowString(row.intent) }
    if (row.commit_id !== null)
      return {
        kind: 'confirmed',
        ...base,
        commitId: rowString(row.commit_id),
        capturedRevision: rowRevision(row.captured_revision),
        namespace: rowString(row.namespace),
        headId: rowString(row.head_id),
        sequence: rowRevision(row.sequence),
      }
    const expected =
      row.payload_digest === null ? undefined : rowString(row.payload_digest)
    const stored = this.spool.read(operationId, base.intent, expected)
    if (!stored)
      return expected === undefined
        ? { kind: 'prepared', stage: 'intent', ...base }
        : {
            kind: 'prepared',
            stage: 'unavailable',
            ...base,
            payloadDigest: expected,
          }
    if (expected === undefined)
      this.db
        .prepare(
          'UPDATE operations SET payload_digest=? WHERE operation_id=? AND payload_digest IS NULL',
        )
        .run(stored.digest, operationId)
    return {
      kind: 'prepared',
      stage: 'payload',
      ...base,
      payload: stored.payload,
    }
  }

  putOperation(operation: RemoteOperation): void {
    this.db
      .prepare('INSERT INTO operations (operation_id,intent) VALUES (?,?)')
      .run(operation.operationId, operation.intent)
  }

  putPreparedPayload(input: { operationId: string; payload: string }): void {
    const prior = this.db
      .prepare(
        'SELECT intent,payload_digest FROM operations WHERE operation_id=?',
      )
      .get(input.operationId)
    if (
      !prior ||
      (prior.payload_digest !== null &&
        prior.payload_digest !== spoolDigest(input.payload))
    )
      throw sqliteFailure(
        'OPERATION_CONFLICT',
        'operation spool identity conflict',
      )
    const digest = this.spool.write(
      input.operationId,
      rowString(prior.intent),
      input.payload,
    )
    this.db
      .prepare('UPDATE operations SET payload_digest=? WHERE operation_id=?')
      .run(digest, input.operationId)
  }

  remoteCheckpoint(namespace: string): RemoteCheckpoint | undefined {
    const row = this.db
      .prepare('SELECT * FROM remote_checkpoints WHERE namespace=?')
      .get(namespace)
    return row
      ? {
          commitId: rowString(row.commit_id),
          headId: rowString(row.head_id),
          sequence: rowRevision(row.sequence),
        }
      : undefined
  }

  private advanceCheckpoint(input: RemoteReceipt): void {
    const point = this.remoteCheckpoint(input.namespace)
    if (
      (!point && input.sequence !== 1) ||
      (point && input.sequence > point.sequence + 1)
    )
      throw sqliteFailure(
        'OPERATION_CONFLICT',
        'remote checkpoint sequence gap',
      )
    if (
      point &&
      input.sequence === point.sequence &&
      (point.commitId !== input.commitId || point.headId !== input.headId)
    )
      throw sqliteFailure(
        'OPERATION_CONFLICT',
        'remote checkpoint identity conflict',
      )
    this.db
      .prepare(
        'INSERT INTO remote_checkpoints VALUES (?,?,?,?) ON CONFLICT(namespace) DO UPDATE SET commit_id=excluded.commit_id,head_id=excluded.head_id,sequence=excluded.sequence WHERE excluded.sequence > remote_checkpoints.sequence',
      )
      .run(input.namespace, input.commitId, input.headId, input.sequence)
  }

  confirmOperation(input: RemoteReceipt): void {
    this.advanceCheckpoint(input)
    this.db
      .prepare(
        'UPDATE operations SET commit_id=?,captured_revision=?,namespace=?,head_id=?,sequence=? WHERE operation_id=?',
      )
      .run(
        input.commitId,
        input.capturedRevision,
        input.namespace,
        input.headId,
        input.sequence,
        input.operationId,
      )
    this.db
      .prepare(
        'UPDATE workspace SET synced_revision = MAX(COALESCE(synced_revision,0), ?) WHERE singleton=1',
      )
      .run(input.capturedRevision)
  }
}
