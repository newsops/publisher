import { assertSameOrigin, authErrorResponse, logout } from '../../../lib/auth'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    return await logout(request)
  } catch (error) {
    return authErrorResponse(error)
  }
}
