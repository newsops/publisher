import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  AdminAuthError,
  requireIdentity,
} from '../../../lib/auth'
import { parsePluginConfiguration } from '../../../lib/plugin-api-input'
import { publicPluginInstallation } from '../../../lib/plugin-repository'
import { pluginRepositoryForRequest } from '../../../lib/request-repository'

function revision(request: Request): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new AdminAuthError('If-Match revision required', 428)
  return Number(value)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const plugin = await pluginRepositoryForRequest(request, identity).get(
      (await context.params).pluginId,
    )
    return plugin
      ? Response.json(
          { plugin: publicPluginInstallation(plugin) },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      : Response.json(
          { error: 'Plugin installation not found' },
          { status: 404 },
        )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = pluginRepositoryForRequest(request, identity)
    const plugin = await repository.configure(
      (await context.params).pluginId,
      parsePluginConfiguration(await request.json()),
      revision(request),
    )
    audit('content.plugin.configured', identity, {
      siteId: repository.siteId,
      pluginId: plugin.pluginId,
      revision: plugin.revision,
    })
    return Response.json(
      { plugin: publicPluginInstallation(plugin) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
