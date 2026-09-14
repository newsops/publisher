import { ContentValidationError, type ArticleVariant } from '@publisher/content'
import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../../../lib/api-request'
import { getArticleRepositoryForSite } from '../../../../../../lib/repository'

function variantInput(value: unknown): ArticleVariant {
  const object =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    locale: typeof object.locale === 'string' ? object.locale : '',
    slug: typeof object.slug === 'string' ? object.slug : '',
    title: typeof object.title === 'string' ? object.title : '',
    excerpt: typeof object.excerpt === 'string' ? object.excerpt : '',
    bodyHtml: typeof object.bodyHtml === 'string' ? object.bodyHtml : '',
    seoTitle: typeof object.seoTitle === 'string' ? object.seoTitle : '',
    seoDescription:
      typeof object.seoDescription === 'string' ? object.seoDescription : '',
    status:
      object.status === 'review' ||
      object.status === 'scheduled' ||
      object.status === 'published'
        ? object.status
        : 'draft',
    revision: 0,
    publishedAt:
      typeof object.publishedAt === 'string' ? object.publishedAt : '',
    updatedAt: new Date().toISOString(),
  }
}

function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ContentValidationError)
    return apiResponse(
      { error: { code: 'validation_failed', message: error.message } },
      400,
      requestId,
    )
  return apiErrorResponse(error, requestId)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: articleId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, requestId) => {
      const article = await getArticleRepositoryForSite(siteId).get(articleId)
      return article
        ? apiResponse({ siteId, article }, 200, requestId)
        : apiResponse(
            { error: { code: 'not_found', message: 'Article not found' } },
            404,
            requestId,
          )
    },
  )
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: articleId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (identity, requestId) => {
      try {
        const repository = getArticleRepositoryForSite(siteId)
        if (!(await repository.get(articleId)))
          return apiResponse(
            { error: { code: 'not_found', message: 'Article not found' } },
            404,
            requestId,
          )
        const article = await repository.saveVariant(
          articleId,
          variantInput(await parseJsonBody(request)),
          revisionFrom(request),
        )
        auditAutomation('content.site.article.variant.updated', identity, {
          siteId,
          articleId,
        })
        return apiResponse({ siteId, article }, 200, requestId)
      } catch (error) {
        return errorResponse(error, requestId)
      }
    },
  )
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: articleId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (identity, requestId) => {
      try {
        const locale = new URL(request.url).searchParams.get('locale') ?? ''
        if (!locale)
          return apiResponse(
            { error: { code: 'invalid_field', message: 'locale is required' } },
            400,
            requestId,
          )
        const article = await getArticleRepositoryForSite(siteId).removeVariant(
          articleId,
          locale,
          revisionFrom(request, 'article'),
        )
        auditAutomation('content.site.article.variant.deleted', identity, {
          siteId,
          articleId,
          locale,
        })
        return apiResponse({ siteId, article }, 200, requestId)
      } catch (error) {
        return errorResponse(error, requestId)
      }
    },
  )
}
