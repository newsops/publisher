import {
  apiErrorResponse,
  apiResponse,
  withAutomation,
} from '../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../lib/api-request'
import { getArticleRepositoryForSite } from '../../../../lib/repository'

function repository() {
  return getArticleRepositoryForSite()
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, requestId) => {
    const { id } = await context.params
    const article = await repository().get(id)
    return article
      ? apiResponse({ article }, 200, requestId)
      : apiResponse(
          {
            error: {
              code: 'not_found',
              message: 'Article not found',
              requestId,
            },
          },
          404,
          requestId,
        )
  })
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, requestId) => {
    try {
      const { id } = await context.params
      const body = await parseJsonBody(request)
      const object =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : {}
      const articleRepository = repository()
      const article = await articleRepository.get(id)
      if (!article)
        return apiResponse(
          {
            error: {
              code: 'not_found',
              message: 'Article not found',
              requestId,
            },
          },
          404,
          requestId,
        )
      const locale = typeof object.locale === 'string' ? object.locale : ''
      const variant = {
        locale,
        slug: typeof object.slug === 'string' ? object.slug : '',
        title: typeof object.title === 'string' ? object.title : '',
        excerpt: typeof object.excerpt === 'string' ? object.excerpt : '',
        bodyHtml: typeof object.bodyHtml === 'string' ? object.bodyHtml : '',
        seoTitle: typeof object.seoTitle === 'string' ? object.seoTitle : '',
        seoDescription:
          typeof object.seoDescription === 'string'
            ? object.seoDescription
            : '',
        status:
          object.status === 'published' ||
          object.status === 'review' ||
          object.status === 'scheduled'
            ? object.status
            : 'draft',
        revision: 0,
        publishedAt:
          typeof object.publishedAt === 'string' ? object.publishedAt : '',
        updatedAt: new Date().toISOString(),
      } as const
      const updated = await articleRepository.saveVariant(
        id,
        variant,
        revisionFrom(request),
      )
      return apiResponse({ article: updated }, 200, requestId)
    } catch (error) {
      return apiErrorResponse(error, requestId)
    }
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, requestId) => {
    try {
      const { id } = await context.params
      const locale = new URL(request.url).searchParams.get('locale') ?? ''
      if (!locale)
        return apiResponse(
          { error: { code: 'invalid_field', message: 'locale is required' } },
          400,
          requestId,
        )
      const article = await repository().removeVariant(
        id,
        locale,
        revisionFrom(request, 'article'),
      )
      return apiResponse({ article }, 200, requestId)
    } catch (error) {
      return apiErrorResponse(error, requestId)
    }
  })
}
