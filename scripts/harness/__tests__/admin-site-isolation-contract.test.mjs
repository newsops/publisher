import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertSiteId } from '../../../apps/admin/app/lib/site-registry.ts'
import { getRepositoryForSite } from '../../../apps/admin/app/lib/repository.ts'
import { requireSiteAutomationIdentity } from '../../../apps/admin/app/lib/automation-auth.ts'
import { readFile } from 'node:fs/promises'

const previous = new Map()

function remember(name) {
  if (!previous.has(name)) previous.set(name, process.env[name])
}

afterEach(() => {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  previous.clear()
})

describe('ADMIN-003 multi-site isolation contract', () => {
  it('uses separate repository state and rejects an out-of-scope automation key', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-sites-'))
    remember('ADMIN_DATA_DIR')
    remember('ADMIN_AUTOMATION_KEYS')
    process.env.ADMIN_DATA_DIR = directory
    const token = 'site-a-token'
    process.env.ADMIN_AUTOMATION_KEYS = JSON.stringify([
      {
        id: 'site-a-key',
        role: 'editor',
        sites: ['site-a'],
        sha256: createHash('sha256').update(token).digest('hex'),
      },
    ])
    try {
      expect(() => assertSiteId('site-a')).not.toThrow()
      expect(() => assertSiteId('Unknown Site')).toThrow('siteId')
      const siteA = getRepositoryForSite('site-a')
      const siteB = getRepositoryForSite('site-b')
      const [aPost] = await siteA.list()
      const [bPost] = await siteB.list()
      await siteA.save(aPost.id, { ...aPost, title: 'Only site A' })
      expect((await siteA.get(aPost.id)).title).toBe('Only site A')
      expect((await siteB.get(bPost.id)).title).not.toBe('Only site A')
      expect(() =>
        requireSiteAutomationIdentity(
          new Request('https://admin.test', {
            headers: { authorization: 'Bearer site-a-token' },
          }),
          'editor',
          'site-b',
        ),
      ).toThrow('not authorized')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps every PostgreSQL content aggregate site scoped', async () => {
    const migration = await readFile(
      path.resolve('packages/persistence/migrations/admin/0001_initial.sql'),
      'utf8',
    )
    expect(migration).toContain('site_id TEXT NOT NULL')
    expect(migration).toContain('PRIMARY KEY (site_id, id)')
    expect(migration).toContain('PRIMARY KEY (site_id, plugin_id)')
    expect(migration).toContain('UNIQUE (site_id, idempotency_key)')
    expect(migration).toContain('UNIQUE (site_id, sha256)')
  })
})
