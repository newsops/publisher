import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  AdminAuthError,
  requireIdentity,
} from '../../../lib/http/auth'
import { parseAdapterConfiguration } from '../../../lib/http/adapter-api-input'
import { publicAdapterInstallation } from '../../../lib'
import { adapterRepositoryForRequest } from '../../../lib/http/request-repository'

function revision(request: Request): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new AdminAuthError('If-Match revision required', 428)
  return Number(value)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ adapterId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const adapter = await adapterRepositoryForRequest(request, identity).get(
      (await context.params).adapterId,
    )
    return adapter
      ? Response.json(
          { adapter: publicAdapterInstallation(adapter) },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      : Response.json(
          { error: 'Adapter installation not found' },
          { status: 404 },
        )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ adapterId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = adapterRepositoryForRequest(request, identity)
    const adapter = await repository.configure(
      (await context.params).adapterId,
      parseAdapterConfiguration(await request.json()),
      revision(request),
    )
    audit('content.adapter.configured', identity, {
      siteId: repository.siteId,
      adapterId: adapter.adapterId,
      revision: adapter.revision,
    })
    return Response.json(
      { adapter: publicAdapterInstallation(adapter) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
