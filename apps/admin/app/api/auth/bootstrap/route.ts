import {
  assertSameOrigin,
  authErrorResponse,
  bootstrapOwner,
} from '../../../lib/http/auth'

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request)
    const body = (await request.json()) as {
      email?: unknown
      password?: unknown
    }
    if (typeof body.email !== 'string' || typeof body.password !== 'string')
      return Response.json(
        { error: 'Invalid account input' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    return await bootstrapOwner(request, body.email, body.password)
  } catch (error) {
    return authErrorResponse(error)
  }
}
