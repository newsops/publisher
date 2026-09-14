import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../../lib/api-request'
import {
  getAgentGuidanceRepository,
  parseAgentGuidanceInput,
  type AgentGuidance,
} from '../../../../../lib/agent-guidance'

function envelope(siteId: string, guidance: AgentGuidance) {
  return {
    siteId,
    agentContext: {
      instructions: guidance.instructions,
      revision: guidance.revision,
      updatedAt: guidance.updatedAt,
    },
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse(
      envelope(siteId, await getAgentGuidanceRepository().get(siteId)),
      200,
      id,
    ),
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const guidance = await getAgentGuidanceRepository().update(
        siteId,
        parseAgentGuidanceInput(await parseJsonBody(request)),
        revisionFrom(request, 'agent guidance'),
      )
      auditAutomation('content.site.agent_guidance.updated', identity, {
        siteId,
        revision: guidance.revision,
      })
      return apiResponse(envelope(siteId, guidance), 200, id)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Agent guidance changed')
      )
        return apiErrorResponse(
          new AutomationApiError('revision_conflict', error.message, 409),
          id,
        )
      return apiErrorResponse(error, id)
    }
  })
}
