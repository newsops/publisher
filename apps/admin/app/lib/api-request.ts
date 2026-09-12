import { AutomationApiError } from './automation-auth'

const maximumBodyBytes = 1024 * 1024

export async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json'))
    throw new AutomationApiError(
      'unsupported_media_type',
      'Content-Type must be application/json',
      415,
    )
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > maximumBodyBytes)
    throw new AutomationApiError(
      'body_too_large',
      'Request body is too large',
      413,
    )
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > maximumBodyBytes)
    throw new AutomationApiError(
      'body_too_large',
      'Request body is too large',
      413,
    )
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AutomationApiError(
      'invalid_json',
      'Request body is not valid JSON',
      400,
    )
  }
}

export function revisionFrom(request: Request, resource = 'post'): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new AutomationApiError(
      'revision_required',
      `If-Match must contain the current ${resource} revision`,
      428,
    )
  return Number(value)
}

export function validatePagination(request: Request): {
  limit: number
  offset: number
} {
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? 20)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    throw new AutomationApiError(
      'invalid_pagination',
      'limit must be 1..100 and offset must be a non-negative integer',
      400,
    )
  return { limit, offset }
}
