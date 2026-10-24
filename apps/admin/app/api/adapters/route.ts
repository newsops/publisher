import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { parseAdapterCreateInput } from '../../lib/http/adapter-api-input'
import { knownAdapterIds, publicAdapterInstallation } from '../../lib'
import {
  adapterRepositoryForRequest,
  requestedSiteId,
} from '../../lib/http/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = adapterRepositoryForRequest(request, identity)
    return Response.json(
      {
        siteId: requestedSiteId(request),
        definitions: knownAdapterIds(),
        adapters: (await repository.list()).map(publicAdapterInstallation),
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
    const input = parseAdapterCreateInput(await request.json())
    const repository = adapterRepositoryForRequest(request, identity)
    const adapter = await repository.configure(
      input.adapterId,
      input.configuration,
    )
    audit('content.adapter.configured', identity, {
      siteId: repository.siteId,
      adapterId: adapter.adapterId,
      revision: adapter.revision,
    })
    return Response.json(
      { adapter: publicAdapterInstallation(adapter) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
