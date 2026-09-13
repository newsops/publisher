import {
  assertSameOrigin,
  audit,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../lib/auth'
import { listMedia, uploadImage } from '../../lib/media-service'
import { browserMediaView } from '../../lib/media-view'
import {
  repositoryForRequest,
  requestedSiteId,
} from '../../lib/request-repository'

const maximumBytes = 10 * 1024 * 1024

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    repositoryForRequest(request, identity)
    return Response.json({
      media: (await listMedia(requestedSiteId(request))).map(browserMediaView),
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'publisher')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    repositoryForRequest(request, identity)
    const contentLength = request.headers.get('content-length')
    if (!contentLength)
      return Response.json(
        { error: 'Content-Length is required for image uploads' },
        { status: 411 },
      )
    if (!/^\d+$/.test(contentLength))
      return Response.json(
        { error: 'Content-Length is invalid' },
        { status: 400 },
      )
    const length = Number(contentLength)
    if (length > maximumBytes + 64 * 1024)
      return Response.json(
        { error: 'Image upload is too large' },
        { status: 413 },
      )
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File))
      return Response.json({ error: 'Image file is required' }, { status: 400 })
    const media = await uploadImage({
      siteId: requestedSiteId(request),
      fileName: file.name,
      mimeType: file.type,
      sha256:
        typeof form.get('sha256') === 'string'
          ? (form.get('sha256') as string)
          : undefined,
      body: new Uint8Array(await file.arrayBuffer()),
    })
    audit('media.uploaded', identity, {
      mediaId: media.id,
      siteId: media.siteId,
      sha256: media.sha256,
    })
    return Response.json({ media: browserMediaView(media) }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
