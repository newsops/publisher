import type {
  PreparedRemoteCommit,
  PrivateObjectCodec,
  RemoteCommit,
  RemoteHead,
  RemoteIntent,
} from './remote-contract'
import {
  decodeJson,
  encodeBody,
  historyKey,
  objectKey,
  parseCommit,
  parseHead,
} from './remote-wire'

export async function openHead(
  codec: PrivateObjectCodec,
  ciphertext: Uint8Array,
) {
  return parseHead(
    decodeJson(
      await codec.open({ purpose: 'head', objectId: 'head', ciphertext }),
    ),
  )
}

export async function openCommit(
  codec: PrivateObjectCodec,
  objectId: string,
  ciphertext: Uint8Array,
) {
  return parseCommit(
    decodeJson(await codec.open({ purpose: 'commit', objectId, ciphertext })),
  )
}

export function makeCommit(
  intent: RemoteIntent,
  snapshotDigest: string,
): RemoteCommit {
  return {
    schema: 1,
    commitId: intent.commitId,
    operationId: intent.operationId,
    capturedRevision: intent.capturedRevision,
    sequence: (intent.parentHead?.sequence ?? 0) + 1,
    parentCommitId: intent.parentHead?.commitId ?? null,
    snapshotId: intent.snapshotId,
    snapshotDigest,
  }
}

export function makeHead(intent: RemoteIntent): RemoteHead {
  return {
    schema: 1,
    headId: intent.headId,
    commitId: intent.commitId,
    operationId: intent.operationId,
    capturedRevision: intent.capturedRevision,
    sequence: (intent.parentHead?.sequence ?? 0) + 1,
    parentHeadId: intent.parentHead?.headId ?? null,
  }
}

export function packPayload(
  intent: RemoteIntent,
  commit: RemoteCommit,
  head: RemoteHead,
  bytes: { snapshot: Uint8Array; commit: Uint8Array; head: Uint8Array },
): PreparedRemoteCommit {
  return {
    schema: 1,
    siteId: intent.siteId,
    namespace: intent.namespace,
    operationId: intent.operationId,
    capturedRevision: intent.capturedRevision,
    expectedEtag: intent.expectedEtag,
    commit,
    head,
    objects: [
      {
        key: objectKey(intent.namespace, intent.snapshotId),
        body: encodeBody(bytes.snapshot),
      },
      {
        key: objectKey(intent.namespace, intent.commitId),
        body: encodeBody(bytes.commit),
      },
      {
        key: historyKey(intent.namespace, intent.headId),
        body: encodeBody(bytes.head),
      },
    ],
    headBody: encodeBody(bytes.head),
  }
}

export function assertPayloadScope(
  plan: PreparedRemoteCommit,
  intent: RemoteIntent,
) {
  if (
    plan.siteId !== intent.siteId ||
    plan.namespace !== intent.namespace ||
    plan.operationId !== intent.operationId ||
    plan.capturedRevision !== intent.capturedRevision ||
    plan.expectedEtag !== intent.expectedEtag
  )
    throw new Error('Prepared synchronization context mismatch')
  const keys = [
    objectKey(intent.namespace, intent.snapshotId),
    objectKey(intent.namespace, intent.commitId),
    historyKey(intent.namespace, intent.headId),
  ]
  if (plan.objects.some((entry, index) => entry.key !== keys[index]))
    throw new Error('Prepared synchronization closure mismatch')
}
