import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
  AdminAuthError,
} from '../../lib/auth'
import {
  parseAgentGuidanceInput,
  getAgentGuidanceRepository,
} from '../../lib/agent-guidance'
import { requestedSiteId } from '../../lib/request-repository'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    enforceRateLimit(request, identity)
    const siteId = requestedSiteId(request)
    if (!identity.roles.includes('owner'))
      throw new AdminAuthError('Not authorized for this site', 403)
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
    const siteId = requestedSiteId(request)
    if (!identity.roles.includes('owner'))
      throw new AdminAuthError('Not authorized for this site', 403)
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
    return Response.json(
      { error: message },
      { status: message.startsWith('Agent guidance changed') ? 409 : 400 },
    )
  }
}
