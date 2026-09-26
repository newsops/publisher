import {
  apiErrorResponse,
  apiResponse,
  withSiteAutomation,
} from '../../../../../../lib/http/automation-auth'
import {
  findArchiveRestoreOperation,
  getRepositoryForSite,
} from '../../../../../../lib'

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
        const restore = await findArchiveRestoreOperation(siteId, operationId)
        if (restore)
          return apiResponse(
            {
              operation: {
                id: operationId,
                kind: 'archive_restore',
                status: 'completed',
                terminal: true,
                retryable: false,
                updatedAt: restore.createdAt,
                result: restore.result,
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
