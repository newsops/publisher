import {
  assertSameOrigin,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../../lib/http/auth'
import { parsePluginConfiguration } from '../../../../lib/http/plugin-api-input'
import { publicPluginInstallation } from '../../../../lib'
import { pluginRepositoryForRequest } from '../../../../lib/http/request-repository'

export async function POST(
  request: Request,
  context: { params: Promise<{ pluginId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = pluginRepositoryForRequest(request, identity)
    const result = await repository.validate(
      (await context.params).pluginId,
      parsePluginConfiguration(await request.json()),
    )
    return Response.json(
      {
        valid: result.ok,
        errors: result.errors,
        plugin: result.value
          ? publicPluginInstallation(result.value)
          : undefined,
      },
      {
        status: result.ok ? 200 : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
