import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PostgresAgentGuidanceRepository } from '../../../apps/admin/app/lib/adapters/agent-guidance.ts'
import { PostgresContentRepository } from '../../../apps/admin/app/lib/adapters/postgres-content-repository.ts'
import { PostgresSiteRegistry } from '../../../apps/admin/app/lib/adapters/site-registry.ts'
import {
  deskFixtureApproval,
  validateEditorialArchive,
} from '../../../packages/content/src/index.ts'
import { publicationInputs } from '../../deploy/publication-worker-core.ts'
import {
  createPublicationRecipes,
  buildIncrementalRelease,
} from '../../../packages/publication/src/index.ts'

const composition = vi.hoisted(() => ({ guidance: undefined }))
vi.mock('../../../apps/admin/app/lib/index.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  adminPool: () => undefined,
  getAgentGuidanceRepository: () => composition.guidance,
}))
import {
  GET,
  PATCH,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/agent-guidance/route.ts'

let database
let pool
const token = 'private-guidance-token'
const previousKeys = process.env.ADMIN_AUTOMATION_KEYS
const context = (siteId) => ({ params: Promise.resolve({ siteId }) })
function request(method, siteId, body, revision, authenticated = true) {
  return new Request(
    `https://admin.example.test/api/v2/sites/${siteId}/agent-guidance`,
    {
      method,
      headers: {
        ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
        ...(revision ? { 'if-match': String(revision) } : {}),
        'content-type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  )
}

beforeAll(async () => {
  database = await PGlite.create()
  const migrations = path.resolve('packages/persistence/migrations/admin')
  await database.exec('CREATE SCHEMA publisher_admin')
  for (const file of (await readdir(migrations))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    await database.exec(await readFile(path.join(migrations, file), 'utf8'))
  }
  const query = async (sql, values) => {
    const result = await database.query(sql, values)
    return { ...result, rowCount: result.affectedRows ?? result.rows.length }
  }
  pool = { query, connect: async () => ({ query, release() {} }) }
  await query(`INSERT INTO publisher_admin.sites (site_id, name, canonical_origin, theme_id)
    VALUES ('example', 'Example News', 'https://example.test', 'editorial'),
    ('other', 'Other News', 'https://other.example.test', 'editorial')`)
  composition.guidance = new PostgresAgentGuidanceRepository(pool)
  await new PostgresSiteRegistry(pool).bootstrap('example')
  process.env.ADMIN_AUTOMATION_KEYS = JSON.stringify([
    {
      id: 'guidance-key',
      role: 'editor',
      sites: ['example'],
      sha256: createHash('sha256').update(token).digest('hex'),
    },
  ])
}, 30_000)

afterAll(async () => {
  if (previousKeys === undefined) delete process.env.ADMIN_AUTOMATION_KEYS
  else process.env.ADMIN_AUTOMATION_KEYS = previousKeys
  await database?.close()
})

describe('ADMIN-002 private guidance persistence and authenticated API', () => {
  it('revision-updates only its selected site and rejects stale, oversized, or invalid input', async () => {
    const repository = composition.guidance
    const first = await repository.get('example')
    expect(first).toMatchObject({ instructions: '', revision: 1 })
    await repository.get('other')
    expect(
      await repository.update(
        'example',
        '  PRIVATE GUIDANCE SENTINEL  ',
        first.revision,
      ),
    ).toMatchObject({ instructions: 'PRIVATE GUIDANCE SENTINEL', revision: 2 })
    expect((await repository.get('other')).instructions).toBe('')
    await expect(repository.update('example', 'Stale', 1)).rejects.toThrow(
      'changed',
    )
    await expect(
      repository.update('example', 'x'.repeat(12001), 2),
    ).rejects.toThrow('12000')
    await expect(repository.update('example', {}, 2)).rejects.toThrow('string')
    await expect(repository.get('../other')).rejects.toThrow('siteId')
    const content = new PostgresContentRepository('example', pool)
    await content.saveAuthor(undefined, {
      slug: 'editor',
      name: 'Editor',
      bio: 'Fixture editor.',
    })
    await content.saveCategory(undefined, { slug: 'general', name: 'General' })
    const draft = await content.save(undefined, {
      sourceId: 'guidance-fixture',
      slug: 'guidance-fixture',
      title: 'Guidance privacy fixture',
      excerpt: 'A generic privacy fixture.',
      bodyMarkdown: 'Public article content.',
      author: 'Editor',
      authorSlug: 'editor',
      seoTitle: 'Guidance privacy fixture',
      seoDescription: 'A generic privacy fixture.',
      status: 'review',
      publishedAt: '2026-09-15T00:00:00.000Z',
      categories: ['general'],
      tags: [],
    })
    const approved = await content.reviewPost(
      draft.id,
      deskFixtureApproval(draft),
    )
    await content.save(draft.id, { ...approved, status: 'published' })
    const published = await content.publish('guidance-export-fixture')
    expect(JSON.stringify(published.snapshot)).not.toContain(
      'PRIVATE GUIDANCE SENTINEL',
    )
    expect(published.snapshot).not.toHaveProperty('agentContext')
    expect(published.snapshot).not.toHaveProperty('agentGuidance')
    const archive = validateEditorialArchive({
      ...published.snapshot,
      schemaVersion: 1,
      media: [],
      settings: {
        ...published.snapshot.settings,
        description: 'A generic fixture.',
      },
      tags: [{ slug: 'general', name: 'General' }],
      agentContext: { instructions: 'PRIVATE GUIDANCE SENTINEL' },
      posts: published.snapshot.posts,
    })
    expect(JSON.stringify(archive)).not.toContain('PRIVATE GUIDANCE SENTINEL')
    const bytes = new Map()
    const graph = createPublicationRecipes(
      await publicationInputs(published.snapshot, {
        get: async () => {
          throw new Error('No remote media expected')
        },
      }),
    )
    const built = await buildIncrementalRelease({
      siteId: 'example',
      releaseId: 'privacy-release',
      dependencies: graph.dependencies,
      recipes: graph.recipes,
      generatedAt: published.snapshot.generatedAt,
      store: {
        has: async (key) => bytes.has(key),
        put: async (key, body) => {
          bytes.set(key, body)
        },
      },
    })
    expect(
      built.manifest.entries.some((entry) => entry.kind === 'article-html'),
    ).toBe(true)
    expect(
      built.manifest.entries.some((entry) => entry.path.includes('feed')),
    ).toBe(true)
    for (const body of bytes.values())
      expect(new TextDecoder().decode(body)).not.toContain(
        'PRIVATE GUIDANCE SENTINEL',
      )
  })

  it('enforces identity/site/revision boundaries and audits safe metadata only', async () => {
    const audit = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const unauthorized = await GET(
        request('GET', 'example', undefined, undefined, false),
        context('example'),
      )
      expect(unauthorized.status).toBe(401)
      const other = await GET(request('GET', 'other'), context('other'))
      expect(other.status).toBe(403)
      const otherWrite = await PATCH(
        request('PATCH', 'other', { instructions: 'Forbidden change' }, 1),
        context('other'),
      )
      expect(otherWrite.status).toBe(403)
      expect((await composition.guidance.get('other')).instructions).toBe('')
      const read = await GET(request('GET', 'example'), context('example'))
      expect(read.status).toBe(200)
      expect(read.headers.get('cache-control')).toBe('no-store')
      const current = await read.json()
      expect(current.siteId).toBe('example')
      const missing = await PATCH(
        request('PATCH', 'example', { instructions: '' }),
        context('example'),
      )
      expect(missing.status).toBe(428)
      const saved = await PATCH(
        request(
          'PATCH',
          'example',
          { instructions: 'Require an image.' },
          current.agentContext.revision,
        ),
        context('example'),
      )
      expect(saved.status).toBe(200)
      expect(await saved.json()).toMatchObject({
        siteId: 'example',
        agentContext: {
          instructions: 'Require an image.',
          revision: current.agentContext.revision + 1,
        },
      })
      const stale = await PATCH(
        request(
          'PATCH',
          'example',
          { instructions: 'Lost update' },
          current.agentContext.revision,
        ),
        context('example'),
      )
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({
        error: { code: 'revision_conflict' },
      })
      expect(JSON.stringify(audit.mock.calls)).not.toContain(token)
      expect(JSON.stringify(audit.mock.calls)).not.toContain(
        'Require an image.',
      )
      expect(JSON.stringify(audit.mock.calls)).toContain(
        'content.site.agent_guidance.updated',
      )
    } finally {
      audit.mockRestore()
    }
  })
})
