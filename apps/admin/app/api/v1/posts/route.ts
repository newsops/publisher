import {
  apiResponse,
  apiErrorResponse,
  auditAutomation,
  withAutomation,
} from '../../../lib/automation-auth'
import { parsePostInput } from '../../../lib/api-input'
import { parseJsonBody, validatePagination } from '../../../lib/api-request'
import { getRepository } from '../../../lib/repository'

export async function GET(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) => {
    const { limit, offset } = validatePagination(request)
    const posts = await getRepository().list()
    const page = posts.slice(offset, offset + limit)
    return apiResponse(
      {
        posts: page,
        page: {
          limit,
          offset,
          total: posts.length,
          hasMore: offset + page.length < posts.length,
        },
      },
      200,
      id,
    )
  })
}

export async function POST(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const input = parsePostInput(await parseJsonBody(request))
      const post = await getRepository().save(undefined, input)
      auditAutomation('content.automation.created', identity, {
        postId: post.id,
        revision: post.revision,
      })
      return apiResponse({ post }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
