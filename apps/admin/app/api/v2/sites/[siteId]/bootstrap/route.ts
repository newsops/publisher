import {
  apiErrorResponse,
  apiResponse,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { getSiteRegistry } from '../../../../../lib/site-registry'

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (_identity, id) => {
      try {
        const result = await getSiteRegistry().bootstrap(siteId)
        return apiResponse(
          { siteId, ...result },
          result.created ? 201 : 200,
          id,
        )
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}
