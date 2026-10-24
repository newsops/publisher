import type {
  PreparedRemoteCommit,
  RemoteConfiguration,
  RemoteIntent,
  SynchronizationResult,
} from './remote-contract'
import { observeSource, reconcileSource } from './remote-history'
import { preparePayload, verifyPayload } from './remote-plan'
import { decodeBody, equalBytes, headKey, parseIntent } from './remote-wire'
import { hasSourceParent, reconcileStaleSource } from './remote-checkpoint'

async function storeClosure(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
  plan: PreparedRemoteCommit,
): Promise<boolean> {
  for (const object of plan.objects) {
    const body = decodeBody(object.body)
    if (!hasSourceParent(configuration, intent)) return false
    const result = await configuration.store.create(object.key, body)
    if (result.kind === 'stored') continue
    const observed = await configuration.store.read(object.key)
    if (!observed) return false
    if (!equalBytes(body, observed.body))
      throw new Error('Immutable private object collision or corruption')
  }
  return true
}

async function initialIntent(
  configuration: RemoteConfiguration,
  operationId: string,
): Promise<RemoteIntent | SynchronizationResult> {
  const observed = await observeSource(configuration)
  if (observed.kind === 'unavailable')
    return { kind: 'reconciling', operationId }
  const { workspace, codec, namespace } = configuration
  const checkpoint = workspace.remoteCheckpoint(namespace)
  if (
    observed.kind === 'absent'
      ? Boolean(checkpoint)
      : !checkpoint ||
        checkpoint.commitId !== observed.head.commitId ||
        checkpoint.headId !== observed.head.headId ||
        checkpoint.sequence !== observed.head.sequence
  )
    return {
      kind: 'conflict',
      operationId,
      remoteCommitId:
        observed.kind === 'observed' ? observed.head.commitId : null,
    }
  const intent: RemoteIntent = {
    schema: 1,
    kind: 'remote-sync',
    siteId: workspace.status().siteId,
    namespace,
    operationId,
    capturedRevision: workspace.status().currentRevision,
    expectedEtag: observed.kind === 'observed' ? observed.etag : null,
    parentHead: observed.kind === 'observed' ? observed.head : null,
    commitId: codec.newId(),
    snapshotId: codec.newId(),
    headId: codec.newId(),
  }
  workspace.prepareOperation({ operationId, intent: JSON.stringify(intent) })
  return intent
}

function validateIntent(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
  operationId: string,
) {
  if (
    intent.siteId !== configuration.workspace.status().siteId ||
    intent.namespace !== configuration.namespace ||
    intent.operationId !== operationId
  )
    throw new Error('Operation identity or synchronization scope conflict')
}

async function publishPrepared(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
  payload: string,
): Promise<SynchronizationResult> {
  if (!hasSourceParent(configuration, intent))
    return reconcileStaleSource(configuration, intent)
  const plan = await verifyPayload(configuration, intent, payload)
  if (!(await storeClosure(configuration, intent, plan)))
    return hasSourceParent(configuration, intent)
      ? { kind: 'reconciling', operationId: intent.operationId }
      : reconcileStaleSource(configuration, intent)
  const body = decodeBody(plan.headBody)
  if (!hasSourceParent(configuration, intent))
    return reconcileStaleSource(configuration, intent)
  if (plan.expectedEtag === null)
    await configuration.store.create(headKey(configuration.namespace), body)
  else
    await configuration.store.replace(
      headKey(configuration.namespace),
      body,
      plan.expectedEtag,
    )
  return reconcileSource(configuration, intent)
}

async function push(
  configuration: RemoteConfiguration,
  operationId: string,
): Promise<SynchronizationResult> {
  const pending: SynchronizationResult = {
    kind: 'reconciling',
    operationId,
  }
  const previous = configuration.workspace.operation(operationId)
  const intent = previous
    ? parseIntent(previous.intent)
    : await initialIntent(configuration, operationId)
  if (intent.kind !== 'remote-sync') return intent
  validateIntent(configuration, intent, operationId)
  if (previous?.kind === 'confirmed')
    return {
      kind: 'synced',
      operationId,
      commitId: previous.commitId,
      capturedRevision: previous.capturedRevision,
    }
  if (previous?.stage === 'unavailable')
    return reconcileSource(configuration, intent)
  let payload = previous?.stage === 'payload' ? previous.payload : undefined
  if (!payload) {
    if (previous?.stage === 'intent') {
      const reconciled = await reconcileSource(configuration, intent)
      if (
        reconciled.kind !== 'reconciling' ||
        !configuration.workspace.preparationMayResume()
      )
        return reconciled
    }
    const prepared = await preparePayload(configuration, intent)
    if (!prepared)
      return {
        kind: 'preparation-failed',
        operationId,
        reason: 'source-changed',
      }
    payload = JSON.stringify(prepared)
    configuration.workspace.recordPreparedPayload({ operationId, payload })
  }
  return publishPrepared(configuration, intent, payload)
}

export function createRemoteSynchronizer(configuration: RemoteConfiguration) {
  if (!/^[a-f0-9]{32}$/.test(configuration.namespace))
    throw new Error('Private namespace must be an opaque 128-bit identity')
  if (configuration.codec.siteId !== configuration.workspace.status().siteId)
    throw new Error('Workspace and encryption site disagree')
  return {
    push: ({ operationId }: { operationId: string }) =>
      push(configuration, operationId),
  }
}
