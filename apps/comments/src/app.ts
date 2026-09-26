import { PostgresCommentStore, PostgresRateLimiter } from './postgres-db'
import type { PostgresPool } from '@publisher/persistence/postgres'
import {
  DEFAULT_BODY_LIMIT,
  MAX_AUTHOR_NAME_LENGTH,
  MAX_COMMENT_TEXT_LENGTH,
  SLUG_PATTERN,
  readBodyWithLimit,
  requestIp,
  sanitizePlainText,
} from './security'
import { createHumanVerifier } from './human-verification'
import type {
  CommentCache,
  CommentEnv,
  CommentStore,
  RateLimiter,
  HumanVerifier,
} from './types'

const READ_CACHE_CONTROL =
  'public, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400'
const NO_STORE = 'no-store'

export interface CommentHandlerDependencies {
  readonly store: CommentStore
  readonly limiter: RateLimiter
  readonly verifier: HumanVerifier
  readonly cache?: CommentCache
  readonly publicOrigins?: Readonly<Record<string, string>>
  readonly bodyLimit?: number
  readonly rateLimitWindowSeconds?: number
  readonly rateLimitPerIp?: number
  readonly rateLimitPerThread?: number
  readonly moderationToken?: string
}

function json(body: unknown, status = 200, cacheControl = NO_STORE): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

function empty(status: 204, cacheControl = NO_STORE): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

function withCors(response: Response, publicOrigin?: string): Response {
  if (publicOrigin) {
    response.headers.set('Access-Control-Allow-Origin', publicOrigin)
    response.headers.set('Vary', 'Origin')
  }
  return response
}

function error(message: string, status: number): Response {
  return json({ error: message }, status)
}

interface SiteThread {
  readonly siteId: string
  readonly slug: string
}

function siteThread(request: Request): SiteThread | undefined {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  if (
    segments.length !== 5 ||
    segments[0] !== 'v1' ||
    segments[1] !== 'sites' ||
    segments[3] !== 'threads'
  )
    return undefined
  const siteId = decodeURIComponent(segments[2])
  const slug = decodeURIComponent(segments[4])
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(siteId) && SLUG_PATTERN.test(slug)
    ? { siteId, slug }
    : undefined
}

function moderationPath(
  request: Request,
): { siteId: string; id?: string; list: boolean } | undefined {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  if (
    segments[0] !== 'v1' ||
    segments[1] !== 'sites' ||
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(segments[2]) ||
    segments[3] !== 'moderation' ||
    segments[4] !== 'comments'
  )
    return undefined
  if (segments.length === 5) return { siteId: segments[2], list: true }
  if (segments.length === 6 && /^[a-zA-Z0-9-]{1,100}$/.test(segments[5]))
    return { siteId: segments[2], id: segments[5], list: false }
  return undefined
}

function cacheKey(request: Request): Request {
  const url = new URL(request.url)
  return new Request(`${url.origin}${url.pathname}`, { method: 'GET' })
}

function threadCacheKey(
  request: Request,
  siteId: string,
  slug: string,
): Request {
  return new Request(
    new URL(
      `/v1/sites/${encodeURIComponent(siteId)}/threads/${encodeURIComponent(slug)}`,
      request.url,
    ),
    { method: 'GET' },
  )
}

function authToken(request: Request): string | undefined {
  const value = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(value)
  return match?.[1]
}

function constantTimeEqual(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right || left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

async function readJson(
  request: Request,
  limit: number,
): Promise<Record<string, unknown> | undefined> {
  const raw = await readBodyWithLimit(request, limit)
  if (raw === undefined) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

async function handleRead(
  request: Request,
  thread: SiteThread,
  dependencies: CommentHandlerDependencies,
): Promise<Response> {
  const key = cacheKey(request)
  const cached = await dependencies.cache?.match(key)
  if (cached) return cached
  const comments = await dependencies.store.listApproved(
    thread.siteId,
    thread.slug,
  )
  const response = json(
    { siteId: thread.siteId, slug: thread.slug, comments },
    200,
    READ_CACHE_CONTROL,
  )
  if (dependencies.cache) await dependencies.cache.put(key, response.clone())
  return response
}

async function commentRateAllowed(
  request: Request,
  thread: SiteThread,
  dependencies: CommentHandlerDependencies,
): Promise<boolean> {
  const windowSeconds = dependencies.rateLimitWindowSeconds ?? 900
  const ip = requestIp(request)
  const threadAllowed = dependencies.limiter.consume(
    `thread:${thread.siteId}:${thread.slug}`,
    dependencies.rateLimitPerThread ?? 20,
    windowSeconds,
  )
  if (!ip) return threadAllowed
  const ipAllowed = dependencies.limiter.consume(
    `ip:${ip}`,
    dependencies.rateLimitPerIp ?? 5,
    windowSeconds,
  )
  const [resolvedIpAllowed, resolvedThreadAllowed] = await Promise.all([
    ipAllowed,
    threadAllowed,
  ])
  return resolvedIpAllowed && resolvedThreadAllowed
}

async function handleWrite(
  request: Request,
  thread: SiteThread,
  dependencies: CommentHandlerDependencies,
): Promise<Response> {
  const allowedOrigin = dependencies.publicOrigins?.[thread.siteId]
  if (allowedOrigin && request.headers.get('origin') !== allowedOrigin)
    return error('Comment origin is not allowed', 403)
  const body = await readJson(
    request,
    dependencies.bodyLimit ?? DEFAULT_BODY_LIMIT,
  )
  if (!body) return error('Request body is invalid or too large', 413)
  const token =
    typeof body.verificationToken === 'string'
      ? body.verificationToken.trim()
      : ''
  if (!(await dependencies.verifier.verify(token, requestIp(request))))
    return error('Human verification failed', 403)
  const authorName = sanitizePlainText(
    typeof body.authorName === 'string' ? body.authorName : '',
    MAX_AUTHOR_NAME_LENGTH,
  )
  const commentBody = sanitizePlainText(
    typeof body.body === 'string' ? body.body : '',
    MAX_COMMENT_TEXT_LENGTH,
  )
  if (!authorName || !commentBody)
    return error('Author name and comment body are required', 400)
  if (!(await commentRateAllowed(request, thread, dependencies)))
    return error('Comment rate limit exceeded', 429)
  const createdAt = new Date().toISOString()
  await dependencies.store.createPending({
    id: crypto.randomUUID(),
    siteId: thread.siteId,
    slug: thread.slug,
    authorName,
    body: commentBody,
    createdAt,
  })
  return json({ status: 'pending' }, 202)
}

async function handleModeration(
  request: Request,
  route: { siteId: string; id?: string; list: boolean },
  dependencies: CommentHandlerDependencies,
): Promise<Response> {
  if (!constantTimeEqual(authToken(request), dependencies.moderationToken))
    return error('Moderation authentication required', 401)
  if (route.list && request.method === 'GET') {
    const statusValue = new URL(request.url).searchParams.get('status')
    const status =
      statusValue === 'pending' ||
      statusValue === 'approved' ||
      statusValue === 'rejected'
        ? statusValue
        : undefined
    return json({
      comments: await dependencies.store.listForModeration(
        route.siteId,
        status,
      ),
    })
  }
  if (route.id && request.method === 'PATCH') {
    const body = await readJson(request, 4096)
    const status = body?.status
    if (status !== 'approved' && status !== 'rejected')
      return error('Moderation status must be approved or rejected', 400)
    const comment = await dependencies.store.setStatus(
      route.siteId,
      route.id,
      status,
    )
    if (comment && dependencies.cache?.delete)
      await dependencies.cache.delete(
        threadCacheKey(request, comment.siteId, comment.slug),
      )
    return comment ? json({ comment }) : error('Comment not found', 404)
  }
  return error('Method not allowed', 405)
}

export function createCommentHandler(
  dependencies: CommentHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let response: Response
    if (request.method === 'OPTIONS') response = empty(204)
    else {
      const moderation = moderationPath(request)
      if (moderation)
        response = await handleModeration(request, moderation, dependencies)
      else {
        const thread = siteThread(request)
        if (!thread) response = error('Not found', 404)
        else if (request.method === 'GET')
          response = await handleRead(request, thread, dependencies)
        else if (request.method === 'POST')
          response = await handleWrite(request, thread, dependencies)
        else response = error('Method not allowed', 405)
      }
    }
    const thread = siteThread(request)
    const moderation = moderationPath(request)
    return withCors(
      response,
      dependencies.publicOrigins?.[thread?.siteId ?? moderation?.siteId ?? ''],
    )
  }
}

export function handlerDependencies(
  env: CommentEnv,
  cache?: CommentCache,
  pool?: PostgresPool,
): CommentHandlerDependencies {
  const connectionString = env.COMMENTS_DATABASE_URL?.trim()
  if (!connectionString)
    throw new Error('COMMENTS_DATABASE_URL is required for comment persistence')
  return {
    store: new PostgresCommentStore(connectionString, pool),
    limiter: new PostgresRateLimiter(connectionString, pool),
    verifier: createHumanVerifier(
      env.HUMAN_VERIFICATION_URL,
      env.HUMAN_VERIFICATION_SECRET,
    ),
    cache,
    publicOrigins: parsePublicOrigins(env.PUBLIC_ORIGINS),
    bodyLimit: Number(env.MAX_COMMENT_BODY_BYTES) || DEFAULT_BODY_LIMIT,
    rateLimitWindowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS) || 900,
    rateLimitPerIp: Number(env.RATE_LIMIT_PER_IP) || 5,
    rateLimitPerThread: Number(env.RATE_LIMIT_PER_THREAD) || 20,
    moderationToken: env.COMMENTS_MODERATION_TOKEN,
  }
}

function parsePublicOrigins(
  value: string | undefined,
): Readonly<Record<string, string>> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([siteId, origin]) =>
          /^[a-z0-9][a-z0-9-]{0,62}$/.test(siteId) &&
          typeof origin === 'string' &&
          /^https:\/\/[^/]+$/.test(origin),
      ),
    )
  } catch {
    return {}
  }
}

export { READ_CACHE_CONTROL }
