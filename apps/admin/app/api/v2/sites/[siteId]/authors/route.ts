import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { parseJsonBody } from '../../../../../lib/api-request'
import { parseAuthorInput } from '../../../../../lib/platform-api-input'
import { getRepositoryForSite } from '../../../../../lib/repository'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse(
      { siteId, authors: await getRepositoryForSite(siteId).listAuthors() },
      200,
      id,
    ),
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const author = await getRepositoryForSite(siteId).saveAuthor(
        undefined,
        parseAuthorInput(await parseJsonBody(request)),
      )
      auditAutomation('content.site.author.created', identity, {
        siteId,
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ siteId, author }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
