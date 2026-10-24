import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  AdminAuthError,
  requireIdentity,
} from '../../../../lib/http/auth'
import { publicAdapterInstallation } from '../../../../lib'
import { adapterRepositoryForRequest } from '../../../../lib/http/request-repository'

function revision(request: Request): number {
  const value = request.headers.get('if-match')?.replace(/^"|"$/g, '')
  if (!value || !/^\d+$/.test(value))
    throw new AdminAuthError('If-Match revision required', 428)
  return Number(value)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ adapterId: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = adapterRepositoryForRequest(request, identity)
    const adapter = await repository.setState(
      (await context.params).adapterId,
      'enabled',
      revision(request),
    )
    audit('content.adapter.enabled', identity, {
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
