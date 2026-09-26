import { authErrorResponse, requireIdentity } from '../../../lib/http/auth'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request)
    return Response.json(
      {
        account: {
          id: identity.subject,
          email: identity.email,
          roles: identity.roles,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
