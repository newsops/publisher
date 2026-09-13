import { postgresPool } from '@publisher/persistence'
import {
  apiErrorResponse,
  apiResponse,
  withSiteAutomation,
} from '../../../../../../lib/automation-auth'
import { getRepositoryForSite } from '../../../../../../lib/repository'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string; id: string }> },
): Promise<Response> {
  const { siteId, id: operationId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (_identity, id) => {
      try {
        const restore = await postgresPool(
          process.env.DATABASE_URL ?? '',
        ).query<{
          result: Record<string, unknown>
          created_at: Date
        }>(
          `SELECT result, created_at FROM publisher_admin.archive_restore_operations
         WHERE site_id = $1 AND operation_id = $2::uuid`,
          [siteId, operationId],
        )
        if (restore.rows[0])
          return apiResponse(
            {
              operation: {
                id: operationId,
                kind: 'archive_restore',
                status: 'completed',
                terminal: true,
                retryable: false,
                updatedAt: restore.rows[0].created_at.toISOString(),
                result: restore.rows[0].result,
              },
            },
            200,
            id,
          )
        const build =
          await getRepositoryForSite(siteId).getBuildJob(operationId)
        if (!build)
          return apiResponse(
            {
              error: {
                code: 'not_found',
                message: 'Operation not found',
                requestId: id,
              },
            },
            404,
            id,
          )
        return apiResponse(
          {
            operation: {
              id: build.jobId,
              kind: 'publication',
              status: build.status,
              terminal: ['published', 'failed'].includes(build.status),
              retryable: build.status === 'failed',
              updatedAt: build.updatedAt,
            },
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
