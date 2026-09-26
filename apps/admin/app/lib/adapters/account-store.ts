import {
  runPostgresTransaction,
  type PostgresPool,
} from '@publisher/persistence'

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

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505'
}

export interface AccountUpdate {
  readonly role?: StoredRole
  readonly active?: boolean
  readonly passwordHash?: string
}

export class AccountStore {
  constructor(private readonly pool: PostgresPool) {}

  async insertSession(
    id: string,
    accountId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      'INSERT INTO publisher_admin.account_sessions (id, account_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
      [id, accountId, tokenHash, expiresAt],
    )
  }

  async findSessionAccount(
    tokenHash: string,
  ): Promise<StoredAccount | undefined> {
    const result = await this.pool.query<StoredAccount>(
      'SELECT a.id,a.email,a.role FROM publisher_admin.account_sessions s JOIN publisher_admin.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP AND a.active=TRUE',
      [tokenHash],
    )
    return result.rows[0]
  }

  touchSession(tokenHash: string): void {
    void this.pool.query(
      'UPDATE publisher_admin.account_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1',
      [tokenHash],
    )
  }

  async revokeSessionByToken(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revoked_at IS NULL',
      [tokenHash],
    )
  }

  async revokeAccountSessions(accountId: string): Promise<void> {
    await this.pool.query(
      'UPDATE publisher_admin.account_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND revoked_at IS NULL',
      [accountId],
    )
  }

  async findCredentialByEmail(
    email: string,
  ): Promise<StoredCredential | undefined> {
    const result = await this.pool.query<{
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

  async countAccounts(): Promise<number> {
    const count = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM publisher_admin.accounts',
    )
    return Number(count.rows[0]?.count ?? '0')
  }

  /** Creates the first owner atomically; conflicts when any account exists. */
  async insertFirstOwner(
    id: string,
    email: string,
    passwordHash: string,
  ): Promise<void> {
    try {
      await runPostgresTransaction(this.pool, async (client) => {
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

  async listAccountRecords(): Promise<readonly StoredAccountRecord[]> {
    const result = await this.pool.query<{
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

  async insertAccount(
    id: string,
    email: string,
    passwordHash: string,
    role: StoredRole,
  ): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO publisher_admin.accounts (id,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [id, email, passwordHash, role],
      )
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountStoreConflict('exists')
      throw error
    }
  }

  async findAccountById(
    accountId: string,
  ): Promise<{ id: string; role: StoredRole; active: boolean } | undefined> {
    const existing = await this.pool.query<{
      id: string
      role: StoredRole
      active: boolean
    }>('SELECT id,role,active FROM publisher_admin.accounts WHERE id=$1', [
      accountId,
    ])
    return existing.rows[0]
  }

  /** Applies the given columns and revokes sessions in one transaction. */
  async updateAccountRecord(
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
    await runPostgresTransaction(this.pool, async (client) => {
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
  insertAuditEvent(
    actor: string,
    event: string,
    details: Record<string, unknown>,
  ): Promise<unknown> {
    return this.pool.query(
      'INSERT INTO publisher_admin.audit_events (site_id,actor,event,details) VALUES ($1,$2,$3,$4)',
      ['default', actor, event, JSON.stringify(details)],
    )
  }
}
