import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../../lib/automation-auth'
import { mergePostInput, parsePostPatch } from '../../../../../../lib/api-input'
import { parseJsonBody, revisionFrom } from '../../../../../../lib/api-request'
import { getRepositoryForSite } from '../../../../../../lib/repository'
import { AutomationApiError } from '../../../../../../lib/automation-auth'
import { authorContext } from '../../../../../../lib/author-context'

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
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: postId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, requestId) => {
      const post = await getRepositoryForSite(siteId).get(postId)
      return post
        ? apiResponse({ siteId, post }, 200, requestId)
        : apiResponse(
            { error: { code: 'not_found', message: 'Post not found' } },
            404,
            requestId,
          )
    },
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: postId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (identity, requestId) => {
      try {
        const repository = getRepositoryForSite(siteId)
        const current = await repository.get(postId)
        if (!current)
          return apiResponse(
            { error: { code: 'not_found', message: 'Post not found' } },
            404,
            requestId,
          )
        assertRevision(current, request)
        const input = mergePostInput(
          current,
          parsePostPatch(await parseJsonBody(request)),
        )
        const author = input.authorSlug
          ? await repository.getAuthor(input.authorSlug)
          : undefined
        if (!author)
          throw new AutomationApiError(
            'validation_failed',
            'Selected author is unavailable',
            400,
          )
        const post = await repository.save(postId, input)
        auditAutomation('content.site.updated', identity, {
          siteId,
          postId,
          revision: post.revision,
        })
        return apiResponse(
          { siteId, post, authorContext: authorContext(author) },
          200,
          requestId,
        )
      } catch (error) {
        return apiErrorResponse(error, requestId)
      }
    },
  )
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: postId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (identity, requestId) => {
      try {
        const repository = getRepositoryForSite(siteId)
        const current = await repository.get(postId)
        if (!current)
          return apiResponse(
            { error: { code: 'not_found', message: 'Post not found' } },
            404,
            requestId,
          )
        assertRevision(current, request)
        await repository.remove(postId)
        auditAutomation('content.site.deleted', identity, {
          siteId,
          postId,
          revision: current.revision,
        })
        return apiResponse({ siteId, deleted: true }, 200, requestId)
      } catch (error) {
        return apiErrorResponse(error, requestId)
      }
    },
  )
}
