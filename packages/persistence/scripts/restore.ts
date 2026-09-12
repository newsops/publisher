import { readFile } from 'node:fs/promises'
import {
  restoreLogicalBackup,
  type LogicalBackup,
  type PersistenceScope,
} from '../src/recovery'
import { createPostgresPool } from '../src/postgres'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const scope = argument('--scope') as PersistenceScope | undefined
const input = argument('--input')
if ((scope !== 'admin' && scope !== 'comments') || !input)
  throw new Error('Usage: restore --scope admin|comments --input <file>')
const variable = scope === 'admin' ? 'DATABASE_URL' : 'COMMENTS_DATABASE_URL'
const connectionString = process.env[variable]
if (!connectionString) throw new Error(`${variable} is required`)
const backup = JSON.parse(await readFile(input, 'utf8')) as LogicalBackup
if (backup.scope !== scope)
  throw new Error('Backup scope does not match --scope')

const pool = createPostgresPool(connectionString, { max: 1 })
try {
  await restoreLogicalBackup(pool, backup)
  console.log(`[persistence:restore] restored ${scope} ${backup.sha256}`)
} finally {
  await pool.end()
}
