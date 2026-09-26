import { createHash } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { PostgresPool, PostgresQueryable } from './postgres'
import { runPostgresTransaction } from './postgres'

export type PersistenceScope = 'admin' | 'comments'

interface TableDefinition {
  readonly name: string
  readonly orderBy: string
  readonly identityColumn?: string
  readonly jsonColumns?: readonly string[]
}

const tables: Record<PersistenceScope, readonly TableDefinition[]> = {
  admin: [
    {
      name: 'publisher_admin.site_states',
      orderBy: 'site_id',
      jsonColumns: ['state'],
    },
    {
      name: 'publisher_admin.articles',
      orderBy: 'site_id, id',
      jsonColumns: ['payload'],
    },
    {
      name: 'publisher_admin.plugin_installations',
      orderBy: 'site_id, plugin_id',
      jsonColumns: ['payload'],
    },
    {
      name: 'publisher_admin.media',
      orderBy: 'site_id, object_key',
      jsonColumns: ['variants'],
    },
    {
      name: 'publisher_admin.release_records',
      orderBy: 'release_id',
      jsonColumns: ['payload'],
    },
    { name: 'publisher_admin.build_jobs', orderBy: 'job_id' },
    {
      name: 'publisher_admin.audit_events',
      orderBy: 'id',
      identityColumn: 'id',
      jsonColumns: ['details'],
    },
  ],
  comments: [
    { name: 'publisher_comments.comments', orderBy: 'id' },
    { name: 'publisher_comments.rate_limits', orderBy: 'bucket_key' },
  ],
}

export interface LogicalBackup {
  readonly schemaVersion: 1
  readonly scope: PersistenceScope
  readonly createdAt: string
  readonly tables: Readonly<Record<string, readonly QueryResultRow[]>>
  readonly rowCounts: Readonly<Record<string, number>>
  readonly dataSha256: string
  readonly sha256: string
}

function backupChecksum(backup: Omit<LogicalBackup, 'sha256'>): string {
  return createHash('sha256').update(JSON.stringify(backup)).digest('hex')
}

function dataChecksum(
  tablesValue: Readonly<Record<string, readonly QueryResultRow[]>>,
  rowCounts: Readonly<Record<string, number>>,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ tables: tablesValue, rowCounts }))
    .digest('hex')
}

export async function createLogicalBackup(
  database: PostgresQueryable,
  scope: PersistenceScope,
): Promise<LogicalBackup> {
  const payload: Omit<LogicalBackup, 'sha256'> = {
    schemaVersion: 1,
    scope,
    createdAt: new Date().toISOString(),
    tables: {},
    rowCounts: {},
    dataSha256: '',
  }
  const content: Record<string, readonly QueryResultRow[]> = {}
  const rowCounts: Record<string, number> = {}
  for (const table of tables[scope]) {
    const result = await database.query(
      `SELECT * FROM ${table.name} ORDER BY ${table.orderBy}`,
    )
    content[table.name] = result.rows
    rowCounts[table.name] = result.rowCount ?? result.rows.length
  }
  const complete = {
    ...payload,
    tables: content,
    rowCounts,
    dataSha256: dataChecksum(content, rowCounts),
  }
  return { ...complete, sha256: backupChecksum(complete) }
}

export function verifyLogicalBackup(backup: LogicalBackup): void {
  const { sha256, ...payload } = backup
  if (backup.schemaVersion !== 1 || !tables[backup.scope])
    throw new Error('Unsupported logical backup')
  if (backupChecksum(payload) !== sha256)
    throw new Error('Logical backup checksum mismatch')
  for (const table of tables[backup.scope]) {
    const rows = backup.tables[table.name]
    if (!Array.isArray(rows) || backup.rowCounts[table.name] !== rows.length)
      throw new Error(`Logical backup row count mismatch: ${table.name}`)
  }
  if (dataChecksum(backup.tables, backup.rowCounts) !== backup.dataSha256)
    throw new Error('Logical backup data checksum mismatch')
}

function quotedColumn(column: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(column))
    throw new Error(`Unsafe backup column: ${column}`)
  return `"${column}"`
}

function restoredValue(
  table: TableDefinition,
  column: string,
  value: unknown,
): unknown {
  return table.jsonColumns?.includes(column) ? JSON.stringify(value) : value
}

export async function restoreLogicalBackup(
  pool: PostgresPool,
  backup: LogicalBackup,
): Promise<void> {
  verifyLogicalBackup(backup)
  await runPostgresTransaction(pool, async (client) => {
    for (const table of tables[backup.scope]) {
      const count = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${table.name}`,
      )
      if (Number(count.rows[0]?.count ?? 0) !== 0)
        throw new Error(`Restore target is not empty: ${table.name}`)
    }
    for (const table of tables[backup.scope]) {
      for (const row of backup.tables[table.name]) {
        const columns = Object.keys(row)
        const placeholders = columns.map((_, index) => `$${index + 1}`)
        await client.query(
          `INSERT INTO ${table.name} (${columns.map(quotedColumn).join(', ')})${table.identityColumn ? ' OVERRIDING SYSTEM VALUE' : ''} VALUES (${placeholders.join(', ')})`,
          columns.map((column) => restoredValue(table, column, row[column])),
        )
      }
      if (table.identityColumn)
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE(MAX(${quotedColumn(table.identityColumn)}), 0) + 1, false) FROM ${table.name}`,
          [table.name, table.identityColumn],
        )
    }
  })
  const restored = await createLogicalBackup(pool, backup.scope)
  for (const table of tables[backup.scope])
    if (restored.rowCounts[table.name] !== backup.rowCounts[table.name])
      throw new Error(`Restored row count mismatch: ${table.name}`)
  if (restored.dataSha256 !== backup.dataSha256)
    throw new Error('Restored data checksum mismatch')
}
