import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../../lib/automation-auth'
import { parseJsonBody, revisionFrom } from '../../../../../../lib/api-request'
import { parseAuthorPatch } from '../../../../../../lib/platform-api-input'
import { getRepositoryForSite } from '../../../../../../lib/repository'

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
  context: { params: Promise<{ siteId: string; slug: string }> },
): Promise<Response> {
  const { siteId, slug } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      const author = await getRepositoryForSite(siteId).getAuthor(slug)
      return author
        ? apiResponse({ siteId, author }, 200, id)
        : apiResponse(
            { error: { code: 'not_found', message: 'Author not found' } },
            404,
            id,
          )
    },
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string; slug: string }> },
): Promise<Response> {
  const { siteId, slug } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const repository = getRepositoryForSite(siteId)
      const current = await repository.getAuthor(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Author not found', 404)
      assertRevision(current, request)
      const patch = parseAuthorPatch(await parseJsonBody(request))
      const author = await repository.saveAuthor(slug, {
        slug: patch.slug,
        name: patch.name ?? current.name,
        bio: patch.bio ?? current.bio,
        avatarUrl: patch.avatarUrl ?? current.avatarUrl,
        active: patch.active ?? current.active,
      })
      auditAutomation('content.site.author.updated', identity, {
        siteId,
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ siteId, author }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ siteId: string; slug: string }> },
): Promise<Response> {
  const { siteId, slug } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (identity, id) => {
    try {
      const repository = getRepositoryForSite(siteId)
      const current = await repository.getAuthor(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Author not found', 404)
      assertRevision(current, request)
      const author = await repository.removeAuthor(slug)
      auditAutomation('content.site.author.archived', identity, {
        siteId,
        slug: author.slug,
        revision: author.revision,
      })
      return apiResponse({ siteId, author }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
