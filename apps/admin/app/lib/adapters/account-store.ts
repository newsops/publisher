import { postgresPool, runPostgresTransaction } from '@publisher/persistence'

/**
 * Account, session, and audit storage (ARCH-003). Every SQL statement the
 * HTTP identity layer needs lives here; `http/auth.ts` keeps the policy
 * (hashing, roles, throttling, cookies) and calls these functions.
 */

export type StoredRole = 'owner' | 'editor' | 'publisher'

export interface StoredAccount {
  readonly id: string
  readonly email: string
  readonly role: StoredRole
}

export interface StoredCredential extends StoredAccount {
  readonly passwordHash: string
}

export interface StoredAccountRecord extends StoredAccount {
  readonly active: boolean
  readonly createdAt: Date
  readonly passwordChangedAt: Date
}

export class AccountStoreUnavailable extends Error {
  constructor() {
    super('Admin authentication unavailable')
    this.name = 'AccountStoreUnavailable'
  }
}

/** A conflict the caller maps to its own error (unique violation, empty set). */
export class AccountStoreConflict extends Error {
  constructor(readonly reason: 'exists' | 'not-empty') {
    super(reason)
    this.name = 'AccountStoreConflict'
  }
}

function db() {
  const url = process.env.DATABASE_URL
  if (!url) throw new AccountStoreUnavailable()
  return postgresPool(url)
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505'
}

export async function insertSession(
  id: string,
  accountId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db().query(
    'INSERT INTO publisher_admin.account_sessions (id, account_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
    [id, accountId, tokenHash, expiresAt],
  )
}

export async function findSessionAccount(
  tokenHash: string,
): Promise<StoredAccount | undefined> {
  const result = await db().query<StoredAccount>(
    'SELECT a.id,a.email,a.role FROM publisher_admin.account_sessions s JOIN publisher_admin.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP AND a.active=TRUE',
    [tokenHash],
  )
  return result.rows[0]
}

export function touchSession(tokenHash: string): void {
  void db().query(
    'UPDATE publisher_admin.account_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1',
    [tokenHash],
  )
}

export async function revokeSessionByToken(tokenHash: string): Promise<void> {
  await db().query(
    'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revoked_at IS NULL',
    [tokenHash],
  )
}

export async function revokeAccountSessions(accountId: string): Promise<void> {
  await db().query(
    'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND revoked_at IS NULL',
    [accountId],
  )
}

export async function findCredentialByEmail(
  email: string,
): Promise<StoredCredential | undefined> {
  const result = await db().query<{
    id: string
    email: string
    password_hash: string
    role: StoredRole
  }>(
    'SELECT id,email,password_hash,role FROM publisher_admin.accounts WHERE LOWER(email)=LOWER($1) AND active=TRUE',
    [email],
  )
  const row = result.rows[0]
  return row
    ? {
        id: row.id,
        email: row.email,
        role: row.role,
        passwordHash: row.password_hash,
      }
    : undefined
}

export async function countAccounts(): Promise<number> {
  const count = await db().query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM publisher_admin.accounts',
  )
  return Number(count.rows[0]?.count ?? '0')
}

/** Creates the first owner atomically; conflicts when any account exists. */
export async function insertFirstOwner(
  id: string,
  email: string,
  passwordHash: string,
): Promise<void> {
  try {
    await runPostgresTransaction(db(), async (client) => {
      const count = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM publisher_admin.accounts',
      )
      if (count.rows[0]?.count !== '0')
        throw new AccountStoreConflict('not-empty')
      await client.query(
        'INSERT INTO publisher_admin.accounts (id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [id, email, passwordHash, 'owner'],
      )
      await client.query(
        'INSERT INTO publisher_admin.audit_events (site_id,actor,event,details) VALUES ($1,$2,$3,$4)',
        ['default', email, 'account.owner.bootstrap', '{}'],
      )
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountStoreConflict('exists')
    throw error
  }
}

export async function listAccountRecords(): Promise<
  readonly StoredAccountRecord[]
> {
  const result = await db().query<{
    id: string
    email: string
    role: StoredRole
    active: boolean
    created_at: Date
    password_changed_at: Date
  }>(
    'SELECT id,email,role,active,created_at,password_changed_at FROM publisher_admin.accounts ORDER BY created_at ASC',
  )
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    passwordChangedAt: row.password_changed_at,
  }))
}

export async function insertAccount(
  id: string,
  email: string,
  passwordHash: string,
  role: StoredRole,
): Promise<void> {
  try {
    await db().query(
      'INSERT INTO publisher_admin.accounts (id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
      [id, email, passwordHash, role],
    )
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountStoreConflict('exists')
    throw error
  }
}

export async function findAccountById(
  accountId: string,
): Promise<{ id: string; role: StoredRole; active: boolean } | undefined> {
  const existing = await db().query<{
    id: string
    role: StoredRole
    active: boolean
  }>('SELECT id,role,active FROM publisher_admin.accounts WHERE id=$1', [
    accountId,
  ])
  return existing.rows[0]
}

export interface AccountUpdate {
  readonly role?: StoredRole
  readonly active?: boolean
  readonly passwordHash?: string
}

/** Applies the given columns and revokes sessions in one transaction. */
export async function updateAccountRecord(
  accountId: string,
  update: AccountUpdate,
  revokeSessions: boolean,
): Promise<void> {
  const updates: string[] = []
  const values: unknown[] = []
  if (update.role !== undefined) {
    updates.push(`role=$${values.length + 1}`)
    values.push(update.role)
  }
  if (update.active !== undefined) {
    updates.push(`active=$${values.length + 1}`)
    values.push(update.active)
  }
  if (update.passwordHash !== undefined) {
    updates.push(
      `password_hash=$${values.length + 1}`,
      'password_changed_at=CURRENT_TIMESTAMP',
    )
    values.push(update.passwordHash)
  }
  values.push(accountId)
  await runPostgresTransaction(db(), async (client) => {
    await client.query(
      `UPDATE publisher_admin.accounts SET ${updates.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length}`,
      values,
    )
    if (revokeSessions)
      await client.query(
        'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND revoked_at IS NULL',
        [accountId],
      )
  })
}

/** Best-effort audit write; the caller decides what a failure means. */
export function insertAuditEvent(
  actor: string,
  event: string,
  details: Record<string, unknown>,
): Promise<unknown> {
  return db().query(
    'INSERT INTO publisher_admin.audit_events (site_id,actor,event,details) VALUES ($1,$2,$3,$4)',
    ['default', actor, event, JSON.stringify(details)],
  )
}
