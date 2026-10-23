import type { ConditionalByteStore } from '@publisher/persistence'
import type { RemoteOperation } from './workspace-types'

export type PrivatePurpose = 'snapshot' | 'media' | 'commit' | 'head'
export type PrivateContext = { purpose: PrivatePurpose; objectId: string }
export type PrivateObjectCodec = {
  readonly siteId: string
  protect(input: PrivateContext & { body: Uint8Array }): Promise<Uint8Array>
  open(input: PrivateContext & { ciphertext: Uint8Array }): Promise<Uint8Array>
  newId(): string
  digest(body: Uint8Array): string
}

export type SynchronizableWorkspace = {
  status(): {
    siteId: string
    currentRevision: number
    syncedRevision: number | null
    dirty: boolean
  }
  operation(operationId: string): RemoteOperation | undefined
  remoteCheckpoint(
    namespace: string,
  ): { commitId: string; headId: string; sequence: number } | undefined
  preparationMayResume(): boolean
  prepareOperation(input: {
    operationId: string
    intent: string
  }): RemoteOperation
  recordPreparedPayload(input: {
    operationId: string
    payload: string
  }): RemoteOperation
  recordRemoteReceipt(input: {
    operationId: string
    commitId: string
    capturedRevision: number
    namespace: string
    headId: string
    sequence: number
  }): void
  capture(input: { destination: string }): Promise<{
    path: string
    revision: number
    bytes: Uint8Array
    media: readonly []
  }>
}

export type SynchronizationResult =
  | {
      kind: 'synced'
      operationId: string
      commitId: string
      capturedRevision: number
    }
  | { kind: 'reconciling'; operationId: string }
  | { kind: 'conflict'; operationId: string; remoteCommitId: string | null }
  | {
      kind: 'preparation-failed'
      operationId: string
      reason: 'source-changed'
    }

export type RemoteConfiguration = {
  workspace: SynchronizableWorkspace
  store: ConditionalByteStore
  codec: PrivateObjectCodec
  namespace: string
  captureDestination: string
}

export type RemoteCommit = {
  schema: 1
  commitId: string
  operationId: string
  capturedRevision: number
  sequence: number
  parentCommitId: string | null
  snapshotId: string
  snapshotDigest: string
}

export type RemoteHead = {
  schema: 1
  headId: string
  commitId: string
  operationId: string
  capturedRevision: number
  sequence: number
  parentHeadId: string | null
}

export type PreparedRemoteCommit = {
  schema: 1
  siteId: string
  namespace: string
  operationId: string
  capturedRevision: number
  expectedEtag: string | null
  commit: RemoteCommit
  head: RemoteHead
  objects: { key: string; body: string }[]
  headBody: string
}

export type RemoteIntent = {
  schema: 1
  kind: 'remote-sync'
  siteId: string
  namespace: string
  operationId: string
  capturedRevision: number
  expectedEtag: string | null
  parentHead: RemoteHead | null
  commitId: string
  snapshotId: string
  headId: string
}
