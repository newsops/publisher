import {
  assertSameOrigin,
  authErrorResponse,
  requireIdentity,
} from '../../lib/http/auth'
import { getSiteRegistry } from '../../lib'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    const sites = await getSiteRegistry().list()
    return Response.json(
      { sites },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireIdentity(request, 'owner')
    assertSameOrigin(request)
    const body = (await request.json()) as Record<string, unknown>
    if (
      typeof body.siteId !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.canonicalOrigin !== 'string' ||
      (body.themeId !== undefined && typeof body.themeId !== 'string')
    )
      return Response.json({ error: 'Invalid site input' }, { status: 400 })
    const site = await getSiteRegistry().create({
      siteId: body.siteId,
      name: body.name,
      canonicalOrigin: body.canonicalOrigin,
      themeId: body.themeId,
    })
    return Response.json(
      { site },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
