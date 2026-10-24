import type {
  PreparedRemoteCommit,
  RemoteConfiguration,
  RemoteIntent,
} from './remote-contract'
import { decodeBody, equalBytes, jsonBytes, parsePrepared } from './remote-wire'
import {
  assertPayloadScope,
  makeCommit,
  makeHead,
  openCommit,
  openHead,
  packPayload,
} from './remote-records'

export async function preparePayload(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
): Promise<PreparedRemoteCommit | undefined> {
  const { workspace, codec } = configuration
  if (workspace.status().currentRevision !== intent.capturedRevision)
    return undefined
  const captured = await workspace.capture({
    destination: `${configuration.captureDestination}.${codec.newId()}.sqlite`,
  })
  if (captured.revision !== intent.capturedRevision) return undefined
  if (captured.media.length !== 0)
    throw new Error(
      'Private media closure is not supported by this synchronization slice',
    )
  const snapshot = await codec.protect({
    purpose: 'snapshot',
    objectId: intent.snapshotId,
    body: captured.bytes,
  })
  const commit = makeCommit(intent, codec.digest(snapshot))
  const head = makeHead(intent)
  const commitBody = await codec.protect({
    purpose: 'commit',
    objectId: commit.commitId,
    body: jsonBytes(commit),
  })
  const headBytes = await codec.protect({
    purpose: 'head',
    objectId: 'head',
    body: jsonBytes(head),
  })
  return packPayload(intent, commit, head, {
    snapshot,
    commit: commitBody,
    head: headBytes,
  })
}

export async function verifyPayload(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
  payload: string,
): Promise<PreparedRemoteCommit> {
  const plan = parsePrepared(payload)
  const { codec } = configuration
  assertPayloadScope(plan, intent)
  const [snapshot, commitObject, history] = plan.objects.map((entry) =>
    decodeBody(entry.body),
  )
  if (!snapshot || !commitObject || !history)
    throw new Error('Prepared synchronization closure missing')
  await codec.open({
    purpose: 'snapshot',
    objectId: intent.snapshotId,
    ciphertext: snapshot,
  })
  const commit = await openCommit(codec, intent.commitId, commitObject)
  const head = await openHead(codec, history)
  if (
    !equalBytes(history, decodeBody(plan.headBody)) ||
    JSON.stringify(commit) !== JSON.stringify(plan.commit) ||
    JSON.stringify(head) !== JSON.stringify(plan.head)
  )
    throw new Error('Prepared signed records disagree')
  if (
    JSON.stringify(commit) !==
    JSON.stringify(makeCommit(intent, codec.digest(snapshot)))
  )
    throw new Error('Prepared commit does not match original intent')
  if (JSON.stringify(head) !== JSON.stringify(makeHead(intent)))
    throw new Error('Prepared head does not match original intent')
  return plan
}
