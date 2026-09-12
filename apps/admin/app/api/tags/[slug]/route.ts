import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../lib/auth'
import { repositoryForRequest } from '../../../lib/request-repository'

function revision(request: Request): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new Error('If-Match revision required')
  return Number(value)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = repositoryForRequest(request, identity)
    const { slug } = await context.params
    const current = await repository.getTag(slug)
    if (!current)
      return Response.json({ error: 'Tag not found' }, { status: 404 })
    if (revision(request) !== current.revision)
      return Response.json(
        { error: 'Tag changed; reload before updating' },
        { status: 409 },
      )
    const body = (await request.json()) as { name?: string }
    const tag = await repository.saveTag(slug, { name: body.name ?? '' })
    audit('content.tag.updated', identity, {
      slug: tag.slug,
      revision: tag.revision,
    })
    return Response.json({ tag })
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
    const repository = repositoryForRequest(request, identity)
    const { slug } = await context.params
    const current = await repository.getTag(slug)
    if (!current)
      return Response.json({ error: 'Tag not found' }, { status: 404 })
    if (revision(request) !== current.revision)
      return Response.json(
        { error: 'Tag changed; reload before archiving' },
        { status: 409 },
      )
    const tag = await repository.removeTag(slug)
    audit('content.tag.archived', identity, {
      slug: tag.slug,
      revision: tag.revision,
    })
    return Response.json({ tag })
  } catch (error) {
    return authErrorResponse(error)
  }
}
