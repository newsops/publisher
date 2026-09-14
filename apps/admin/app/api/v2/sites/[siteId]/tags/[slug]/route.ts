import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  AutomationApiError,
  withSiteAutomation,
} from '../../../../../../lib/automation-auth'
import { parseTagPatch } from '../../../../../../lib/api-input'
import { parseJsonBody, revisionFrom } from '../../../../../../lib/api-request'
import { getRepositoryForSite } from '../../../../../../lib/repository'

function assertRevision(current: { revision: number }, request: Request): void {
  if (revisionFrom(request, 'tag') !== current.revision)
    throw new AutomationApiError(
      'revision_conflict',
      'The tag changed; reload it before updating or archiving',
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
      const tag = await getRepositoryForSite(siteId).getTag(slug)
      return tag
        ? apiResponse({ siteId, tag }, 200, id)
        : apiResponse(
            { error: { code: 'not_found', message: 'Tag not found' } },
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
      const current = await repository.getTag(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Tag not found', 404)
      assertRevision(current, request)
      const tag = await repository.saveTag(slug, {
        name: parseTagPatch(await parseJsonBody(request)).name ?? current.name,
      })
      auditAutomation('content.site.tag.updated', identity, {
        siteId,
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ siteId, tag }, 200, id)
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
      const current = await repository.getTag(slug)
      if (!current)
        throw new AutomationApiError('not_found', 'Tag not found', 404)
      assertRevision(current, request)
      const tag = await repository.removeTag(slug)
      auditAutomation('content.site.tag.archived', identity, {
        siteId,
        slug: tag.slug,
        revision: tag.revision,
      })
      return apiResponse({ siteId, tag }, 200, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
