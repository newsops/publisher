import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../../lib/api-request'
import { parseSettingsInput } from '../../../../../lib/platform-api-input'
import { getRepositoryForSite } from '../../../../../lib/repository'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse(
      { siteId, settings: await getRepositoryForSite(siteId).getSettings() },
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
      const repository = getRepositoryForSite(siteId)
      const current = await repository.getSettings()
      if (revisionFrom(request, 'settings') !== current.revision)
        throw new AutomationApiError(
          'revision_conflict',
          'The settings changed; reload before updating',
          409,
        )
      const settings = await repository.saveSettings(
        parseSettingsInput(await parseJsonBody(request)),
      )
      auditAutomation('content.site.settings.updated', identity, {
        siteId,
        revision: settings.revision,
      })
      return apiResponse({ siteId, settings }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
