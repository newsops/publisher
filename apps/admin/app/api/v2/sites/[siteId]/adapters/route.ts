import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import { parseJsonBody } from '../../../../../lib/http/api-request'
import { parseAdapterCreateInput } from '../../../../../lib/http/adapter-api-input'
import {
  getAdapterRepositoryForSite,
  knownAdapterIds,
  publicAdapterInstallation,
} from '../../../../../lib'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      const repository = getAdapterRepositoryForSite(siteId)
      return apiResponse(
        {
          siteId,
          definitions: knownAdapterIds(),
          adapters: (await repository.list()).map(publicAdapterInstallation),
        },
        200,
        id,
      )
    },
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const input = parseAdapterCreateInput(await parseJsonBody(request))
      const adapter = await getAdapterRepositoryForSite(siteId).configure(
        input.adapterId,
        input.configuration,
      )
      auditAutomation('content.site.adapter.configured', identity, {
        siteId,
        adapterId: adapter.adapterId,
        revision: adapter.revision,
      })
      return apiResponse(
        { siteId, adapter: publicAdapterInstallation(adapter) },
        201,
        id,
      )
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
