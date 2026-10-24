import type {
  RemoteCommit,
  RemoteConfiguration,
  RemoteHead,
  RemoteIntent,
  SynchronizationResult,
} from './remote-contract'
import { equalBytes, headKey, historyKey, objectKey } from './remote-wire'
import { openCommit, openHead, packPayload } from './remote-records'

type HistoryNode = {
  head: RemoteHead
  commit: RemoteCommit
  ciphertext: { commit: Uint8Array; head: Uint8Array }
}
export type ObservedSource =
  | { kind: 'absent' }
  | { kind: 'unavailable' }
  | ({ kind: 'observed'; etag: string } & HistoryNode)

async function node(
  configuration: RemoteConfiguration,
  body: Uint8Array,
): Promise<HistoryNode | undefined> {
  const { codec, store, namespace } = configuration
  const head = await openHead(codec, body)
  const history = await store.read(historyKey(namespace, head.headId))
  if (!history) return undefined
  if (!equalBytes(history.body, body))
    throw new Error('Private HEAD does not match its immutable history')
  const bytes = await store.read(objectKey(namespace, head.commitId))
  if (!bytes) return undefined
  const commit = await openCommit(codec, head.commitId, bytes.body)
  if (
    head.commitId !== commit.commitId ||
    head.sequence !== commit.sequence ||
    head.operationId !== commit.operationId ||
    head.capturedRevision !== commit.capturedRevision
  )
    throw new Error('Private HEAD and commit disagree')
  return { head, commit, ciphertext: { commit: bytes.body, head: body } }
}

async function verifiedSnapshot(
  configuration: RemoteConfiguration,
  commit: RemoteCommit,
): Promise<Uint8Array | undefined> {
  const { codec, store, namespace } = configuration
  const snapshot = await store.read(objectKey(namespace, commit.snapshotId))
  if (!snapshot) return undefined
  if (codec.digest(snapshot.body) !== commit.snapshotDigest)
    throw new Error('Private snapshot digest mismatch')
  await codec.open({
    purpose: 'snapshot',
    objectId: commit.snapshotId,
    ciphertext: snapshot.body,
  })
  return snapshot.body
}

export async function observeSource(
  configuration: RemoteConfiguration,
  requireClosure = true,
): Promise<ObservedSource> {
  const current = await configuration.store.read(
    headKey(configuration.namespace),
  )
  if (!current) return { kind: 'absent' }
  const verified = await node(configuration, current.body)
  if (
    verified &&
    requireClosure &&
    !(await verifiedSnapshot(configuration, verified.commit))
  )
    return { kind: 'unavailable' }
  return verified
    ? { kind: 'observed', ...verified, etag: current.etag }
    : { kind: 'unavailable' }
}

function matches(head: RemoteHead, intent: RemoteIntent): boolean {
  return (
    head.commitId === intent.commitId &&
    head.headId === intent.headId &&
    head.operationId === intent.operationId &&
    head.capturedRevision === intent.capturedRevision &&
    head.sequence === (intent.parentHead?.sequence ?? 0) + 1 &&
    head.parentHeadId === (intent.parentHead?.headId ?? null)
  )
}

async function confirm(
  configuration: RemoteConfiguration,
  cursor: HistoryNode,
  intent: RemoteIntent,
): Promise<SynchronizationResult> {
  if (
    cursor.commit.parentCommitId !== (intent.parentHead?.commitId ?? null) ||
    cursor.commit.snapshotId !== intent.snapshotId
  )
    throw new Error('Remote operation identity conflict')
  const snapshot = await verifiedSnapshot(configuration, cursor.commit)
  if (!snapshot) return { kind: 'reconciling', operationId: intent.operationId }
  const receipt = {
    operationId: intent.operationId,
    commitId: intent.commitId,
    capturedRevision: intent.capturedRevision,
    namespace: intent.namespace,
    headId: intent.headId,
    sequence: cursor.head.sequence,
  }
  const local = configuration.workspace.operation(intent.operationId)
  if (local?.kind === 'prepared' && local.stage === 'intent')
    configuration.workspace.recordPreparedPayload({
      operationId: intent.operationId,
      payload: JSON.stringify(
        packPayload(intent, cursor.commit, cursor.head, {
          ...cursor.ciphertext,
          snapshot,
        }),
      ),
    })
  configuration.workspace.recordRemoteReceipt(receipt)
  return {
    kind: 'synced',
    operationId: intent.operationId,
    commitId: intent.commitId,
    capturedRevision: intent.capturedRevision,
  }
}

async function parentNode(
  configuration: RemoteConfiguration,
  cursor: HistoryNode,
): Promise<HistoryNode | undefined> {
  if (!cursor.head.parentHeadId) return undefined
  const history = await configuration.store.read(
    historyKey(configuration.namespace, cursor.head.parentHeadId),
  )
  if (!history) return undefined
  const parent = await node(configuration, history.body)
  if (!parent) return undefined
  if (
    parent.head.headId !== cursor.head.parentHeadId ||
    parent.head.sequence + 1 !== cursor.head.sequence ||
    parent.head.commitId !== cursor.commit.parentCommitId
  )
    throw new Error('Private history chain is inconsistent')
  return parent
}

export async function reconcileSource(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
): Promise<SynchronizationResult> {
  const pending = {
    kind: 'reconciling',
    operationId: intent.operationId,
  } as const
  const observed = await observeSource(configuration, false)
  if (observed.kind !== 'observed') return pending
  const remoteCommitId = observed.head.commitId
  let cursor: HistoryNode = observed
  for (let depth = 0; depth < 256; depth++) {
    if (matches(cursor.head, intent))
      return confirm(configuration, cursor, intent)
    if (cursor.head.sequence <= (intent.parentHead?.sequence ?? 0))
      return pending
    if (cursor.head.parentHeadId === null)
      return {
        kind: 'conflict',
        operationId: intent.operationId,
        remoteCommitId,
      }
    const parent = await parentNode(configuration, cursor)
    if (!parent) return pending
    if (parent.head.sequence < (intent.parentHead?.sequence ?? 0) + 1)
      return {
        kind: 'conflict',
        operationId: intent.operationId,
        remoteCommitId,
      }
    cursor = parent
  }
  throw new RemoteHistoryLimitError()
}

export class RemoteHistoryLimitError extends Error {
  readonly code = 'HISTORY_LIMIT'
  constructor() {
    super(
      'Authenticated history exceeds the 256-node proof limit; checkpoint recovery is required',
    )
    this.name = 'RemoteHistoryLimitError'
  }
}
