import { timingSafeEqual } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { ContentValidationError } from '@publisher/content'
import { ApiRequestError } from './api-error'

export type AdminRole = 'editor' | 'publisher'

export interface AdminIdentity {
  readonly email: string
  readonly subject: string
  readonly roles: readonly AdminRole[]
}

export class AdminAuthError extends Error {
  readonly status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AdminAuthError'
    this.status = status
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new AdminAuthError(`Missing server configuration: ${name}`, 503)
  return value
}

function splitAudience(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasPublisherRole(email: string): boolean {
  return splitAudience(process.env.ADMIN_PUBLISHERS ?? '').some(
    (candidate) => candidate.toLowerCase() === email.toLowerCase(),
  )
}

function devIdentity(request: Request): AdminIdentity | undefined {
  if (process.env.NODE_ENV === 'production') return undefined
  const expected = process.env.ADMIN_DEV_TOKEN
  const received = request.headers.get('x-admin-dev-token')
  if (!expected || !received) return undefined
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  )
    return undefined
  const email =
    request.headers.get('x-admin-dev-email') ?? 'local-admin@localhost'
  return {
    email,
    subject: `dev:${email}`,
    roles: hasPublisherRole(email) ? ['editor', 'publisher'] : ['editor'],
  }
}

function claimEmail(payload: JWTPayload): string {
  if (typeof payload.email !== 'string' || payload.email.length === 0)
    throw new AdminAuthError('Authenticated token has no email claim')
  return payload.email
}

function identityToken(request: Request): string | undefined {
  const header = (
    process.env.OIDC_TOKEN_HEADER ?? 'authorization'
  ).toLowerCase()
  const value = request.headers.get(header)?.trim()
  if (!value) return undefined
  return header === 'authorization'
    ? /^Bearer\s+(.+)$/i.exec(value)?.[1]
    : value
}

async function oidcIdentity(request: Request): Promise<AdminIdentity> {
  const token = identityToken(request)
  if (!token) throw new AdminAuthError('OIDC authentication required')
  const issuer = requiredEnv('OIDC_ISSUER').replace(/\/$/, '')
  const audience = splitAudience(requiredEnv('OIDC_AUDIENCE'))
  const jwks = createRemoteJWKSet(new URL(requiredEnv('OIDC_JWKS_URL')))
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
  })
  const claim = process.env.OIDC_EMAIL_CLAIM ?? 'email'
  const email =
    claim === 'email'
      ? claimEmail(payload)
      : typeof payload[claim] === 'string' && payload[claim]
        ? payload[claim]
        : (() => {
            throw new AdminAuthError(
              `Authenticated token has no ${claim} claim`,
            )
          })()
  const roles: AdminRole[] = ['editor']
  if (hasPublisherRole(email)) roles.push('publisher')
  return {
    email,
    subject: typeof payload.sub === 'string' ? payload.sub : email,
    roles,
  }
}

export async function requireIdentity(
  request: Request,
  requiredRole: AdminRole = 'editor',
): Promise<AdminIdentity> {
  const identity = devIdentity(request) ?? (await oidcIdentity(request))
  if (!identity.roles.includes(requiredRole))
    throw new AdminAuthError(`Role required: ${requiredRole}`, 403)
  return identity
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin)
    throw new AdminAuthError('Origin header required for mutations', 403)
  const expected = process.env.ADMIN_PUBLIC_ORIGIN ?? 'http://localhost:3001'
  if (origin !== expected)
    throw new AdminAuthError('Cross-origin mutation rejected', 403)
}

const requestBuckets = new Map<string, { count: number; resetAt: number }>()

export function enforceRateLimit(
  request: Request,
  identity: AdminIdentity,
): void {
  const now = Date.now()
  const windowMs = 60_000
  const key = `${identity.email}:${new URL(request.url).pathname}`
  const current = requestBuckets.get(key)
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  current.count += 1
  if (current.count > 60)
    throw new AdminAuthError('Admin rate limit exceeded', 429)
}

export function audit(
  event: string,
  identity: AdminIdentity,
  details: Record<string, unknown> = {},
): void {
  console.info(
    JSON.stringify({
      event,
      actor: identity.email,
      at: new Date().toISOString(),
      ...details,
    }),
  )
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof ApiRequestError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    )
  if (error instanceof ContentValidationError)
    return Response.json(
      { error: error.message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  if (error instanceof AdminAuthError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    )
  console.error(error)
  return Response.json(
    { error: 'Admin authentication failed' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  )
}
