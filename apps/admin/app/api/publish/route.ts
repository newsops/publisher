import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/http/auth'
import { repositoryForRequest } from '../../lib/http/request-repository'
import { publicationIdempotencyKey } from '../../lib'

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const result = await repositoryForRequest(request, identity).publish(
      publicationIdempotencyKey(request),
    )
    audit('content.published', identity, {
      snapshotId: result.snapshot.snapshotId,
      checksum: result.checksum,
      delivery: result.delivery.mode,
      jobId: result.jobId,
    })
    return Response.json(
      {
        snapshotId: result.snapshot.snapshotId,
        checksum: result.checksum,
        delivery: result.delivery,
        jobId: result.jobId,
        jobStatus: result.jobStatus,
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
