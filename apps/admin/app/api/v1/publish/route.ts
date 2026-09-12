import {
  apiResponse,
  apiErrorResponse,
  auditAutomation,
  withAutomation,
} from '../../../lib/automation-auth'
import { getRepository } from '../../../lib/repository'
import { publicationIdempotencyKey } from '../../../lib/publisher'

export async function POST(request: Request): Promise<Response> {
  return withAutomation(request, 'publisher', async (identity, id) => {
    try {
      const result = await getRepository().publish(
        publicationIdempotencyKey(request),
      )
      auditAutomation('content.automation.published', identity, {
        snapshotId: result.snapshot.snapshotId,
        checksum: result.checksum,
        delivery: result.delivery.mode,
        jobId: result.jobId,
      })
      return apiResponse(
        {
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
  })
}
