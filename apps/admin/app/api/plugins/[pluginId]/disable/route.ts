import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  AdminAuthError,
  requireIdentity,
} from '../../../../lib/http/auth'
import { publicPluginInstallation } from '../../../../lib'
import { pluginRepositoryForRequest } from '../../../../lib/http/request-repository'

function revision(request: Request): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new AdminAuthError('If-Match revision required', 428)
  return Number(value)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = pluginRepositoryForRequest(request, identity)
    const plugin = await repository.setState(
      (await context.params).pluginId,
      'disabled',
      revision(request),
    )
    audit('content.plugin.disabled', identity, {
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
