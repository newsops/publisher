import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { parseTagInput } from '../../../../../lib/api-input'
import { parseJsonBody } from '../../../../../lib/api-request'
import { getRepositoryForSite } from '../../../../../lib/repository'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse(
      {
        siteId,
        categories: await getRepositoryForSite(siteId).listCategories(),
      },
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
      const category = await getRepositoryForSite(siteId).saveCategory(
        undefined,
        parseTagInput(await parseJsonBody(request)),
      )
      auditAutomation('content.site.category.created', identity, {
        siteId,
        slug: category.slug,
        revision: category.revision,
      })
      return apiResponse({ siteId, category }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
