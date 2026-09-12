import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withAutomation,
} from '../../../lib/automation-auth'
import { parseJsonBody } from '../../../lib/api-request'
import { parseAuthorInput } from '../../../lib/platform-api-input'
import { getRepository } from '../../../lib/repository'

export async function GET(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) =>
    apiResponse({ authors: await getRepository().listAuthors() }, 200, id),
  )
}

export async function POST(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const author = await getRepository().saveAuthor(
        undefined,
        parseAuthorInput(await parseJsonBody(request)),
      )
      auditAutomation('content.automation.author.created', identity, {
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ author }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
