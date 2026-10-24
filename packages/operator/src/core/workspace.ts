import { createHash } from 'node:crypto'
import { applyWorkspaceCommand } from './workspace-content'
import { WorkspaceError } from '../contracts/errors'
import { publicWorkspaceView } from './workspace-ports'
import type {
  MutationRequest,
  RemoteOperation,
  Workspace,
  WorkspaceStore,
  InternalSyncWorkspace,
  RemoteReceipt,
} from './workspace-types'

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId))
    throw new WorkspaceError('VALIDATION', 'invalid operation identity')
}

function mutationFingerprint(request: MutationRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        expectedRevision: request.expectedRevision,
        command: request.command,
      }),
    )
    .digest('hex')
}

class LocalWorkspace implements InternalSyncWorkspace {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly writerId: string,
  ) {}

  private assertWriter(): void {
    if (this.store.readState().writerId !== this.writerId)
      throw new WorkspaceError('AUTHORITY', 'workspace writer authority denied')
  }

  status() {
    const { siteId, currentRevision, syncedRevision, dirty } =
      this.store.readState()
    return { siteId, currentRevision, syncedRevision, dirty }
  }

  read() {
    const { data, currentRevision } = this.store.readState()
    return { ...structuredClone(data), revision: currentRevision }
  }

  execute(request: MutationRequest) {
    return this.store.transaction(() => {
      this.assertWriter()
      assertOperationId(request.operationId)
      const fingerprint = mutationFingerprint(request)
      const prior = this.store.mutation(request.operationId)
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new WorkspaceError(
            'OPERATION_CONFLICT',
            'operation identity conflict',
          )
        return { operationId: prior.operationId, revision: prior.revision }
      }
      if (this.store.operation(request.operationId))
        throw new WorkspaceError(
          'OPERATION_CONFLICT',
          'operation identity conflict',
        )
      const state = this.store.readState()
      if (
        !Number.isSafeInteger(request.expectedRevision) ||
        request.expectedRevision !== state.currentRevision
      )
        throw new WorkspaceError(
          'REVISION_CONFLICT',
          'workspace revision conflict',
        )
      const data = applyWorkspaceCommand(state.data, request.command)
      const revision = state.currentRevision + 1
      this.store.writeSource(data, revision)
      this.store.putMutation({
        operationId: request.operationId,
        fingerprint,
        revision,
      })
      return { operationId: request.operationId, revision }
    })
  }

  operation(operationId: string) {
    assertOperationId(operationId)
    return this.store.transaction(() => {
      this.assertWriter()
      return this.store.operation(operationId)
    })
  }

  remoteCheckpoint(namespace: string) {
    this.assertWriter()
    return this.store.remoteCheckpoint(namespace)
  }
  preparationMayResume() {
    return this.store.preparationMayResume()
  }

  prepareOperation(input: {
    operationId: string
    intent: string
  }): RemoteOperation {
    return this.store.transaction(() => {
      this.assertWriter()
      assertOperationId(input.operationId)
      if (!input.intent || this.store.mutation(input.operationId))
        throw new WorkspaceError(
          'OPERATION_CONFLICT',
          'operation identity conflict',
        )
      const prior = this.store.operation(input.operationId)
      if (prior && prior.intent !== input.intent)
        throw new WorkspaceError(
          'OPERATION_CONFLICT',
          'operation identity conflict',
        )
      if (prior) return prior
      const prepared = {
        kind: 'prepared',
        stage: 'intent',
        ...input,
      } satisfies RemoteOperation
      this.store.putOperation(prepared)
      return prepared
    })
  }

  recordPreparedPayload(input: {
    operationId: string
    payload: string
  }): RemoteOperation {
    return this.store.transaction(() => {
      this.assertWriter()
      assertOperationId(input.operationId)
      const prior = this.store.operation(input.operationId)
      if (!prior)
        throw new WorkspaceError('MISSING', 'prepared operation missing')
      if (!input.payload)
        throw new WorkspaceError(
          'VALIDATION',
          'prepared payload must not be empty',
        )
      if (prior.kind === 'confirmed')
        throw new WorkspaceError(
          'OPERATION_CONFLICT',
          'operation already confirmed',
        )
      if (prior.stage === 'payload') {
        if (prior.payload !== input.payload)
          throw new WorkspaceError(
            'OPERATION_CONFLICT',
            'operation payload conflict',
          )
        return prior
      }
      this.store.putPreparedPayload(input)
      return {
        kind: 'prepared',
        stage: 'payload',
        operationId: prior.operationId,
        intent: prior.intent,
        payload: input.payload,
      }
    })
  }

  recordRemoteReceipt(input: RemoteReceipt): void {
    this.store.transaction(() => {
      this.assertWriter()
      assertOperationId(input.operationId)
      const prior = this.store.operation(input.operationId)
      if (!prior)
        throw new WorkspaceError('MISSING', 'prepared operation missing')
      if (prior.kind === 'prepared' && prior.stage === 'intent')
        throw new WorkspaceError(
          'MISSING',
          'prepared operation payload metadata missing',
        )
      if (
        !input.commitId ||
        !/^[a-f0-9]{32}$/.test(input.namespace) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(input.headId) ||
        !Number.isSafeInteger(input.sequence) ||
        input.sequence < 1 ||
        !Number.isSafeInteger(input.capturedRevision) ||
        input.capturedRevision < 0 ||
        input.capturedRevision > this.store.readState().currentRevision
      )
        throw new WorkspaceError(
          'VALIDATION',
          'invalid captured revision or commit identity',
        )
      if (
        prior.kind === 'confirmed' &&
        (prior.commitId !== input.commitId ||
          prior.capturedRevision !== input.capturedRevision ||
          prior.namespace !== input.namespace ||
          prior.headId !== input.headId ||
          prior.sequence !== input.sequence)
      )
        throw new WorkspaceError(
          'OPERATION_CONFLICT',
          'operation receipt conflict',
        )
      this.store.confirmOperation(input)
    })
  }

  capture({ destination }: { destination: string }) {
    this.assertWriter()
    return this.store.capture(destination)
  }
  close(): void {
    this.store.close()
  }
}

export function workspaceFromStore(
  store: WorkspaceStore,
  writerId: string,
): Workspace {
  return publicWorkspaceView(new LocalWorkspace(store, writerId))
}
