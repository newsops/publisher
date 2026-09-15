import { ContentValidationError, type ArticleVariant } from '@publisher/content'
import {
  assertSameOrigin,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../lib/auth'
import { parseJsonBody, revisionFrom } from '../../../lib/api-request'
import { getArticleRepositoryForSite } from '../../../lib/repository'
import {
  requestedSiteId,
  repositoryForRequest,
} from '../../../lib/request-repository'

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function repositoryError(error: unknown): Response | undefined {
  if (!(error instanceof Error)) return undefined
  if (error.message.includes('revision conflict'))
    return json({ error: 'Article changed; reload before updating.' }, 409)
  if (
    error.message === 'Article not found' ||
    error.message === 'Variant not found'
  )
    return json({ error: error.message }, 404)
  if (error instanceof ContentValidationError)
    return json({ error: error.message }, 400)
  return undefined
}

function variantInput(value: unknown): ArticleVariant {
  const object =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    locale: typeof object.locale === 'string' ? object.locale : '',
    slug: typeof object.slug === 'string' ? object.slug : '',
    title: typeof object.title === 'string' ? object.title : '',
    excerpt: typeof object.excerpt === 'string' ? object.excerpt : '',
    bodyMarkdown:
      typeof object.bodyMarkdown === 'string' ? object.bodyMarkdown : '',
    bodyHtml: '',
    seoTitle: typeof object.seoTitle === 'string' ? object.seoTitle : '',
    seoDescription:
      typeof object.seoDescription === 'string' ? object.seoDescription : '',
    status:
      object.status === 'review' ||
      object.status === 'scheduled' ||
      object.status === 'published'
        ? object.status
        : 'draft',
    revision: typeof object.revision === 'number' ? object.revision : 0,
    publishedAt:
      typeof object.publishedAt === 'string' ? object.publishedAt : '',
    updatedAt: new Date().toISOString(),
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    repositoryForRequest(request, identity)
    const article = await getArticleRepositoryForSite(
      requestedSiteId(request),
    ).get((await context.params).id)
    return article
      ? json({ article })
      : json({ error: 'Article not found' }, 404)
  } catch (error) {
    return repositoryError(error) ?? authErrorResponse(error)
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
    repositoryForRequest(request, identity)
    const id = (await context.params).id
    const repository = getArticleRepositoryForSite(requestedSiteId(request))
    const current = await repository.get(id)
    if (!current) return json({ error: 'Article not found' }, 404)
    const updated = await repository.saveVariant(
      id,
      variantInput(await parseJsonBody(request)),
      revisionFrom(request),
    )
    return json({ article: updated })
  } catch (error) {
    return repositoryError(error) ?? authErrorResponse(error)
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
    repositoryForRequest(request, identity)
    const locale = new URL(request.url).searchParams.get('locale') ?? ''
    if (!locale) return json({ error: 'locale is required' }, 400)
    const article = await getArticleRepositoryForSite(
      requestedSiteId(request),
    ).removeVariant((await context.params).id, locale, revisionFrom(request))
    return json({ article })
  } catch (error) {
    return repositoryError(error) ?? authErrorResponse(error)
  }
}
