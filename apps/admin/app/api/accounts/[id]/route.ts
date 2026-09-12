import {
  assertSameOrigin,
  authErrorResponse,
  requireIdentity,
  updateAccount,
} from '../../../lib/auth'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'owner')
    assertSameOrigin(request)
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    await updateAccount(identity, id, body)
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
