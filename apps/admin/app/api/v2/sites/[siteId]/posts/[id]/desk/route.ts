import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../../../lib/http/automation-auth'
import {
  parseJsonBody,
  revisionFrom,
} from '../../../../../../../lib/http/api-request'
import {
  DeskDecisionError,
  decideDesk,
  deskReportFor,
  deskReviewerFor,
  parseDeskDecision,
} from '../../../../../../../lib'
import { getRepositoryForSite } from '../../../../../../../lib'

/**
 * Desk review (EDIT-001). GET exposes the check guide for a post; POST
 * records an approve / request-changes decision. Approval requires every
 * automated check to pass and every self-check item to be attested.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: postId } = await context.params
  return withSiteAutomation(
    request,
    'editor',
    siteId,
    async (_identity, id) => {
      try {
        const post = await getRepositoryForSite(siteId).get(postId)
        if (!post)
          return apiResponse(
            { error: { code: 'not_found', message: 'Post not found' } },
            404,
            id,
          )
        const report = await deskReportFor(siteId, post)
        return apiResponse(
          {
            siteId,
            postId,
            revision: post.revision,
            status: post.status,
            report,
          },
          200,
          id,
        )
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: postId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (identity, id) => {
      try {
        const current = await getRepositoryForSite(siteId).get(postId)
        if (!current)
          return apiResponse(
            { error: { code: 'not_found', message: 'Post not found' } },
            404,
            id,
          )
        if (revisionFrom(request) !== current.revision)
          return apiResponse(
            {
              error: {
                code: 'revision_conflict',
                message: 'The post changed; reload it before deciding',
              },
            },
            409,
            id,
          )
        const decision = parseDeskDecision(await parseJsonBody(request))
        const result = await decideDesk(
          siteId,
          postId,
          decision,
          deskReviewerFor(identity),
        )
        auditAutomation(
          decision.action === 'approve'
            ? 'content.site.desk.approved'
            : 'content.site.desk.changes_requested',
          identity,
          {
            siteId,
            postId,
            revision: result.post.revision,
            contentFingerprint: result.report.contentFingerprint,
          },
        )
        return apiResponse(
          {
            siteId,
            postId,
            revision: result.post.revision,
            status: result.post.status,
            report: result.report,
          },
          200,
          id,
        )
      } catch (error) {
        if (error instanceof DeskDecisionError)
          return apiResponse(
            {
              error: { code: error.code, message: error.message },
              siteId,
              postId,
              report: error.report,
            },
            error.status,
            id,
          )
        return apiErrorResponse(error, id)
      }
    },
  )
}
