import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withAutomation,
} from '../../../lib/automation-auth'
import { parseTagInput } from '../../../lib/api-input'
import { parseJsonBody } from '../../../lib/api-request'
import { getRepository } from '../../../lib/repository'

export async function GET(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) =>
    apiResponse({ tags: await getRepository().listTags() }, 200, id),
  )
}

export async function POST(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const tag = await getRepository().saveTag(
        undefined,
        parseTagInput(await parseJsonBody(request)),
      )
      auditAutomation('content.automation.tag.created', identity, {
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ tag }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
