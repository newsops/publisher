import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { postgresPool, runPostgresTransaction } from '@publisher/persistence'
import { ContentValidationError } from '@publisher/content'
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

function db() {
  const url = process.env.DATABASE_URL
  if (!url) throw new AdminAuthError('Admin authentication unavailable', 503)
  return postgresPool(url)
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
  await db().query(
    'INSERT INTO publisher_admin.account_sessions (id, account_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
    [randomUUID(), accountId, tokenHash(token), expiresAt],
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
  const allowsFixtureIdentity =
    process.env.NODE_ENV === 'test' ||
    (process.env.NODE_ENV === 'development' &&
      Boolean(process.env.ADMIN_DATA_DIR))
  if (allowsFixtureIdentity) {
    const expected = process.env.ADMIN_DEV_TOKEN
    const supplied = request.headers.get('x-admin-dev-token')
    const email = request.headers.get('x-admin-dev-email')?.trim().toLowerCase()
    const configuredEmails = (name: string) =>
      process.env[name]
        ?.split(',')
        .map((value) => value.trim().toLowerCase()) ?? []
    // ADMIN_OWNERS lets the file-backed local admin drive the browser routes,
    // which require an owner for site access; ADMIN_PUBLISHERS grants publish.
    const owners = configuredEmails('ADMIN_OWNERS')
    const configured = configuredEmails('ADMIN_PUBLISHERS')
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
  const result = await db().query<{
    id: string
    email: string
    role: AdminRole
  }>(
    'SELECT a.id,a.email,a.role FROM publisher_admin.account_sessions s JOIN publisher_admin.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP AND a.active=TRUE',
    [tokenHash(token)],
  )
  const account = result.rows[0]
  if (!account) throw new AdminAuthError('Authentication required')
  const capabilities = roles(account.role)
  if (!capabilities.includes(requiredRole))
    throw new AdminAuthError('Role required', 403)
  void db().query(
    'UPDATE publisher_admin.account_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1',
    [tokenHash(token)],
  )
  return { email: account.email, subject: account.id, roles: capabilities }
}

export async function login(
  request: Request,
  email: string,
  password: string,
): Promise<Response> {
  throttle(rateKey(request), 10)
  throttle(`login:${email.trim().toLowerCase()}`, 10)
  const result = await db().query<{
    id: string
    email: string
    password_hash: string
    role: AdminRole
  }>(
    'SELECT id,email,password_hash,role FROM publisher_admin.accounts WHERE LOWER(email)=LOWER($1) AND active=TRUE',
    [email.trim()],
  )
  const account = result.rows[0]
  if (!account || !(await verifyPassword(password, account.password_hash)))
    throw new AdminAuthError('Invalid email or password')
  await db().query(
    'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND revoked_at IS NULL',
    [account.id],
  )
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
  const configured = process.env.ADMIN_BOOTSTRAP_SECRET
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
    await runPostgresTransaction(db(), async (client) => {
      const count = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM publisher_admin.accounts',
      )
      if (count.rows[0]?.count !== '0')
        throw new AdminAuthError('Bootstrap unavailable', 403)
      await client.query(
        'INSERT INTO publisher_admin.accounts (id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [id, normalized, passwordHash, 'owner'],
      )
      await client.query(
        'INSERT INTO publisher_admin.audit_events (site_id,actor,event,details) VALUES ($1,$2,$3,$4)',
        ['default', normalized, 'account.owner.bootstrap', '{}'],
      )
    })
  } catch (error) {
    if (
      error instanceof AdminAuthError ||
      (error as { code?: string }).code === '23505'
    )
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
    await db().query(
      'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revoked_at IS NULL',
      [tokenHash(token)],
    )
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
  if (!process.env.ADMIN_BOOTSTRAP_SECRET) return false
  const count = await db().query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM publisher_admin.accounts',
  )
  return count.rows[0]?.count === '0'
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
  const result = await db().query<{
    id: string
    email: string
    role: AdminRole
    active: boolean
    created_at: Date
    password_changed_at: Date
  }>(
    'SELECT id,email,role,active,created_at,password_changed_at FROM publisher_admin.accounts ORDER BY created_at ASC',
  )
  return result.rows
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
    await db().query(
      'INSERT INTO publisher_admin.accounts (id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
      [id, email, passwordHash, role],
    )
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
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
  const existing = await db().query<{
    id: string
    role: AdminRole
    active: boolean
  }>('SELECT id,role,active FROM publisher_admin.accounts WHERE id=$1', [
    accountId,
  ])
  const account = existing.rows[0]
  if (!account) throw new AdminAuthError('Account not found', 404)
  const updates: string[] = []
  const values: unknown[] = []
  let revoke = false
  if ('role' in input) {
    if (!validRole(input.role) || input.role === 'owner')
      throw new AdminAuthError('Invalid account input', 400)
    if (account.role === 'owner')
      throw new AdminAuthError('Owner account cannot be reduced', 409)
    updates.push(`role=$${values.length + 1}`)
    values.push(input.role)
    revoke = true
  }
  if ('active' in input) {
    if (typeof input.active !== 'boolean')
      throw new AdminAuthError('Invalid account input', 400)
    if (account.role === 'owner' && !input.active)
      throw new AdminAuthError('Owner account cannot be disabled', 409)
    updates.push(`active=$${values.length + 1}`)
    values.push(input.active)
    revoke = true
  }
  if ('password' in input) {
    if (typeof input.password !== 'string')
      throw new AdminAuthError('Invalid account input', 400)
    updates.push(
      `password_hash=$${values.length + 1}`,
      'password_changed_at=CURRENT_TIMESTAMP',
    )
    values.push(await hashPassword(input.password))
    revoke = true
  }
  if (updates.length === 0)
    throw new AdminAuthError('No account changes supplied', 400)
  values.push(accountId)
  await runPostgresTransaction(db(), async (client) => {
    await client.query(
      `UPDATE publisher_admin.accounts SET ${updates.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length}`,
      values,
    )
    if (revoke)
      await client.query(
        'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND revoked_at IS NULL',
        [accountId],
      )
  })
  audit('account.updated', identity, {
    accountId,
    fields: Object.keys(input).filter((key) => key !== 'password'),
  })
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const expected = process.env.ADMIN_PUBLIC_ORIGIN
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
  if (process.env.NODE_ENV === 'test') {
    console.info(event, JSON.stringify(details))
    return
  }
  try {
    void db()
      .query(
        'INSERT INTO publisher_admin.audit_events (site_id,actor,event,details) VALUES ($1,$2,$3,$4)',
        ['default', identity.email, event, JSON.stringify(details)],
      )
      .catch((error) => console.error('Admin audit write failed', error))
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
