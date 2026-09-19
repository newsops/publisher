import {
  assertSameOrigin,
  authErrorResponse,
  enforceRateLimit,
  requireIdentity,
} from '../../../lib/http/auth'
import { resolveXPostOEmbed } from '../../../lib/services/x-oembed'

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireIdentity(request, 'editor')
    enforceRateLimit(request, identity)
    assertSameOrigin(request)
    const body = (await request.json()) as { url?: unknown }
    if (typeof body.url !== 'string')
      return Response.json({ error: 'url is required' }, { status: 400 })
    return Response.json(
      { embed: await resolveXPostOEmbed(body.url) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return authErrorResponse(error)
  }
}
