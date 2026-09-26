import {
  apiErrorResponse,
  apiResponse,
  auditAutomation,
  withSiteAutomation,
} from '../../../../../lib/http/automation-auth'
import { approveImage, listMedia, uploadImage } from '../../../../../lib'
import { browserMediaView } from '../../../../../lib/http/media-view'

const maximumBytes = 10 * 1024 * 1024

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (_identity, id) =>
      apiResponse(
        { siteId, media: (await listMedia(siteId)).map(browserMediaView) },
        200,
        id,
      ),
  )
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
        const contentLength = request.headers.get('content-length')
        if (!contentLength || !/^\d+$/.test(contentLength))
          throw new Error(
            'A valid Content-Length is required for image uploads',
          )
        if (Number(contentLength) > maximumBytes + 64 * 1024)
          throw new Error('Image upload is too large')
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) throw new Error('Image file is required')
        const media = await uploadImage({
          siteId,
          fileName: file.name,
          mimeType: file.type,
          sha256:
            typeof form.get('sha256') === 'string'
              ? String(form.get('sha256'))
              : undefined,
          body: new Uint8Array(await file.arrayBuffer()),
        })
        auditAutomation('content.site.media_uploaded', identity, {
          siteId,
          mediaId: media.id,
          sha256: media.sha256,
        })
        return apiResponse({ siteId, media: browserMediaView(media) }, 201, id)
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}

export async function PUT(
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
        const body = (await request.json()) as { mediaId?: unknown }
        if (typeof body.mediaId !== 'string')
          throw new Error('mediaId is required')
        const media = await approveImage(body.mediaId, siteId)
        auditAutomation('content.site.media_approved', identity, {
          siteId,
          mediaId: media.id,
          variants: media.variants.length,
        })
        return apiResponse({ siteId, media: browserMediaView(media) }, 200, id)
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}
