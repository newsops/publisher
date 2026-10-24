import type { PostgresPool, PostgresQueryable } from './postgres'
import { runPostgresTransaction } from './postgres'
import {
  inspectRecoverySchema,
  recoveryTables,
  type PersistenceScope,
  type RecoveryTable,
} from './recovery-schema'
import {
  checksum,
  dataChecksum,
  parseLogicalBackup,
  recoveryRow,
  recoverySecurityPolicy,
  type LogicalBackup,
  type RecoveryRow,
} from './recovery-format'

export type { LogicalBackup, PersistenceScope }

async function captureTables(
  database: PostgresQueryable,
  scope: PersistenceScope,
): Promise<Pick<LogicalBackup, 'tables' | 'rowCounts'>> {
  const tables: Record<string, readonly RecoveryRow[]> = {}
  const rowCounts: Record<string, number> = {}
  for (const table of recoveryTables[scope]) {
    const columns = table.columns
      .map(
        (column) =>
          `"${column.name}"${column.type === 'int8' || column.type === 'jsonb' ? '::text' : ''} AS "${column.name}"`,
      )
      .join(', ')
    const result =
      table.policy === 'invalidate-sessions'
        ? []
        : (
            await database.query(
              `SELECT row_to_json(captured) AS row FROM (SELECT ${columns} FROM ${table.name} ORDER BY ${table.orderBy}) captured`,
            )
          ).rows.map((value) => recoveryRow(value.row))
    tables[table.name] = result
    rowCounts[table.name] = result.length
  }
  return { tables, rowCounts }
}

export async function createLogicalBackup(
  pool: PostgresPool,
  scope: PersistenceScope,
): Promise<LogicalBackup> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL TIME ZONE 'UTC'")
    const schema = await inspectRecoverySchema(client, scope)
    const data = await captureTables(client, scope)
    const payload = {
      schemaVersion: 2,
      scope,
      createdAt: new Date().toISOString(),
      securityPolicy: recoverySecurityPolicy,
      schema,
      ...data,
      dataSha256: dataChecksum(data.tables, data.rowCounts),
    } satisfies Omit<LogicalBackup, 'sha256'>
    await client.query('COMMIT')
    return { ...payload, sha256: checksum(payload) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export function verifyLogicalBackup(
  value: unknown,
): asserts value is LogicalBackup {
  parseLogicalBackup(value)
}

async function requireEmpty(
  database: PostgresQueryable,
  scope: PersistenceScope,
): Promise<void> {
  for (const table of recoveryTables[scope]) {
    const result = await database.query(
      `SELECT EXISTS(SELECT 1 FROM ${table.name}) AS occupied`,
    )
    if (result.rows[0]?.occupied !== false)
      throw new Error(`Restore target is not empty: ${table.name}`)
  }
}

async function insertRows(
  database: PostgresQueryable,
  table: RecoveryTable,
  rows: readonly RecoveryRow[],
): Promise<void> {
  const columns = table.columns.map((column) => `"${column.name}"`).join(', ')
  const placeholders = table.columns
    .map((_, index) => `$${index + 1}`)
    .join(', ')
  const identity = table.columns.some((column) => column.identity)
    ? ' OVERRIDING SYSTEM VALUE'
    : ''
  for (const row of rows)
    await database.query(
      `INSERT INTO ${table.name} (${columns})${identity} VALUES (${placeholders})`,
      table.columns.map((column) => row[column.name]),
    )
}

async function resetIdentity(
  database: PostgresQueryable,
  table: RecoveryTable,
): Promise<void> {
  for (const column of table.columns.filter((value) => value.identity)) {
    const maximum = await database.query<{ value: string }>(
      `SELECT GREATEST(COALESCE(MAX("${column.name}"), 0), 0)::text AS value FROM ${table.name}`,
    )
    const next = BigInt(maximum.rows[0].value) + 1n
    await database.query(
      `ALTER TABLE ${table.name} ALTER COLUMN "${column.name}" RESTART WITH ${next}`,
    )
  }
}

async function verifyInvalidatedSessions(
  database: PostgresQueryable,
  scope: PersistenceScope,
): Promise<void> {
  for (const table of recoveryTables[scope].filter(
    (value) => value.policy === 'invalidate-sessions',
  )) {
    const result = await database.query(
      `SELECT EXISTS(SELECT 1 FROM ${table.name}) AS occupied`,
    )
    if (result.rows[0]?.occupied !== false)
      throw new Error('Restored sessions must remain invalidated')
  }
}

export async function restoreLogicalBackup(
  pool: PostgresPool,
  value: unknown,
): Promise<void> {
  const backup = parseLogicalBackup(value)
  await runPostgresTransaction(pool, async (client) => {
    await client.query("SET LOCAL TIME ZONE 'UTC'")
    await client.query(
      `LOCK TABLE ${recoveryTables[backup.scope].map((table) => table.name).join(', ')} IN ACCESS EXCLUSIVE MODE`,
    )
    await inspectRecoverySchema(client, backup.scope)
    await requireEmpty(client, backup.scope)
    for (const table of recoveryTables[backup.scope])
      await insertRows(client, table, backup.tables[table.name])
    await verifyInvalidatedSessions(client, backup.scope)
    const restored = await captureTables(client, backup.scope)
    if (dataChecksum(restored.tables, restored.rowCounts) !== backup.dataSha256)
      throw new Error('Restored data checksum mismatch')
    for (const table of recoveryTables[backup.scope])
      await resetIdentity(client, table)
  })
}
