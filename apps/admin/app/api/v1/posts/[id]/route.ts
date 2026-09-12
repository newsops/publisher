import {
  apiResponse,
  apiErrorResponse,
  auditAutomation,
  AutomationApiError,
  withAutomation,
} from '../../../../lib/automation-auth'
import { mergePostInput, parsePostPatch } from '../../../../lib/api-input'
import { parseJsonBody, revisionFrom } from '../../../../lib/api-request'
import { getRepository } from '../../../../lib/repository'

function assertRevision(current: { revision: number }, request: Request): void {
  const expected = revisionFrom(request)
  if (expected !== current.revision)
    throw new AutomationApiError(
      'revision_conflict',
      'The post changed; reload it before updating or deleting',
      409,
    )
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) => {
    const { id: postId } = await context.params
    const post = await getRepository().get(postId)
    return post
      ? apiResponse({ post }, 200, id)
      : apiResponse(
          {
            error: {
              code: 'not_found',
              message: 'Post not found',
              requestId: id,
            },
          },
          404,
          id,
        )
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const { id: postId } = await context.params
      const repository = getRepository()
      const current = await repository.get(postId)
      if (!current)
        throw new AutomationApiError('not_found', 'Post not found', 404)
      assertRevision(current, request)
      const input = mergePostInput(
        current,
        parsePostPatch(await parseJsonBody(request)),
      )
      const post = await repository.save(postId, input)
      auditAutomation('content.automation.updated', identity, {
        postId: post.id,
        revision: post.revision,
      })
      return apiResponse({ post }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const { id: postId } = await context.params
      const repository = getRepository()
      const current = await repository.get(postId)
      if (!current)
        throw new AutomationApiError('not_found', 'Post not found', 404)
      assertRevision(current, request)
      await repository.remove(postId)
      auditAutomation('content.automation.deleted', identity, {
        postId,
        revision: current.revision,
      })
      return apiResponse({ deleted: true, id: postId }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
