import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { ContentValidationError } from '@publisher/content'
import {
  AccountStoreConflict,
  AccountStoreUnavailable,
  accountStore,
  adminConfig,
  type AccountUpdate,
} from '../index'
import { ApiRequestError } from './api-error'

const sessionCookie = 'publisher_admin_session'
const sessionTtlSeconds = 60 * 60 * 24 * 14

export type AdminRole = 'owner' | 'editor' | 'publisher'
export interface AdminIdentity {
  readonly email: string
  readonly subject: string
  readonly roles: readonly AdminRole[]
}
export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message)
    this.name = 'AdminAuthError'
  }
}

/** Storage outages surface as a 503, never as a stack trace. */
async function stored<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AccountStoreUnavailable)
      throw new AdminAuthError('Admin authentication unavailable', 503)
    throw error
  }
}
function roles(role: AdminRole): readonly AdminRole[] {
  return role === 'owner'
    ? ['owner', 'editor', 'publisher']
    : role === 'publisher'
      ? ['editor', 'publisher']
      : ['editor']
}
function cookie(request: Request, name: string): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
function bootstrapSecret(request: Request): string | undefined {
  return request.headers.get('x-admin-bootstrap-secret')?.trim()
}
function rateKey(request: Request): string {
  return `${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'}:${new URL(request.url).pathname}`
}
const buckets = new Map<string, { count: number; until: number }>()
function throttle(key: string, limit: number) {
  const now = Date.now()
  const value = buckets.get(key)
  if (!value || value.until <= now) {
    buckets.set(key, { count: 1, until: now + 60_000 })
    return
  }
  value.count += 1
  if (value.count > limit) throw new AdminAuthError('Too many requests', 429)
}
function derivePassword(
  password: string,
  salt: string,
  cost: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    ),
  )
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256)
    throw new AdminAuthError('Password does not meet requirements', 400)
  const salt = randomBytes(16).toString('base64url')
  const derived = await derivePassword(password, salt, 32768)
  return `scrypt$32768$${salt}$${Buffer.from(derived).toString('base64url')}`
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [kind, n, salt, digest] = stored.split('$')
  if (kind !== 'scrypt' || !n || !salt || !digest) return false
  const value = await derivePassword(password, salt, Number(n))
  const expected = Buffer.from(digest, 'base64url')
  const received = Buffer.from(value)
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}
export function sessionCookieHeader(token: string, expiresAt: Date): string {
  return `${sessionCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expiresAt.toUTCString()}; Max-Age=${sessionTtlSeconds}`
}
export function clearSessionCookieHeader(): string {
  return `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}
async function createSession(
  accountId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000)
  await stored(() =>
    accountStore().insertSession(
      randomUUID(),
      accountId,
      tokenHash(token),
      expiresAt,
    ),
  )
  return { token, expiresAt }
}

export async function requireIdentity(
  request: Request,
  requiredRole: AdminRole = 'editor',
): Promise<AdminIdentity> {
  // Harness-only identities keep local fixture routes testable without a shared
  // database. The development branch additionally requires ADMIN_DATA_DIR;
  // every production runtime still reaches the database-backed session path.
  const config = adminConfig()
  const allowsFixtureIdentity =
    config.nodeEnv === 'test' ||
    (config.nodeEnv === 'development' && Boolean(config.adminDataDir))
  if (allowsFixtureIdentity) {
    const expected = config.devToken
    const supplied = request.headers.get('x-admin-dev-token')
    const email = request.headers.get('x-admin-dev-email')?.trim().toLowerCase()
    // ADMIN_OWNERS lets the file-backed local admin drive the browser routes,
    // which require an owner for site access; ADMIN_PUBLISHERS grants publish.
    const owners = config.devOwners
    const configured = config.devPublishers
    if (
      expected &&
      supplied &&
      expected.length === supplied.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)) &&
      email
    ) {
      const capabilities = roles(
        owners.includes(email)
          ? 'owner'
          : configured.includes(email)
            ? 'publisher'
            : 'editor',
      )
      if (!capabilities.includes(requiredRole))
        throw new AdminAuthError('Role required', 403)
      return { email, subject: `test:${email}`, roles: capabilities }
    }
  }
  const token = cookie(request, sessionCookie)
  if (!token) throw new AdminAuthError('Authentication required')
  const account = await stored(() =>
    accountStore().findSessionAccount(tokenHash(token)),
  )
  if (!account) throw new AdminAuthError('Authentication required')
  const capabilities = roles(account.role)
  if (!capabilities.includes(requiredRole))
    throw new AdminAuthError('Role required', 403)
  accountStore().touchSession(tokenHash(token))
  return { email: account.email, subject: account.id, roles: capabilities }
}

export async function login(
  request: Request,
  email: string,
  password: string,
): Promise<Response> {
  throttle(rateKey(request), 10)
  throttle(`login:${email.trim().toLowerCase()}`, 10)
  const account = await stored(() =>
    accountStore().findCredentialByEmail(email.trim()),
  )
  if (!account || !(await verifyPassword(password, account.passwordHash)))
    throw new AdminAuthError('Invalid email or password')
  await stored(() => accountStore().revokeAccountSessions(account.id))
  const session = await createSession(account.id)
  return Response.json(
    { account: { email: account.email, role: account.role } },
    {
      headers: {
        'Set-Cookie': sessionCookieHeader(session.token, session.expiresAt),
        'Cache-Control': 'no-store',
      },
    },
  )
}
export async function bootstrapOwner(
  request: Request,
  email: string,
  password: string,
): Promise<Response> {
  throttle(rateKey(request), 5)
  const configured = adminConfig().bootstrapSecret
  const provided = bootstrapSecret(request)
  if (
    !configured ||
    !provided ||
    configured.length !== provided.length ||
    !timingSafeEqual(Buffer.from(configured), Buffer.from(provided))
  )
    throw new AdminAuthError('Bootstrap unavailable', 403)
  const normalized = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalized))
    throw new AdminAuthError('Invalid account input', 400)
  const passwordHash = await hashPassword(password)
  const id = randomUUID()
  try {
    await stored(() =>
      accountStore().insertFirstOwner(id, normalized, passwordHash),
    )
  } catch (error) {
    if (error instanceof AccountStoreConflict)
      throw new AdminAuthError('Bootstrap unavailable', 403)
    throw error
  }
  const session = await createSession(id)
  return Response.json(
    { account: { email: normalized, role: 'owner' } },
    {
      status: 201,
      headers: {
        'Set-Cookie': sessionCookieHeader(session.token, session.expiresAt),
        'Cache-Control': 'no-store',
      },
    },
  )
}
export async function logout(request: Request): Promise<Response> {
  const token = cookie(request, sessionCookie)
  if (token)
    await stored(() => accountStore().revokeSessionByToken(tokenHash(token)))
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookieHeader(),
        'Cache-Control': 'no-store',
      },
    },
  )
}

export async function bootstrapAvailable(): Promise<boolean> {
  if (!adminConfig().bootstrapSecret) return false
  return (await stored(() => accountStore().countAccounts())) === 0
}

function validRole(value: unknown): value is AdminRole {
  return value === 'owner' || value === 'editor' || value === 'publisher'
}
function normalizedEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320)
    throw new AdminAuthError('Invalid account input', 400)
  return email
}

export async function listAccounts(identity: AdminIdentity) {
  if (!identity.roles.includes('owner'))
    throw new AdminAuthError('Role required', 403)
  return (await stored(() => accountStore().listAccountRecords())).map(
    (account) => ({
      id: account.id,
      email: account.email,
      role: account.role,
      active: account.active,
      created_at: account.createdAt,
      password_changed_at: account.passwordChangedAt,
    }),
  )
}

export async function createAccount(
  identity: AdminIdentity,
  input: Record<string, unknown>,
) {
  if (!identity.roles.includes('owner'))
    throw new AdminAuthError('Role required', 403)
  const email = normalizedEmail(input.email)
  const role = input.role
  if (!validRole(role) || role === 'owner')
    throw new AdminAuthError('Invalid account input', 400)
  if (typeof input.password !== 'string')
    throw new AdminAuthError('Invalid account input', 400)
  const id = randomUUID()
  const passwordHash = await hashPassword(input.password)
  try {
    await stored(() =>
      accountStore().insertAccount(id, email, passwordHash, role),
    )
  } catch (error) {
    if (error instanceof AccountStoreConflict)
      throw new AdminAuthError('Account already exists', 409)
    throw error
  }
  audit('account.created', identity, { accountId: id, role })
  return { id, email, role, active: true }
}

export async function updateAccount(
  identity: AdminIdentity,
  accountId: string,
  input: Record<string, unknown>,
) {
  if (!identity.roles.includes('owner'))
    throw new AdminAuthError('Role required', 403)
  if (!/^[0-9a-f-]{36}$/i.test(accountId))
    throw new AdminAuthError('Invalid account input', 400)
  const account = await stored(() => accountStore().findAccountById(accountId))
  if (!account) throw new AdminAuthError('Account not found', 404)
  const update: { -readonly [K in keyof AccountUpdate]: AccountUpdate[K] } = {}
  if ('role' in input) {
    if (!validRole(input.role) || input.role === 'owner')
      throw new AdminAuthError('Invalid account input', 400)
    if (account.role === 'owner')
      throw new AdminAuthError('Owner account cannot be reduced', 409)
    update.role = input.role
  }
  if ('active' in input) {
    if (typeof input.active !== 'boolean')
      throw new AdminAuthError('Invalid account input', 400)
    if (account.role === 'owner' && !input.active)
      throw new AdminAuthError('Owner account cannot be disabled', 409)
    update.active = input.active
  }
  if ('password' in input) {
    if (typeof input.password !== 'string')
      throw new AdminAuthError('Invalid account input', 400)
    update.passwordHash = await hashPassword(input.password)
  }
  if (Object.keys(update).length === 0)
    throw new AdminAuthError('No account changes supplied', 400)
  await stored(() =>
    accountStore().updateAccountRecord(accountId, update, true),
  )
  audit('account.updated', identity, {
    accountId,
    fields: Object.keys(input).filter((key) => key !== 'password'),
  })
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const expected = adminConfig().publicOrigin
  if (!origin || !expected || origin !== expected)
    throw new AdminAuthError('Cross-origin mutation rejected', 403)
}
export function enforceRateLimit(
  request: Request,
  identity: AdminIdentity,
): void {
  throttle(`${identity.subject}:${new URL(request.url).pathname}`, 60)
}
export function audit(
  event: string,
  identity: AdminIdentity,
  details: Record<string, unknown> = {},
): void {
  if (adminConfig().nodeEnv === 'test') {
    console.info(event, JSON.stringify(details))
    return
  }
  try {
    void accountStore()
      .insertAuditEvent(identity.email, event, details)
      .catch((error: unknown) =>
        console.error('Admin audit write failed', error),
      )
  } catch (error) {
    // File-backed harness routes intentionally exercise their domain contract
    // without a PostgreSQL audit target.
    console.error('Admin audit unavailable', error)
  }
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
