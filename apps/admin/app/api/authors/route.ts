import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/auth'
import { parseAuthorInput } from '../../lib/platform-api-input'
import { repositoryForRequest } from '../../lib/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    return Response.json(
      { authors: await repository.listAuthors() },
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
    const author = await repositoryForRequest(request, identity).saveAuthor(
      undefined,
      parseAuthorInput(await request.json()),
    )
    audit('content.author.created', identity, { slug: author.slug })
    return Response.json({ author }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
