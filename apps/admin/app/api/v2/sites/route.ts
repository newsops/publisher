import {
  apiErrorResponse,
  apiResponse,
  withAutomation,
} from '../../../lib/automation-auth'
import { getSiteRegistry } from '../../../lib/site-registry'

export async function GET(request: Request): Promise<Response> {
  return withAutomation(request, 'editor', async (_identity, id) =>
    apiResponse({ sites: await getSiteRegistry().list() }, 200, id),
  )
}

export async function POST(request: Request): Promise<Response> {
  return withAutomation(request, 'publisher', async (_identity, id) => {
    try {
      const body = (await request.json()) as Record<string, unknown>
      if (
        typeof body.siteId !== 'string' ||
        typeof body.name !== 'string' ||
        typeof body.canonicalOrigin !== 'string' ||
        (body.themeId !== undefined && typeof body.themeId !== 'string')
      )
        throw new Error('Invalid site input')
      const site = await getSiteRegistry().create({
        siteId: body.siteId,
        name: body.name,
        canonicalOrigin: body.canonicalOrigin,
        themeId: body.themeId,
      })
      return apiResponse({ site }, 201, id)
    } catch (error) {
      return apiErrorResponse(error, id)
    }
  })
}
