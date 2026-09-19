import { ServiceError as ApiRequestError } from './errors'
import { assertSiteId } from '@publisher/content'

export type ModerationStatus = 'pending' | 'approved' | 'rejected'

export interface ModerationComment {
  readonly id: string
  readonly slug: string
  readonly authorName: string
  readonly body: string
  readonly status: ModerationStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export function moderationListPath(
  siteId: string,
  status: ModerationStatus,
): string {
  assertSiteId(siteId)
  return `/v1/sites/${encodeURIComponent(siteId)}/moderation/comments?status=${status}`
}

export function moderationUpdatePath(
  siteId: string,
  commentId: string,
): string {
  assertSiteId(siteId)
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(commentId))
    throw new ApiRequestError('invalid_comment_id', 'Invalid comment id', 400)
  return `/v1/sites/${encodeURIComponent(siteId)}/moderation/comments/${encodeURIComponent(commentId)}`
}

const REQUEST_TIMEOUT_MS = 5_000

function commentServiceConfig(): { origin: string; token: string } {
  const origin = process.env.COMMENTS_ORIGIN?.replace(/\/$/, '')
  const token = process.env.COMMENTS_MODERATION_TOKEN
  if (!origin || !token)
    throw new ApiRequestError(
      'comments_unconfigured',
      'Comment moderation is not configured',
      503,
    )
  return { origin, token }
}

export async function requestCommentService(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const { origin, token } = commentServiceConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)
  try {
    return await fetch(`${origin}${pathname}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch {
    throw new ApiRequestError(
      'comments_unavailable',
      'Comment service is unavailable',
      503,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function forwardCommentResponse(
  response: Response,
): Promise<Response> {
  const text = await response.text()
  let payload: unknown = {
    error: 'Comment service returned an invalid response',
  }
  try {
    payload = JSON.parse(text) as unknown
  } catch {
    // Keep the upstream boundary JSON-only and avoid forwarding arbitrary HTML.
  }
  return Response.json(payload, {
    status: response.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
