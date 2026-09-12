import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withAutomation,
} from '../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../lib/api-request'
import { parseSettingsInput } from '../../../lib/platform-api-input'
import { getRepository } from '../../../lib/repository'

export async function GET(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) =>
    apiResponse({ settings: await getRepository().getSettings() }, 200, id),
  )
}

export async function PATCH(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const repository = getRepository()
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
      auditAutomation('content.automation.settings.updated', identity, {
        revision: settings.revision,
      })
      return apiResponse({ settings }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
