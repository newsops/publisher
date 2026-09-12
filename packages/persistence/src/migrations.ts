import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPostgresPool,
  runPostgresTransaction,
  type PostgresPool,
} from './postgres'

export type MigrationScope = 'admin' | 'comments'

const scopeSchema: Record<MigrationScope, string> = {
  admin: 'publisher_admin',
  comments: 'publisher_comments',
}

export async function applyMigrations(
  connectionString: string,
  scope: MigrationScope,
  pool: PostgresPool = createPostgresPool(connectionString, { max: 2 }),
): Promise<readonly string[]> {
  const ownPool = arguments.length < 3
  const schema = scopeSchema[scope]
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../migrations/${scope}`,
  )
  const applied: string[] = []
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.publisher_migrations (
        version TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    const files = (await readdir(root))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort()
    for (const file of files) {
      const sql = await readFile(path.join(root, file), 'utf8')
      const sha256 = createHash('sha256').update(sql).digest('hex')
      const existing = await pool.query<{ sha256: string }>(
        `SELECT sha256 FROM ${schema}.publisher_migrations WHERE version = $1`,
        [file],
      )
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== sha256)
          throw new Error(`Applied migration changed: ${scope}/${file}`)
        continue
      }
      await runPostgresTransaction(pool, async (client) => {
        await client.query(sql)
        await client.query(
          `INSERT INTO ${schema}.publisher_migrations (version, sha256) VALUES ($1, $2)`,
          [file, sha256],
        )
      })
      applied.push(file)
    }
    return applied
  } finally {
    if (ownPool) await pool.end()
  }
}
