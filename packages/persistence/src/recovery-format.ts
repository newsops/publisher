import { createHash } from 'node:crypto'
import {
  supportedSchema,
  type PersistenceScope,
  type RecoveryColumn,
  type RecoverySchema,
} from './recovery-schema'

export type RecoveryValue =
  null | boolean | number | string | readonly RecoveryValue[] | RecoveryRow
export interface RecoveryRow {
  readonly [key: string]: RecoveryValue
}
export const recoverySecurityPolicy = Object.freeze({
  confidentiality: 'private-sensitive-plaintext',
  accountVerifiers: 'preserved-reusable-authentication',
  sessions: 'invalidated-on-restore',
  externalAuthority: 'not-included-or-revoked',
} satisfies RecoveryRow)
export interface LogicalBackup {
  readonly schemaVersion: 2
  readonly scope: PersistenceScope
  readonly createdAt: string
  readonly securityPolicy: typeof recoverySecurityPolicy
  readonly schema: RecoverySchema
  readonly tables: Readonly<Record<string, readonly RecoveryRow[]>>
  readonly rowCounts: Readonly<Record<string, number>>
  readonly dataSha256: string
  readonly sha256: string
}
const backupFields = [
  'schemaVersion',
  'scope',
  'createdAt',
  'securityPolicy',
  'schema',
  'tables',
  'rowCounts',
  'dataSha256',
  'sha256',
]

export function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error('Invalid logical backup object')
  return Object.fromEntries(Object.entries(value))
}

function jsonValue(value: unknown): RecoveryValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(jsonValue)
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, child]) => [
      key,
      jsonValue(child),
    ]),
  )
}

export function recoveryRow(value: unknown): RecoveryRow {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, child]) => [
      key,
      jsonValue(child),
    ]),
  )
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function checksum(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function dataChecksum(
  tables: LogicalBackup['tables'],
  rowCounts: LogicalBackup['rowCounts'],
): string {
  return checksum({ tables, rowCounts })
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (canonical(Object.keys(value).sort()) !== canonical([...keys].sort()))
    throw new Error('Invalid logical backup field inventory')
}

function validCell(value: RecoveryValue, column: RecoveryColumn): boolean {
  if (column.type === 'jsonb') {
    if (typeof value !== 'string') return false
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }
  if (value === null) return column.nullable
  if (column.type === 'bool') return typeof value === 'boolean'
  if (column.type === 'int4')
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= -2147483648 &&
      value <= 2147483647
    )
  if (typeof value !== 'string') return false
  if (column.type === 'int8')
    return (
      /^-?(0|[1-9]\d*)$/.test(value) &&
      BigInt(value) >= -9223372036854775808n &&
      BigInt(value) <= 9223372036854775807n
    )
  if (column.type === 'timestamptz') return Number.isFinite(Date.parse(value))
  if (column.type === 'uuid')
    return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
  return column.type === 'text'
}

function parseTables(
  input: Record<string, unknown>,
  counts: Record<string, unknown>,
  schema: RecoverySchema,
): Pick<LogicalBackup, 'tables' | 'rowCounts'> {
  exactKeys(
    input,
    schema.tables.map((table) => table.name),
  )
  exactKeys(
    counts,
    schema.tables.map((table) => table.name),
  )
  const tables: Record<string, readonly RecoveryRow[]> = {}
  const rowCounts: Record<string, number> = {}
  for (const table of schema.tables) {
    const source = input[table.name]
    if (!Array.isArray(source) || counts[table.name] !== source.length)
      throw new Error(`Logical backup row count mismatch: ${table.name}`)
    if (table.policy === 'invalidate-sessions' && source.length !== 0)
      throw new Error('Logical backup contains live sessions')
    tables[table.name] = source.map((value) => {
      const row = recoveryRow(value)
      exactKeys(
        row,
        table.columns.map((column) => column.name),
      )
      if (!table.columns.every((column) => validCell(row[column.name], column)))
        throw new Error(`Invalid logical backup row: ${table.name}`)
      return row
    })
    rowCounts[table.name] = source.length
  }
  return { tables, rowCounts }
}

function parseHeader(
  input: Record<string, unknown>,
): Pick<
  LogicalBackup,
  'scope' | 'schema' | 'createdAt' | 'sha256' | 'dataSha256'
> {
  exactKeys(input, backupFields)
  if (
    input.schemaVersion !== 2 ||
    (input.scope !== 'admin' && input.scope !== 'comments')
  )
    throw new Error('Unsupported logical backup format')
  const scope = input.scope
  const schema = supportedSchema(scope)
  if (canonical(input.schema) !== canonical(schema))
    throw new Error('Unsupported logical backup schema or migration provenance')
  if (canonical(input.securityPolicy) !== canonical(recoverySecurityPolicy))
    throw new Error('Unsupported logical backup security policy')
  if (
    typeof input.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    throw new Error('Invalid logical backup timestamp')
  if (
    typeof input.sha256 !== 'string' ||
    typeof input.dataSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !/^[a-f0-9]{64}$/.test(input.dataSha256)
  )
    throw new Error('Invalid logical backup digest')
  return {
    scope,
    schema,
    createdAt: input.createdAt,
    sha256: input.sha256,
    dataSha256: input.dataSha256,
  }
}

export function parseLogicalBackup(value: unknown): LogicalBackup {
  const input = record(value)
  const header = parseHeader(input)
  const data = parseTables(
    record(input.tables),
    record(input.rowCounts),
    header.schema,
  )
  const payload = {
    schemaVersion: 2,
    scope: header.scope,
    createdAt: header.createdAt,
    securityPolicy: recoverySecurityPolicy,
    schema: header.schema,
    ...data,
    dataSha256: header.dataSha256,
  } satisfies Omit<LogicalBackup, 'sha256'>
  if (checksum(payload) !== header.sha256)
    throw new Error('Logical backup checksum mismatch')
  if (dataChecksum(data.tables, data.rowCounts) !== payload.dataSha256)
    throw new Error('Logical backup data checksum mismatch')
  return { ...payload, sha256: header.sha256 }
}
