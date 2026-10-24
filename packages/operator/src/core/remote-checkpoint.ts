import type {
  RemoteConfiguration,
  RemoteIntent,
  SynchronizationResult,
} from './remote-contract'
import { reconcileSource } from './remote-history'

export function hasSourceParent(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
): boolean {
  const checkpoint = configuration.workspace.remoteCheckpoint(intent.namespace)
  const parent = intent.parentHead
  return parent === null
    ? checkpoint === undefined
    : checkpoint?.commitId === parent.commitId &&
        checkpoint.headId === parent.headId &&
        checkpoint.sequence === parent.sequence
}

export async function reconcileStaleSource(
  configuration: RemoteConfiguration,
  intent: RemoteIntent,
): Promise<SynchronizationResult> {
  const result = await reconcileSource(configuration, intent)
  if (result.kind === 'synced') return result
  return {
    kind: 'conflict',
    operationId: intent.operationId,
    remoteCommitId:
      configuration.workspace.remoteCheckpoint(intent.namespace)?.commitId ??
      null,
  }
}
