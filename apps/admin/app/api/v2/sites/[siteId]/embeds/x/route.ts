import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../../lib/http/automation-auth'
import { parseJsonBody } from '../../../../../../lib/http/api-request'
import { resolveXPostOEmbed } from '../../../../../../lib/services/x-oembed'

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const body = (await parseJsonBody(request)) as { url?: unknown }
      if (typeof body.url !== 'string') throw new Error('url is required')
      const embed = await resolveXPostOEmbed(body.url)
      auditAutomation('content.site.x_embed.resolved', identity, {
        siteId,
        url: embed.url,
      })
      return apiResponse({ siteId, embed }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
