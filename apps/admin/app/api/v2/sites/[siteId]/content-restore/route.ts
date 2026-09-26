import { validateEditorialArchive } from '@publisher/content'
import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import {
  restoreArchive,
  type ArchiveRestoreMediaBinding,
} from '../../../../../lib'

function restoreInput(body: unknown, idempotencyKey: string | null) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Restore input must be an object')
  const value = body as Record<string, unknown>
  if (!Number.isSafeInteger(value.expectedRevision))
    throw new Error('expectedRevision must be an integer')
  if (!idempotencyKey) throw new Error('Idempotency-Key is required')
  const bindings = value.media
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings))
    throw new Error('media bindings are required')
  for (const binding of Object.values(bindings as Record<string, unknown>)) {
    if (!binding || typeof binding !== 'object')
      throw new Error('media binding is invalid')
    const item = binding as Record<string, unknown>
    if (
      typeof item.mediaId !== 'string' ||
      typeof item.variantSha256 !== 'string'
    )
      throw new Error('media binding is invalid')
  }
  return {
    archive: validateEditorialArchive(value.archive),
    expectedRevision: value.expectedRevision as number,
    idempotencyKey,
    media: bindings as Record<string, ArchiveRestoreMediaBinding>,
  }
}

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
        const result = await restoreArchive(
          siteId,
          restoreInput(
            await request.json(),
            request.headers.get('idempotency-key'),
          ),
        )
        auditAutomation('content.site.archive_restored', identity, {
          siteId,
          operationId: result.operationId,
          archiveDigest: result.archiveDigest,
          counts: result.counts,
        })
        return apiResponse({ operation: result }, 202, id)
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}
