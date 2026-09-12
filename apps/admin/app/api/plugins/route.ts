import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/auth'
import { parsePluginCreateInput } from '../../lib/plugin-api-input'
import {
  knownPluginIds,
  publicPluginInstallation,
} from '../../lib/plugin-repository'
import {
  pluginRepositoryForRequest,
  requestedSiteId,
} from '../../lib/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = pluginRepositoryForRequest(request, identity)
    return Response.json(
      {
        siteId: requestedSiteId(request),
        definitions: knownPluginIds(),
        plugins: (await repository.list()).map(publicPluginInstallation),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const input = parsePluginCreateInput(await request.json())
    const repository = pluginRepositoryForRequest(request, identity)
    const plugin = await repository.configure(
      input.pluginId,
      input.configuration,
    )
    audit('content.plugin.configured', identity, {
      siteId: repository.siteId,
      pluginId: plugin.pluginId,
      revision: plugin.revision,
    })
    return Response.json(
      { plugin: publicPluginInstallation(plugin) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
