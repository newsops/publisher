import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../../lib/http/automation-auth'
import { parseTagPatch } from '../../../../../../lib/http/api-input'
import {
  parseJsonBody,
  revisionFrom,
} from '../../../../../../lib/http/api-request'
import { getRepositoryForSite } from '../../../../../../lib'

function assertRevision(current: { revision: number }, request: Request): void {
  if (revisionFrom(request, 'category') !== current.revision)
    throw new AutomationApiError(
      'revision_conflict',
      'The category changed; reload it before updating or archiving',
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
      const category = await getRepositoryForSite(siteId).getCategory(slug)
      return category
        ? apiResponse({ siteId, category }, 200, id)
        : apiResponse(
            { error: { code: 'not_found', message: 'Category not found' } },
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
      const current = await repository.getCategory(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Category not found', 404)
      assertRevision(current, request)
      const category = await repository.saveCategory(slug, {
        name: parseTagPatch(await parseJsonBody(request)).name ?? current.name,
      })
      auditAutomation('content.site.category.updated', identity, {
        siteId,
        slug: category.slug,
        revision: category.revision,
      })
      return apiResponse({ siteId, category }, 200, id)
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
      const current = await repository.getCategory(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Category not found', 404)
      assertRevision(current, request)
      const category = await repository.removeCategory(slug)
      auditAutomation('content.site.category.archived', identity, {
        siteId,
        slug: category.slug,
        revision: category.revision,
      })
      return apiResponse({ siteId, category }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
