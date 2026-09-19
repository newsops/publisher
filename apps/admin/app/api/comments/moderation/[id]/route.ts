import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../../lib/http/auth'
import {
  forwardCommentResponse,
  moderationUpdatePath,
  requestCommentService,
} from '../../../../lib/services/comment-moderation'
import { authorizedSiteId } from '../../../../lib/http/request-repository'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'editor')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const { id } = await context.params
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id))
      return Response.json(
        { error: 'Invalid comment id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    const body = (await request.json().catch(() => ({}))) as {
      status?: unknown
    }
    if (body.status !== 'approved' && body.status !== 'rejected')
      return Response.json(
        { error: 'Moderation status must be approved or rejected' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    const response = await requestCommentService(
      moderationUpdatePath(authorizedSiteId(request, identity, 'editor'), id),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: body.status }),
      },
    )
    audit('comment.moderation.updated', identity, {
      commentId: id,
      status: body.status,
      upstreamStatus: response.status,
    })
    return forwardCommentResponse(response)
  } catch (error) {
    return authErrorResponse(error)
  }
}
