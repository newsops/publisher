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
    const current = await repository.getCategory(slug)
    if (!current)
      return Response.json({ error: 'Category not found' }, { status: 404 })
    if (revision(request) !== current.revision)
      return Response.json(
        { error: 'Category changed; reload before updating' },
        { status: 409 },
      )
    const body = (await request.json()) as { name?: string }
    const category = await repository.saveCategory(slug, {
      name: body.name ?? '',
    })
    audit('content.category.updated', identity, {
      slug: category.slug,
      revision: category.revision,
    })
    return Response.json({ category })
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
    const current = await repository.getCategory(slug)
    if (!current)
      return Response.json({ error: 'Category not found' }, { status: 404 })
    if (revision(request) !== current.revision)
      return Response.json(
        { error: 'Category changed; reload before archiving' },
        { status: 409 },
      )
    const category = await repository.removeCategory(slug)
    audit('content.category.archived', identity, {
      slug: category.slug,
      revision: category.revision,
    })
    return Response.json({ category })
  } catch (error) {
    return authErrorResponse(error)
  }
}
