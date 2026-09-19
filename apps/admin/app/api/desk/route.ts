import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
  AdminAuthError,
} from '../../lib/auth'
import {
  DeskDecisionError,
  decideDesk,
  deskReportFor,
  deskReviewerFor,
  parseDeskDecision,
} from '../../lib/desk-review'
import {
  repositoryForRequest,
  requestedSiteId,
} from '../../lib/request-repository'

/** Browser desk routes (EDIT-001) for the admin Desk panel. */
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const siteId = requestedSiteId(request)
    const postId = new URL(request.url).searchParams.get('post')
    const repository = repositoryForRequest(request, identity)
    if (!postId) {
      const posts = (await repository.list()).filter(
        (post) => post.status === 'review' || post.status === 'draft',
      )
      return Response.json(
        {
          siteId,
          queue: posts.map((post) => ({
            id: post.id,
            slug: post.slug,
            title: post.title,
            status: post.status,
            revision: post.revision,
            updatedAt: post.updatedAt,
            review: post.deskReview,
          })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const post = await repository.get(postId)
    if (!post)
      return Response.json({ error: 'Post not found' }, { status: 404 })
    return Response.json(
      {
        siteId,
        postId,
        revision: post.revision,
        status: post.status,
        report: await deskReportFor(siteId, post),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const siteId = requestedSiteId(request)
    const body = (await request.json()) as {
      postId?: unknown
      revision?: unknown
    }
    if (typeof body.postId !== 'string')
      return Response.json({ error: 'postId is required' }, { status: 400 })
    const current = await repositoryForRequest(request, identity).get(
      body.postId,
    )
    if (!current)
      return Response.json({ error: 'Post not found' }, { status: 404 })
    if (body.revision !== current.revision)
      return Response.json(
        { error: 'The post changed; reload it before deciding' },
        { status: 409 },
      )
    const decision = parseDeskDecision(body)
    const result = await decideDesk(
      siteId,
      body.postId,
      decision,
      deskReviewerFor(identity),
    )
    audit(
      decision.action === 'approve'
        ? 'content.site.desk.approved'
        : 'content.site.desk.changes_requested',
      identity,
      { siteId, postId: body.postId, revision: result.post.revision },
    )
    return Response.json({
      siteId,
      postId: body.postId,
      revision: result.post.revision,
      status: result.post.status,
      report: result.report,
    })
  } catch (error) {
    if (error instanceof DeskDecisionError)
      return Response.json(
        { error: error.message, code: error.code, report: error.report },
        { status: error.status },
      )
    if (error instanceof AdminAuthError) return authErrorResponse(error)
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Desk decision failed',
      },
      { status: 400 },
    )
  }
}
