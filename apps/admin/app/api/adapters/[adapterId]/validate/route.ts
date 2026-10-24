import {
  assertSameOrigin,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../../lib/http/auth'
import { parseAdapterConfiguration } from '../../../../lib/http/adapter-api-input'
import { publicAdapterInstallation } from '../../../../lib'
import { adapterRepositoryForRequest } from '../../../../lib/http/request-repository'

export async function POST(
  request: Request,
  context: { params: Promise<{ adapterId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = adapterRepositoryForRequest(request, identity)
    const result = await repository.validate(
      (await context.params).adapterId,
      parseAdapterConfiguration(await request.json()),
    )
    return Response.json(
      {
        valid: result.ok,
        errors: result.errors,
        adapter: result.value
          ? publicAdapterInstallation(result.value)
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
