import type {
  AuthorProfileInput,
  LocalState,
  PostDraftInput,
  PublicationSettingsInput,
  TaxonomyTermInput,
} from '@publisher/content'

export type WorkspaceCommand =
  | {
      readonly kind: 'post.upsert'
      readonly id?: string
      readonly input: PostDraftInput
    }
  | {
      readonly kind: 'author.upsert'
      readonly slug?: string
      readonly input: AuthorProfileInput
    }
  | {
      readonly kind: 'taxonomy.upsert'
      readonly collection: 'categories' | 'tags'
      readonly slug?: string
      readonly input: TaxonomyTermInput
    }
  | {
      readonly kind: 'settings.update'
      readonly input: PublicationSettingsInput
    }
  | { readonly kind: 'guidance.update'; readonly markdown: string }

export interface WorkspaceContent {
  readonly content: LocalState
  readonly guidance: string
}

export interface WorkspaceRead extends WorkspaceContent {
  readonly revision: number
}

export interface WorkspaceStatus {
  readonly siteId: string
  readonly currentRevision: number
  readonly syncedRevision: number | null
  readonly dirty: boolean
}

export interface MutationRequest {
  readonly operationId: string
  readonly expectedRevision: number
  readonly command: WorkspaceCommand
}

export interface MutationReceipt {
  readonly operationId: string
  readonly revision: number
}

export interface RemoteCheckpoint {
  readonly commitId: string
  readonly headId: string
  readonly sequence: number
}

export interface RemoteReceipt extends RemoteCheckpoint {
  readonly operationId: string
  readonly capturedRevision: number
  readonly namespace: string
}

export type RemoteOperation =
  | {
      readonly kind: 'prepared'
      readonly stage: 'intent'
      readonly operationId: string
      readonly intent: string
    }
  | {
      readonly kind: 'prepared'
      readonly stage: 'payload'
      readonly operationId: string
      readonly intent: string
      readonly payload: string
    }
  | {
      readonly kind: 'prepared'
      readonly stage: 'unavailable'
      readonly operationId: string
      readonly intent: string
      readonly payloadDigest: string
    }
  | {
      readonly kind: 'confirmed'
      readonly operationId: string
      readonly intent: string
      readonly commitId: string
      readonly capturedRevision: number
      readonly namespace: string
      readonly headId: string
      readonly sequence: number
    }

export interface CapturedWorkspace {
  readonly path: string
  readonly revision: number
  readonly bytes: Uint8Array
  readonly media: readonly []
}

export interface Workspace {
  status(): WorkspaceStatus
  read(): WorkspaceRead
  execute(request: MutationRequest): MutationReceipt
  close(): void
}

export interface InternalSyncWorkspace extends Workspace {
  operation(operationId: string): RemoteOperation | undefined
  remoteCheckpoint(namespace: string): RemoteCheckpoint | undefined
  preparationMayResume(): boolean
  prepareOperation(input: {
    readonly operationId: string
    readonly intent: string
  }): RemoteOperation
  recordPreparedPayload(input: {
    readonly operationId: string
    readonly payload: string
  }): RemoteOperation
  recordRemoteReceipt(input: RemoteReceipt): void
  capture(input: { readonly destination: string }): Promise<CapturedWorkspace>
}

export interface WorkspaceIdentity {
  readonly name: string
  readonly canonicalOrigin: string
  readonly themeId: string
}

export interface WorkspaceLocation {
  readonly path: string
  readonly siteId: string
  readonly writerId: string
}

export interface WorkspaceState extends WorkspaceStatus {
  readonly writerId: string
  readonly data: WorkspaceContent
}

export interface StoredMutation extends MutationReceipt {
  readonly fingerprint: string
}

export interface WorkspaceStore {
  readState(): WorkspaceState
  writeSource(data: WorkspaceContent, revision: number): void
  transaction<T>(run: () => T): T
  mutation(operationId: string): StoredMutation | undefined
  putMutation(receipt: StoredMutation): void
  operation(operationId: string): RemoteOperation | undefined
  remoteCheckpoint(namespace: string): RemoteCheckpoint | undefined
  preparationMayResume(): boolean
  putOperation(operation: RemoteOperation): void
  putPreparedPayload(input: {
    readonly operationId: string
    readonly payload: string
  }): void
  confirmOperation(input: RemoteReceipt): void
  capture(destination: string): Promise<CapturedWorkspace>
  close(): void
}
