import {
  apiErrorResponse,
  apiResponse,
  withAutomation,
} from '../../../../lib/automation-auth'
import { getRepository } from '../../../../lib/repository'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAutomation(request, 'publisher', async (_identity, requestId) => {
    try {
      const { id } = await context.params
      const operation = await getRepository().getBuildJob(id)
      if (!operation)
        return apiResponse(
          {
            error: {
              code: 'not_found',
              message: 'Operation not found',
              requestId,
            },
          },
          404,
          requestId,
        )
      const terminal = ['published', 'failed'].includes(operation.status)
      return apiResponse(
        {
          operation: {
            id: operation.jobId,
            status: operation.status,
            terminal,
            retryable: operation.status === 'failed',
            attempts: operation.attempts,
            updatedAt: operation.updatedAt,
          },
        },
        200,
        requestId,
      )
    } catch (error) {
      return apiErrorResponse(error, requestId)
    }
  })
}
