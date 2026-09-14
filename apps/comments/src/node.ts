import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { Readable } from 'node:stream'
import { createCommentHandler, handlerDependencies } from './app'
import type { CommentEnv } from './types'

function environment(): CommentEnv {
  return {
    COMMENTS_DATABASE_URL: process.env.COMMENTS_DATABASE_URL,
    HUMAN_VERIFICATION_URL: process.env.HUMAN_VERIFICATION_URL,
    HUMAN_VERIFICATION_SECRET: process.env.HUMAN_VERIFICATION_SECRET,
    COMMENTS_MODERATION_TOKEN: process.env.COMMENTS_MODERATION_TOKEN,
    PUBLIC_ORIGINS: process.env.PUBLIC_ORIGINS,
    MAX_COMMENT_BODY_BYTES: process.env.MAX_COMMENT_BODY_BYTES,
    RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS,
    RATE_LIMIT_PER_IP: process.env.RATE_LIMIT_PER_IP,
    RATE_LIMIT_PER_THREAD: process.env.RATE_LIMIT_PER_THREAD,
  }
}

function requestUrl(request: IncomingMessage): URL {
  const protocol = request.headers['x-forwarded-proto'] ?? 'http'
  const host = request.headers.host ?? 'localhost'
  return new URL(request.url ?? '/', `${protocol}://${host}`)
}

async function webRequest(request: IncomingMessage): Promise<Request> {
  const method = request.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value))
      for (const item of value) headers.append(name, item)
    else if (value !== undefined) headers.set(name, value)
  }
  headers.delete('x-client-ip')
  if (request.socket.remoteAddress)
    headers.set('x-client-ip', request.socket.remoteAddress)
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(request)
  return new Request(requestUrl(request), {
    method,
    headers,
    body: body as BodyInit | undefined,
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit)
}

async function send(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status
  response.headers.forEach((value, name) => target.setHeader(name, value))
  if (!response.body) return void target.end()
  target.end(Buffer.from(await response.arrayBuffer()))
}

const handler = createCommentHandler(handlerDependencies(environment()))
const port = Number(process.env.PORT ?? 8787)
createServer(async (request, response) => {
  try {
    await send(await handler(await webRequest(request)), response)
  } catch (error) {
    console.error(error)
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Comment service unavailable' }))
  }
}).listen(port, () => {
  console.log(`[comments] listening on ${port}`)
})
