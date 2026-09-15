import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/auth'
import { repositoryForRequest } from '../../lib/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    return Response.json(
      {
        categories: await repositoryForRequest(
          request,
          identity,
        ).listCategories(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const body = (await request.json()) as { slug?: string; name?: string }
    const category = await repositoryForRequest(request, identity).saveCategory(
      undefined,
      { slug: body.slug, name: body.name ?? '' },
    )
    audit('content.category.created', identity, { slug: category.slug })
    return Response.json({ category }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
