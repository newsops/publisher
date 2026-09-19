/**
 * Domain error carried from services to every surface. `code` is stable for
 * clients and `status` is the HTTP mapping the surfaces apply; the HTTP layer
 * re-exports it as `ApiRequestError`.
 */
export class ServiceError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
  }
}
