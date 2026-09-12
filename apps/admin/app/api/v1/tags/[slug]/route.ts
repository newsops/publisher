import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withAutomation,
} from '../../../../lib/automation-auth'
import { parseTagPatch } from '../../../../lib/api-input'
import { parseJsonBody, revisionFrom } from '../../../../lib/api-request'
import { getRepository } from '../../../../lib/repository'

function assertRevision(current: { revision: number }, request: Request): void {
  const expected = revisionFrom(request, 'tag')
  if (expected !== current.revision)
    throw new AutomationApiError(
      'revision_conflict',
      'The tag changed; reload it before updating or archiving',
      409,
    )
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) => {
    const { slug } = await context.params
    const tag = await getRepository().getTag(slug)
    return tag
      ? apiResponse({ tag }, 200, id)
      : apiResponse(
          {
            error: {
              code: 'not_found',
              message: 'Tag not found',
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
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const { slug } = await context.params
      const repository = getRepository()
      const current = await repository.getTag(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Tag not found', 404)
      assertRevision(current, request)
      const patch = parseTagPatch(await parseJsonBody(request))
      const tag = await repository.saveTag(slug, {
        name: patch.name ?? current.name,
      })
      auditAutomation('content.automation.tag.updated', identity, {
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ tag }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const { slug } = await context.params
      const repository = getRepository()
      const current = await repository.getTag(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Tag not found', 404)
      assertRevision(current, request)
      const tag = await repository.removeTag(slug)
      auditAutomation('content.automation.tag.archived', identity, {
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ tag }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
