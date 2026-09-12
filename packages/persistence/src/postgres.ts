import pg, {
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from 'pg'

const { Pool } = pg

export type PostgresPool = InstanceType<typeof Pool>

export interface PostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>
}

const pools = new Map<string, PostgresPool>()

export function createPostgresPool(
  connectionString: string,
  overrides: PoolConfig = {},
): PostgresPool {
  if (!connectionString.trim())
    throw new Error('A PostgreSQL connection string is required')
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...overrides,
  })
}

export function postgresPool(connectionString: string): PostgresPool {
  const key = connectionString.trim()
  const existing = pools.get(key)
  if (existing) return existing
  const pool = createPostgresPool(key)
  pools.set(key, pool)
  return pool
}

export async function runPostgresTransaction<T>(
  pool: PostgresPool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closePostgresPools(): Promise<void> {
  const active = [...pools.values()]
  pools.clear()
  await Promise.all(active.map((pool) => pool.end()))
}
