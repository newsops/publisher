import type { PostDraftInput } from '@publisher/content'
import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { repositoryForRequest } from '../../lib/http/request-repository'

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

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    return Response.json(
      { posts: await repository.list() },
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
    const post = await repositoryForRequest(request, identity).save(
      undefined,
      parseInput(await request.json()),
    )
    audit('content.draft.created', identity, {
      postId: post.id,
      revision: post.revision,
    })
    return Response.json(
      { post },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
