import {
  apiErrorResponse,
  apiResponse,
  withSiteAutomation,
} from '../../../../lib/http/automation-auth'
import { getSiteRegistry } from '../../../../lib'

export async function GET(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(request, 'editor', siteId, async (_identity, id) =>
    apiResponse({ site: await getSiteRegistry().require(siteId) }, 200, id),
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (_identity, id) => {
      try {
        const body = (await request.json()) as Record<string, unknown>
        if (
          typeof body.name !== 'string' ||
          typeof body.canonicalOrigin !== 'string' ||
          (body.themeId !== undefined && typeof body.themeId !== 'string')
        )
          throw new Error('Invalid site input')
        const site = await getSiteRegistry().update(siteId, {
          name: body.name,
          canonicalOrigin: body.canonicalOrigin,
          themeId: body.themeId,
        })
        return apiResponse({ site }, 200, id)
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await context.params
  return withSiteAutomation(
    request,
    'publisher',
    siteId,
    async (_identity, id) => {
      try {
        const site = await getSiteRegistry().archive(siteId)
        return apiResponse({ site }, 200, id)
      } catch (error) {
        return apiErrorResponse(error, id)
      }
    },
  )
}
