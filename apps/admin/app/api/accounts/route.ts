import {
  assertSameOrigin,
  authErrorResponse,
  createAccount,
  listAccounts,
  requireIdentity,
} from '../../lib/http/auth'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'owner')
    return Response.json(
      { accounts: await listAccounts(identity) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'owner')
    assertSameOrigin(request)
    const body = (await request.json()) as Record<string, unknown>
    return Response.json(
      { account: await createAccount(identity, body) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
