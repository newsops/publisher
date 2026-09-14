import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { ContentValidationError } from '@publisher/content'
import {
  AdminAuthError,
  type AdminIdentity,
  audit,
  enforceRateLimit,
} from './auth'
import { ApiRequestError } from './api-error'
import { getSiteRegistry } from './site-registry'

export { ApiRequestError as AutomationApiError } from './api-error'

type AutomationRole = 'editor' | 'publisher'

interface AutomationKeyRecord {
  readonly id: string
  readonly role: AutomationRole
  readonly sha256: string
  readonly sites?: readonly string[]
}

function keyRecords(): readonly AutomationKeyRecord[] {
  const rings = [
    process.env.ADMIN_AUTOMATION_KEYS,
    process.env.ADMIN_AUTOMATION_KEYS_EXTRA,
  ].filter((value): value is string => Boolean(value))
  if (rings.length === 0)
    throw new AdminAuthError('Automation authentication unavailable', 503)
  try {
    const records = rings.flatMap((raw) => parseKeyring(raw))
    if (new Set(records.map((record) => record.id)).size !== records.length)
      throw new Error('duplicate record id')
    return records
  } catch {
    throw new AdminAuthError('Automation authentication unavailable', 503)
  }
}

function parseKeyring(raw: string): readonly AutomationKeyRecord[] {
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('not an array')
  const records = parsed.filter(
    (item): item is AutomationKeyRecord =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).id === 'string' &&
      ((item as Record<string, unknown>).role === 'editor' ||
        (item as Record<string, unknown>).role === 'publisher') &&
      typeof (item as Record<string, unknown>).sha256 === 'string' &&
      ((item as Record<string, unknown>).sites === undefined ||
        (Array.isArray((item as Record<string, unknown>).sites) &&
          ((item as Record<string, unknown>).sites as unknown[]).every(
            (site: unknown) => typeof site === 'string',
          ))) &&
      /^[a-f0-9]{64}$/.test((item as Record<string, unknown>).sha256 as string),
  )
  if (records.length !== parsed.length) throw new Error('invalid record')
  return records.map((record, index) => {
    const source = parsed[index] as Record<string, unknown>
    return {
      ...record,
      sites: Array.isArray(source.sites) ? source.sites : undefined,
    }
  })
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(header)
  if (!match) throw new AdminAuthError('Authentication required', 401)
  return match[1]
}

function digestToken(token: string): Buffer {
  return createHash('sha256').update(token).digest()
}

function digestFromHex(value: string): Buffer {
  return Buffer.from(value, 'hex')
}

export function requireAutomationIdentity(
  request: Request,
  requiredRole: AutomationRole = 'editor',
): AdminIdentity {
  const digest = digestToken(bearerToken(request))
  let match: AutomationKeyRecord | undefined
  for (const record of keyRecords()) {
    const expected = digestFromHex(record.sha256)
    const equal =
      expected.length === digest.length && timingSafeEqual(expected, digest)
    if (equal && !match) match = record
  }
  if (!match) throw new AdminAuthError('Authentication required', 401)
  const roles: AdminIdentity['roles'] =
    match.role === 'publisher' ? ['editor', 'publisher'] : ['editor']
  if (!roles.includes(requiredRole as 'editor' | 'publisher'))
    throw new AdminAuthError(`Role required: ${requiredRole}`, 403)
  return {
    email: `${match.id}@automation.local`,
    subject: `automation:${match.id}`,
    roles,
  }
}

export function requireSiteAutomationIdentity(
  request: Request,
  requiredRole: AutomationRole,
  siteId: string,
): AdminIdentity {
  const identity = requireAutomationIdentity(request, requiredRole)
  const token = bearerToken(request)
  const digest = digestToken(token)
  const record = keyRecords().find((candidate) => {
    const expected = digestFromHex(candidate.sha256)
    return (
      expected.length === digest.length && timingSafeEqual(expected, digest)
    )
  })
  if (!record?.sites?.length)
    throw new AdminAuthError('Automation key has no site scope', 403)
  if (!record.sites.includes(siteId))
    throw new AdminAuthError(
      'Automation key is not authorized for this site',
      403,
    )
  return identity
}

export function requestId(): string {
  return randomUUID()
}

export function apiResponse(
  body: unknown,
  status: number,
  id: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': id,
    },
  })
}

export function apiErrorResponse(error: unknown, id: string): Response {
  const message = error instanceof Error ? error.message : ''
  const repositoryError = message.includes('revision conflict')
    ? new ApiRequestError(
        'revision_conflict',
        'The resource changed; reload it before updating or deleting',
        409,
      )
    : message === 'Article not found' || message === 'Variant not found'
      ? new ApiRequestError('not_found', message, 404)
      : undefined
  const known =
    error instanceof ApiRequestError
      ? error
      : error instanceof AdminAuthError
        ? new ApiRequestError(
            error.status === 503
              ? 'service_unavailable'
              : error.status === 403
                ? 'forbidden'
                : 'unauthorized',
            error.status === 503
              ? 'Automation authentication unavailable'
              : error.message,
            error.status,
          )
        : (repositoryError ??
          (error instanceof ContentValidationError
            ? new ApiRequestError('validation_failed', error.message, 400)
            : undefined))
  if (!known) console.error(error)
  const status = known?.status ?? 500
  return apiResponse(
    {
      error: {
        code: known?.code ?? 'internal_error',
        message: known?.message ?? 'Automation API request failed',
        requestId: id,
      },
    },
    status,
    id,
  )
}

export async function withAutomation(
  request: Request,
  requiredRole: AutomationRole,
  handler: (identity: AdminIdentity, id: string) => Promise<Response>,
): Promise<Response> {
  const id = requestId()
  try {
    const identity = requireAutomationIdentity(request, requiredRole)
    enforceRateLimit(request, identity)
    return await handler(identity, id)
  } catch (error) {
    return apiErrorResponse(error, id)
  }
}

export async function withSiteAutomation(
  request: Request,
  requiredRole: AutomationRole,
  siteId: string,
  handler: (identity: AdminIdentity, id: string) => Promise<Response>,
): Promise<Response> {
  const id = requestId()
  try {
    const identity = requireSiteAutomationIdentity(
      request,
      requiredRole,
      siteId,
    )
    // Local isolated repositories are intentionally usable without a database
    // for deterministic contract tests. Every deployed admin runtime has
    // DATABASE_URL and therefore verifies the PostgreSQL registry first.
    if (process.env.DATABASE_URL) await getSiteRegistry().require(siteId)
    enforceRateLimit(request, identity)
    return await handler(identity, id)
  } catch (error) {
    return apiErrorResponse(error, id)
  }
}

export function auditAutomation(
  event: string,
  identity: AdminIdentity,
  details: Record<string, unknown> = {},
): void {
  audit(event, identity, details)
}
