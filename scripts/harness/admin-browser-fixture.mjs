// An isolated current-admin browser fixture, never an operated publication.
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { register } from 'tsx/esm/api'
import 'tsx'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

register()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { createPostgresPool, applyMigrations } =
  await import('../../packages/persistence/src/index.ts')
const { PostgresSiteRegistry } =
  await import('../../apps/admin/app/lib/adapters/site-registry.ts')
const { PostgresAgentGuidanceRepository } =
  await import('../../apps/admin/app/lib/adapters/agent-guidance.ts')
const { AccountStore } =
  await import('../../apps/admin/app/lib/adapters/account-store.ts')
const { hashPassword } = await import('../../apps/admin/app/lib/http/auth.ts')

async function freePort() {
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  const port = address.port
  await new Promise((resolve) => probe.close(resolve))
  return port
}

const database = await PGlite.create()
const databasePort = await freePort()
const socket = new PGLiteSocketServer({
  db: database,
  host: '127.0.0.1',
  port: databasePort,
  maxConnections: 12,
})
await socket.start()
const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres?sslmode=disable`
const pool = createPostgresPool(databaseUrl, { max: 4 })
await applyMigrations(databaseUrl, 'admin', pool)
const registry = new PostgresSiteRegistry(pool)
for (const siteId of ['default', 'example']) {
  const identity = {
    name: `${siteId} News`,
    canonicalOrigin: `https://${siteId}.example.test`,
    themeId: 'editorial',
  }
  if ((await registry.list()).some((site) => site.siteId === siteId))
    await registry.update(siteId, identity)
  else await registry.create({ siteId, ...identity })
  await registry.bootstrap(siteId)
}
await new AccountStore(pool).insertFirstOwner(
  randomUUID(),
  'owner@example.com',
  await hashPassword('fixture-browser-password'),
)
const guidance = new PostgresAgentGuidanceRepository(pool)
const initialGuidance = await guidance.get('default')
await guidance.update(
  'default',
  'Use an attributed representative image for every article.',
  initialGuidance.revision,
)

const port = await freePort()
const origin = `http://localhost:${port}`
const child = spawn(
  process.execPath,
  [
    path.join(root, 'apps/admin/node_modules/next/dist/bin/next'),
    'dev',
    '--webpack',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: path.join(root, 'apps/admin'),
    stdio: 'inherit',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: databaseUrl,
      ADMIN_DATA_DIR: '',
      ADMIN_DEV_TOKEN: '',
      ADMIN_OWNERS: '',
      ADMIN_PUBLISHERS: '',
      ADMIN_PUBLIC_ORIGIN: origin,
      ADMIN_BOOTSTRAP_SECRET: '',
      ADMIN_AUTOMATION_KEYS: JSON.stringify([
        {
          id: 'isolated-browser-fixture',
          role: 'publisher',
          sha256: createHash('sha256')
            .update('fixture-automation-token')
            .digest('hex'),
          sites: ['default', 'example'],
        },
      ]),
      ADMIN_AUTOMATION_KEYS_EXTRA: '',
      COMMENTS_DATABASE_URL: '',
      COMMENTS_ORIGIN: '',
      COMMENTS_MODERATION_TOKEN: '',
      OBJECT_STORAGE_ENDPOINT: '',
      OBJECT_STORAGE_REGION: '',
      OBJECT_STORAGE_BUCKET: '',
      OBJECT_STORAGE_ACCESS_KEY_ID: '',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: '',
    },
  },
)
console.log(
  `[admin-browser-fixture] ${origin}; synthetic owner@example.com / fixture-browser-password`,
)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  child.kill('SIGTERM')
  await pool.end()
  await socket.stop()
  await database.close()
}
process.once('SIGINT', () => {
  void stop()
})
process.once('SIGTERM', () => {
  void stop()
})
child.once('exit', () => {
  void stop()
})
