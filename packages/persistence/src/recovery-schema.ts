import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PostgresQueryable } from './postgres'

export type PersistenceScope = 'admin' | 'comments'
export interface RecoveryColumn {
  readonly name: string
  readonly type: string
  readonly nullable: boolean
  readonly identity: boolean
  readonly encoding: 'native' | 'postgres-json-text'
}
export interface RecoveryTable {
  readonly name: string
  readonly orderBy: string
  readonly policy: 'preserve' | 'invalidate-sessions'
  readonly sensitivity: 'private' | 'reusable-authentication'
  readonly columns: readonly RecoveryColumn[]
}
export interface RecoverySchema {
  readonly tables: readonly RecoveryTable[]
  readonly migrations: readonly {
    readonly version: string
    readonly sha256: string
  }[]
}

function table(name: string, orderBy: string, columns: string): RecoveryTable {
  return {
    name,
    orderBy,
    policy: name.endsWith('.account_sessions')
      ? 'invalidate-sessions'
      : 'preserve',
    sensitivity: name.endsWith('.accounts')
      ? 'reusable-authentication'
      : 'private',
    columns: columns.split(' ').map((definition) => {
      const [column, type, identity] = definition.split(':')
      return {
        name: column.replace('?', ''),
        type,
        nullable: column.endsWith('?'),
        identity: identity === 'identity',
        encoding: type === 'jsonb' ? 'postgres-json-text' : 'native',
      }
    }),
  }
}

const admin = (name: string, order: string, columns: string) =>
  table(`publisher_admin.${name}`, order, columns)
const comments = (name: string, order: string, columns: string) =>
  table(`publisher_comments.${name}`, order, columns)
export const recoveryTables: Record<
  PersistenceScope,
  readonly RecoveryTable[]
> = {
  admin: [
    admin(
      'sites',
      'site_id',
      'site_id:text name:text canonical_origin:text theme_id:text active:bool created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'accounts',
      'id',
      'id:uuid email:text password_hash:text role:text active:bool password_changed_at:timestamptz created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'site_administrators',
      'site_id, account_id',
      'site_id:text account_id:uuid created_at:timestamptz',
    ),
    admin(
      'site_states',
      'site_id',
      'site_id:text state:jsonb revision:int8 updated_at:timestamptz',
    ),
    admin(
      'articles',
      'site_id, id',
      'site_id:text id:text payload:jsonb revision:int4 updated_at:timestamptz',
    ),
    admin(
      'adapter_installations',
      'site_id, adapter_id',
      'site_id:text adapter_id:text payload:jsonb revision:int4 updated_at:timestamptz',
    ),
    admin(
      'media',
      'site_id, object_key',
      'id:uuid site_id:text object_key:text sha256:text mime_type:text byte_size:int8 width:int4 height:int4 state:text variants:jsonb created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'release_records',
      'release_id',
      'release_id:text site_id:text snapshot_id:text snapshot_key?:text checksum:text status:text payload:jsonb created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'build_jobs',
      'job_id',
      'job_id:uuid site_id:text snapshot_id:text snapshot_checksum:text snapshot_key?:text idempotency_key:text status:text attempts:int4 failure_reason?:text created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'audit_events',
      'id',
      'id:int8:identity site_id:text actor:text event:text details:jsonb created_at:timestamptz',
    ),
    admin(
      'archive_restore_operations',
      'operation_id',
      'operation_id:uuid site_id:text idempotency_key:text archive_digest:text result:jsonb created_at:timestamptz',
    ),
    admin(
      'site_agent_guidance',
      'site_id',
      'site_id:text instructions:text revision:int4 created_at:timestamptz updated_at:timestamptz',
    ),
    admin(
      'account_sessions',
      'id',
      'id:uuid account_id:uuid token_hash:text expires_at:timestamptz revoked_at?:timestamptz created_at:timestamptz last_seen_at:timestamptz',
    ),
  ],
  comments: [
    comments(
      'comments',
      'id',
      'id:uuid slug:text author_name:text body:text status:text created_at:timestamptz updated_at:timestamptz site_id:text',
    ),
    comments(
      'rate_limits',
      'bucket_key',
      'bucket_key:text count:int4 reset_at:int8',
    ),
  ],
}

export function supportedSchema(scope: PersistenceScope): RecoverySchema {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../migrations/${scope}`,
  )
  const migrations = readdirSync(root)
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()
    .map((version) => ({
      version,
      sha256: createHash('sha256')
        .update(readFileSync(path.join(root, version)))
        .digest('hex'),
    }))
  return { tables: structuredClone(recoveryTables[scope]), migrations }
}

export async function inspectRecoverySchema(
  database: PostgresQueryable,
  scope: PersistenceScope,
): Promise<RecoverySchema> {
  const expected = supportedSchema(scope)
  const schema = `publisher_${scope}`
  const inventory = await database.query<{
    table_name: string
    table_type: string
    column_name: string
    udt_name: string
    is_nullable: string
    is_identity: string
  }>(
    `SELECT t.table_name, t.table_type, c.column_name, c.udt_name, c.is_nullable, c.is_identity
     FROM information_schema.tables t LEFT JOIN information_schema.columns c
       ON c.table_schema=t.table_schema AND c.table_name=t.table_name
     WHERE t.table_schema=$1 ORDER BY t.table_name, c.ordinal_position`,
    [schema],
  )
  if (
    JSON.stringify(inventory.rows) !== JSON.stringify(expectedInventory(scope))
  )
    throw new Error('Unsupported recovery schema inventory')
  const applied = await database.query<{ version: string; sha256: string }>(
    `SELECT version, sha256 FROM ${schema}.publisher_migrations ORDER BY version`,
  )
  if (JSON.stringify(applied.rows) !== JSON.stringify(expected.migrations))
    throw new Error('Unsupported recovery migration provenance')
  return expected
}

function expectedInventory(scope: PersistenceScope) {
  const schema = `publisher_${scope}`
  const ledger = table(
    `${schema}.publisher_migrations`,
    'version',
    'version:text sha256:text applied_at:timestamptz',
  )
  const definitions = [...recoveryTables[scope], ledger].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return definitions.flatMap((definition) =>
    definition.columns.map((column) => ({
      table_name: definition.name.split('.')[1],
      table_type: 'BASE TABLE',
      column_name: column.name,
      udt_name: column.type,
      is_nullable: column.nullable ? 'YES' : 'NO',
      is_identity: column.identity ? 'YES' : 'NO',
    })),
  )
}
