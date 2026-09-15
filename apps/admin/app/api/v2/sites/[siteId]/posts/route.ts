import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { parsePostInput } from '../../../../../lib/api-input'
import {
  parseJsonBody,
  validatePagination,
} from '../../../../../lib/api-request'
import { getRepositoryForSite } from '../../../../../lib/repository'
import { authorContext } from '../../../../../lib/author-context'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      const { limit, offset } = validatePagination(request)
      const posts = await getRepositoryForSite(siteId).list()
      const page = posts.slice(offset, offset + limit)
      return apiResponse(
        {
          siteId,
          posts: page,
          page: {
            limit,
            offset,
            total: posts.length,
            hasMore: offset + page.length < posts.length,
          },
        },
        200,
        id,
      )
    },
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const repository = getRepositoryForSite(siteId)
      const input = parsePostInput(await parseJsonBody(request))
      const author = input.authorSlug
        ? await repository.getAuthor(input.authorSlug)
        : undefined
      if (!author)
        throw new AutomationApiError(
          'validation_failed',
          'Selected author is unavailable',
          400,
        )
      const post = await repository.save(undefined, input)
      auditAutomation('content.site.created', identity, {
        siteId,
        postId: post.id,
        revision: post.revision,
      })
      return apiResponse(
        { siteId, post, authorContext: authorContext(author) },
        201,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
