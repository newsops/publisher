import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../../lib/http/automation-auth'
import {
  parseJsonBody,
  revisionFrom,
} from '../../../../../../lib/http/api-request'
import { objectValue } from '../../../../../../lib/http/api-input'
import { parsePluginConfiguration } from '../../../../../../lib/http/plugin-api-input'
import {
  getPluginRepositoryForSite,
  publicPluginInstallation,
} from '../../../../../../lib'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string; pluginId: string }> },
): Promise<Response> {
  const { siteId, pluginId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      const plugin = await getPluginRepositoryForSite(siteId).get(pluginId)
      return plugin
        ? apiResponse(
            { siteId, plugin: publicPluginInstallation(plugin) },
            200,
            id,
          )
        : apiResponse(
            {
              error: {
                code: 'not_found',
                message: 'Plugin installation not found',
                requestId: id,
              },
            },
            404,
            id,
          )
    },
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string; pluginId: string }> },
): Promise<Response> {
  const { siteId, pluginId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const plugin = await getPluginRepositoryForSite(siteId).configure(
        pluginId,
        parsePluginConfiguration(await parseJsonBody(request)),
        revisionFrom(request, 'plugin'),
      )
      auditAutomation('content.site.plugin.configured', identity, {
        siteId,
        pluginId,
        revision: plugin.revision,
      })
      return apiResponse(
        { siteId, plugin: publicPluginInstallation(plugin) },
        200,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; pluginId: string }> },
): Promise<Response> {
  const { siteId, pluginId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const body = objectValue(await parseJsonBody(request))
      if (
        typeof body.action !== 'string' ||
        !['validate', 'enable', 'disable'].includes(body.action)
      )
        throw new AutomationApiError(
          'invalid_action',
          'plugin action must be validate, enable, or disable',
          400,
        )
      const repository = getPluginRepositoryForSite(siteId)
      if (body.action === 'validate') {
        const result = await repository.validate(
          pluginId,
          parsePluginConfiguration({ configuration: body.configuration }),
        )
        return apiResponse(
          {
            siteId,
            valid: result.ok,
            errors: result.errors,
            plugin: result.value
              ? publicPluginInstallation(result.value)
              : undefined,
          },
          result.ok ? 200 : 400,
          id,
        )
      }
      const state = body.action === 'enable' ? 'enabled' : 'disabled'
      const plugin = await repository.setState(
        pluginId,
        state,
        revisionFrom(request, 'plugin'),
      )
      auditAutomation('content.site.plugin.' + body.action + 'd', identity, {
        siteId,
        pluginId,
        revision: plugin.revision,
      })
      return apiResponse(
        { siteId, plugin: publicPluginInstallation(plugin) },
        200,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
