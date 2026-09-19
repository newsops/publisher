import {
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../lib/http/auth'
import {
  forwardCommentResponse,
  moderationListPath,
  requestCommentService,
} from '../../../lib/services/comment-moderation'
import { authorizedSiteId } from '../../../lib/http/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'editor')
    enforceRateLimit(request, identity)
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    if (!['pending', 'approved', 'rejected'].includes(status))
      return Response.json(
        { error: 'Invalid moderation status' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    const response = await requestCommentService(
      moderationListPath(
        authorizedSiteId(request, identity, 'editor'),
        status as 'pending' | 'approved' | 'rejected',
      ),
    )
    return forwardCommentResponse(response)
  } catch (error) {
    return authErrorResponse(error)
  }
}
