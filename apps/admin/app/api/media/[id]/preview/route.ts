import {
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../../lib/auth'
import { readApprovedMediaPreview } from '../../../../lib/media-service'
import {
  repositoryForRequest,
  requestedSiteId,
} from '../../../../lib/request-repository'

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    repositoryForRequest(request, identity)
    const variant = new URL(request.url).searchParams.get('variant')
    if (!variant || !/^[a-f0-9]{64}$/.test(variant))
      return Response.json(
        { error: 'Approved media variant is required' },
        { status: 400 },
      )
    const { id } = await params
    const preview = await readApprovedMediaPreview(
      id,
      requestedSiteId(request),
      variant,
    )
    if (!preview)
      return Response.json(
        { error: 'Approved media was not found' },
        { status: 404 },
      )
    return new Response(preview.body as unknown as BodyInit, {
      headers: {
        'content-type': preview.mimeType,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
