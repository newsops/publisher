import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { repositoryForRequest } from '../../lib/http/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    return Response.json(
      { tags: await repository.listTags() },
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
    const tag = await repositoryForRequest(request, identity).saveTag(
      undefined,
      {
        slug: body.slug,
        name: body.name ?? '',
      },
    )
    audit('content.tag.created', identity, { slug: tag.slug })
    return Response.json({ tag }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
