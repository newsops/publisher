import type { PostDraftInput } from '@publisher/content'
import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  AdminAuthError,
  requireIdentity,
} from '../../../lib/http/auth'
import { repositoryForRequest } from '../../../lib/http/request-repository'

function parseInput(value: unknown): PostDraftInput {
  const object =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    sourceId: typeof object.sourceId === 'string' ? object.sourceId : undefined,
    sourceUrl:
      typeof object.sourceUrl === 'string' ? object.sourceUrl : undefined,
    slug: typeof object.slug === 'string' ? object.slug : '',
    title: typeof object.title === 'string' ? object.title : '',
    excerpt: typeof object.excerpt === 'string' ? object.excerpt : '',
    bodyMarkdown:
      typeof object.bodyMarkdown === 'string' ? object.bodyMarkdown : '',
    author: typeof object.author === 'string' ? object.author : '',
    authorSlug:
      typeof object.authorSlug === 'string' ? object.authorSlug : undefined,
    seoTitle: typeof object.seoTitle === 'string' ? object.seoTitle : undefined,
    seoDescription:
      typeof object.seoDescription === 'string'
        ? object.seoDescription
        : undefined,
    status:
      object.status === 'review' ||
      object.status === 'scheduled' ||
      object.status === 'published'
        ? object.status
        : 'draft',
    publishedAt:
      typeof object.publishedAt === 'string' ? object.publishedAt : '',
    categories: Array.isArray(object.categories)
      ? object.categories.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    tags: Array.isArray(object.tags)
      ? object.tags.filter((item): item is string => typeof item === 'string')
      : [],
    imageUrl: typeof object.imageUrl === 'string' ? object.imageUrl : undefined,
    featured: object.featured === true,
    featuredRank:
      typeof object.featuredRank === 'number' ? object.featuredRank : undefined,
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    const { id } = await context.params
    const post = await repository.get(id)
    return post
      ? Response.json({ post }, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: 'Post not found' }, { status: 404 })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const { id } = await context.params
    const repository = repositoryForRequest(request, identity)
    const current = await repository.get(id)
    if (!current)
      return Response.json({ error: 'Post not found' }, { status: 404 })
    const expected = request.headers.get('if-match')?.replace(/^"|"$/g, '')
    if (!expected || !/^\d+$/.test(expected))
      throw new AdminAuthError('If-Match revision required', 428)
    if (Number(expected) !== current.revision)
      return Response.json(
        { error: 'Post changed; reload before updating' },
        { status: 409 },
      )
    const post = await repository.save(id, parseInput(await request.json()))
    audit('content.draft.updated', identity, {
      postId: post.id,
      revision: post.revision,
    })
    return Response.json({ post }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const { id } = await context.params
    const repository = repositoryForRequest(request, identity)
    const current = await repository.get(id)
    if (!current)
      return Response.json({ error: 'Post not found' }, { status: 404 })
    const expected = request.headers.get('if-match')?.replace(/^"|"$/g, '')
    if (!expected || !/^\d+$/.test(expected))
      throw new AdminAuthError('If-Match revision required', 428)
    if (Number(expected) !== current.revision)
      return Response.json(
        { error: 'Post changed; reload before deleting' },
        { status: 409 },
      )
    await repository.remove(id)
    audit('content.draft.deleted', identity, { postId: id })
    return Response.json(
      { deleted: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
