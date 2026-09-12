import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../../lib/auth'
import { approveImage } from '../../../../lib/media-service'
import {
  repositoryForRequest,
  requestedSiteId,
} from '../../../../lib/request-repository'

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    repositoryForRequest(request, identity)
    const { id } = await params
    const media = await approveImage(id, requestedSiteId(request))
    audit('media.approved', identity, {
      mediaId: media.id,
      siteId: media.siteId,
      variants: media.variants.length,
    })
    return Response.json({ media })
  } catch (error) {
    return authErrorResponse(error)
  }
}
