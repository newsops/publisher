import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withAutomation,
} from '../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../lib/api-request'
import { parseAuthorPatch } from '../../../../lib/platform-api-input'
import { getRepository } from '../../../../lib/repository'

async function currentAuthor(slug: string) {
  const author = await getRepository().getAuthor(slug)
  if (!author)
    throw new AutomationApiError('not_found', 'Author not found', 404)
  return author
}

function assertRevision(current: { revision: number }, request: Request): void {
  if (revisionFrom(request, 'author') !== current.revision)
    throw new AutomationApiError(
      'revision_conflict',
      'The author changed; reload before updating or archiving',
      409,
    )
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) => {
    try {
      const { slug } = await context.params
      return apiResponse({ author: await currentAuthor(slug) }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return withAutomation(request, 'editor', async (identity, id) => {
    try {
      const { slug } = await context.params
      const current = await currentAuthor(slug)
      assertRevision(current, request)
      const patch = parseAuthorPatch(await parseJsonBody(request))
      const author = await getRepository().saveAuthor(slug, {
        slug: patch.slug,
        name: patch.name ?? current.name,
        bio: patch.bio ?? current.bio,
        avatarUrl: patch.avatarUrl ?? current.avatarUrl,
        active: patch.active ?? current.active,
      })
      auditAutomation('content.automation.author.updated', identity, {
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ author }, 200, id)
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
      const current = await currentAuthor(slug)
      assertRevision(current, request)
      const author = await getRepository().removeAuthor(slug)
      auditAutomation('content.automation.author.archived', identity, {
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ author }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
