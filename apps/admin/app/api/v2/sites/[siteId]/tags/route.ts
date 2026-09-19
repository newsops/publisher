import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import { parseTagInput } from '../../../../../lib/http/api-input'
import { parseJsonBody } from '../../../../../lib/http/api-request'
import { getRepositoryForSite } from '../../../../../lib'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse(
      { siteId, tags: await getRepositoryForSite(siteId).listTags() },
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
      const tag = await getRepositoryForSite(siteId).saveTag(
        undefined,
        parseTagInput(await parseJsonBody(request)),
      )
      auditAutomation('content.site.tag.created', identity, {
        siteId,
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ siteId, tag }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
