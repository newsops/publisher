export type WorkspaceErrorCode =
  | 'VALIDATION'
  | 'REVISION_CONFLICT'
  | 'OPERATION_CONFLICT'
  | 'AUTHORITY'
  | 'BUSY'
  | 'CORRUPT'
  | 'MISSING'
  | 'EXISTS'
  | 'UNSUPPORTED'

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}
