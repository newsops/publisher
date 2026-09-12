import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../lib/auth'
import { parseAuthorPatch } from '../../../lib/platform-api-input'
import { repositoryForRequest } from '../../../lib/request-repository'

function expectedRevision(request: Request): number | Response {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  return value && /^\d+$/.test(value)
    ? Number(value)
    : Response.json({ error: 'If-Match revision required' }, { status: 428 })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    const { slug } = await context.params
    const author = await repository.getAuthor(slug)
    return author
      ? Response.json({ author })
      : Response.json({ error: 'Author not found' }, { status: 404 })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const { slug } = await context.params
    const repository = repositoryForRequest(request, identity)
    const current = await repository.getAuthor(slug)
    if (!current)
      return Response.json({ error: 'Author not found' }, { status: 404 })
    const expected = expectedRevision(request)
    if (expected instanceof Response) return expected
    if (expected !== current.revision)
      return Response.json(
        { error: 'Author changed; reload before updating' },
        { status: 409 },
      )
    const patch = parseAuthorPatch(await request.json())
    const author = await repository.saveAuthor(slug, {
      slug: patch.slug,
      name: patch.name ?? current.name,
      bio: patch.bio ?? current.bio,
      avatarUrl: patch.avatarUrl ?? current.avatarUrl,
      active: patch.active ?? current.active,
    })
    audit('content.author.updated', identity, {
      slug: author.slug,
      revision: author.revision,
    })
    return Response.json({ author })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const { slug } = await context.params
    const repository = repositoryForRequest(request, identity)
    const current = await repository.getAuthor(slug)
    if (!current)
      return Response.json({ error: 'Author not found' }, { status: 404 })
    const expected = expectedRevision(request)
    if (expected instanceof Response) return expected
    if (expected !== current.revision)
      return Response.json(
        { error: 'Author changed; reload before archiving' },
        { status: 409 },
      )
    const author = await repository.removeAuthor(slug)
    audit('content.author.archived', identity, {
      slug: author.slug,
      revision: author.revision,
    })
    return Response.json({ author })
  } catch (error) {
    return authErrorResponse(error)
  }
}
