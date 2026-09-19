import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import { parseJsonBody } from '../../../../../lib/http/api-request'
import { parsePluginCreateInput } from '../../../../../lib/http/plugin-api-input'
import {
  getPluginRepositoryForSite,
  knownPluginIds,
  publicPluginInstallation,
} from '../../../../../lib'

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
      const repository = getPluginRepositoryForSite(siteId)
      return apiResponse(
        {
          siteId,
          definitions: knownPluginIds(),
          plugins: (await repository.list()).map(publicPluginInstallation),
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
      const input = parsePluginCreateInput(await parseJsonBody(request))
      const plugin = await getPluginRepositoryForSite(siteId).configure(
        input.pluginId,
        input.configuration,
      )
      auditAutomation('content.site.plugin.configured', identity, {
        siteId,
        pluginId: plugin.pluginId,
        revision: plugin.revision,
      })
      return apiResponse(
        { siteId, plugin: publicPluginInstallation(plugin) },
        201,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
