import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../../lib/http/automation-auth'
import {
  parseJsonBody,
  revisionFrom,
} from '../../../../../../lib/http/api-request'
import { objectValue } from '../../../../../../lib/http/api-input'
import { parseAdapterConfiguration } from '../../../../../../lib/http/adapter-api-input'
import {
  getAdapterRepositoryForSite,
  publicAdapterInstallation,
} from '../../../../../../lib'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string; adapterId: string }> },
): Promise<Response> {
  const { siteId, adapterId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      const adapter = await getAdapterRepositoryForSite(siteId).get(adapterId)
      return adapter
        ? apiResponse(
            { siteId, adapter: publicAdapterInstallation(adapter) },
            200,
            id,
          )
        : apiResponse(
            {
              error: {
                code: 'not_found',
                message: 'Adapter installation not found',
                requestId: id,
              },
            },
            404,
            id,
          )
    },
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string; adapterId: string }> },
): Promise<Response> {
  const { siteId, adapterId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const adapter = await getAdapterRepositoryForSite(siteId).configure(
        adapterId,
        parseAdapterConfiguration(await parseJsonBody(request)),
        revisionFrom(request, 'adapter'),
      )
      auditAutomation('content.site.adapter.configured', identity, {
        siteId,
        adapterId,
        revision: adapter.revision,
      })
      return apiResponse(
        { siteId, adapter: publicAdapterInstallation(adapter) },
        200,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

function actionFrom(
  body: Record<string, unknown>,
): 'validate' | 'enable' | 'disable' {
  const action = body.action
  if (action !== 'validate' && action !== 'enable' && action !== 'disable')
    throw new AutomationApiError(
      'invalid_action',
      'adapter action must be validate, enable, or disable',
      400,
    )
  return action
}

async function validateAdapter(
  siteId: string,
  adapterId: string,
  configuration: unknown,
  id: string,
): Promise<Response> {
  const result = await getAdapterRepositoryForSite(siteId).validate(
    adapterId,
    parseAdapterConfiguration({ configuration }),
  )
  return apiResponse(
    {
      siteId,
      valid: result.ok,
      errors: result.errors,
      adapter: result.value
        ? publicAdapterInstallation(result.value)
        : undefined,
    },
    result.ok ? 200 : 400,
    id,
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; adapterId: string }> },
): Promise<Response> {
  const { siteId, adapterId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const body = objectValue(await parseJsonBody(request))
      const action = actionFrom(body)
      if (action === 'validate')
        return await validateAdapter(siteId, adapterId, body.configuration, id)
      const repository = getAdapterRepositoryForSite(siteId)
      const state = action === 'enable' ? 'enabled' : 'disabled'
      const adapter = await repository.setState(
        adapterId,
        state,
        revisionFrom(request, 'adapter'),
      )
      auditAutomation('content.site.adapter.' + action + 'd', identity, {
        siteId,
        adapterId,
        revision: adapter.revision,
      })
      return apiResponse(
        { siteId, adapter: publicAdapterInstallation(adapter) },
        200,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
