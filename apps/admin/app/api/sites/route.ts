import { authErrorResponse, requireIdentity } from '../../lib/auth'
import { getSiteCatalog, isSiteAdmin } from '../../lib/site-catalog'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    const sites = getSiteCatalog()
      .list()
      .filter((site) => isSiteAdmin(identity.email, site))
      .map(({ adminEmails: _adminEmails, ...site }) => site)
    return Response.json(
      { sites },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
