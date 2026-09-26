import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { parseSettingsInput } from '../../lib/http/platform-api-input'
import { repositoryForRequest } from '../../lib/http/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const repository = repositoryForRequest(request, identity)
    return Response.json(
      { settings: await repository.getSettings() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const repository = repositoryForRequest(request, identity)
    const current = await repository.getSettings()
    const revision = request.headers.get('if-match')?.replace(/^"|"$/g, '')
    if (!revision || !/^\d+$/.test(revision))
      return Response.json(
        { error: 'If-Match revision required' },
        { status: 428 },
      )
    if (Number(revision) !== current.revision)
      return Response.json(
        { error: 'Settings changed; reload before updating' },
        { status: 409 },
      )
    const settings = await repository.saveSettings(
      parseSettingsInput(await request.json()),
    )
    audit('content.settings.updated', identity, { revision: settings.revision })
    return Response.json({ settings })
  } catch (error) {
    return authErrorResponse(error)
  }
}
