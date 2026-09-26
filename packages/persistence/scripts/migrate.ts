import { applyMigrations, type MigrationScope } from '../src/migrations'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const scope = argument('--scope') as MigrationScope | undefined
if (scope !== 'admin' && scope !== 'comments')
  throw new Error('Usage: migrate --scope admin|comments')
const variable = scope === 'admin' ? 'DATABASE_URL' : 'COMMENTS_DATABASE_URL'
const connectionString = process.env[variable]
if (!connectionString) throw new Error(`${variable} is required`)

const applied = await applyMigrations(connectionString, scope)
console.log(
  applied.length
    ? `[persistence:migrate] applied ${scope}: ${applied.join(', ')}`
    : `[persistence:migrate] ${scope} is current`,
)
