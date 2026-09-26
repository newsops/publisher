import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import { getRepositoryForSite } from '../../../../../lib'
import { publicationIdempotencyKey } from '../../../../../lib'

export async function POST(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (identity, id) => {
      try {
        const result = await getRepositoryForSite(siteId).publish(
          publicationIdempotencyKey(request),
        )
        auditAutomation('content.site.published', identity, {
          siteId,
          snapshotId: result.snapshot.snapshotId,
          checksum: result.checksum,
          delivery: result.delivery.mode,
          jobId: result.jobId,
        })
        return apiResponse(
          {
            siteId,
            snapshotId: result.snapshot.snapshotId,
            checksum: result.checksum,
            delivery: result.delivery,
            jobId: result.jobId,
            jobStatus: result.jobStatus,
          },
          202,
          id,
        )
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}
