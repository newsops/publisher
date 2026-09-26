import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { parseAgentGuidanceInput, getAgentGuidanceRepository } from '../../lib'
import { authorizedSiteId } from '../../lib/http/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const siteId = authorizedSiteId(request, identity)
    return Response.json(
      { siteId, agentContext: await getAgentGuidanceRepository().get(siteId) },
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
    const siteId = authorizedSiteId(request, identity)
    const revision = Number(
      request.headers.get('if-match')?.replace(/^"|"$/g, ''),
    )
    if (!Number.isSafeInteger(revision) || revision < 1)
      return Response.json(
        { error: 'If-Match revision required' },
        { status: 428 },
      )
    const guidance = await getAgentGuidanceRepository().update(
      siteId,
      parseAgentGuidanceInput(await request.json()),
      revision,
    )
    audit('content.site.agent_guidance.updated', identity, {
      siteId,
      revision: guidance.revision,
    })
    return Response.json({ siteId, agentContext: guidance })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to save agent guidance'
    if (message.startsWith('Agent guidance changed'))
      return Response.json({ error: message }, { status: 409 })
    return authErrorResponse(error)
  }
}
