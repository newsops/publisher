import { writeFile } from 'node:fs/promises'
import { createLogicalBackup, type PersistenceScope } from '../src/recovery'
import { createPostgresPool } from '../src/postgres'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const scope = argument('--scope') as PersistenceScope | undefined
const output = argument('--output')
if ((scope !== 'admin' && scope !== 'comments') || !output)
  throw new Error('Usage: backup --scope admin|comments --output <file>')
const variable = scope === 'admin' ? 'DATABASE_URL' : 'COMMENTS_DATABASE_URL'
const connectionString = process.env[variable]
if (!connectionString) throw new Error(`${variable} is required`)

const pool = createPostgresPool(connectionString, { max: 1 })
try {
  const backup = await createLogicalBackup(pool, scope)
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  console.log(`[persistence:backup] ${scope} ${backup.sha256} -> ${output}`)
} finally {
  await pool.end()
}
