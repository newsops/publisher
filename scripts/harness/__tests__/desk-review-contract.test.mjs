import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DESK_CHECKLIST,
  asPublishedPost,
  deskApprovalValid,
  deskContentFingerprint,
  runDeskChecks,
  validateDeskChecklist,
} from '../../../packages/content/src/index.ts'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'
import {
  decideDesk,
  deskReportFor,
} from '../../../apps/admin/app/lib/services/desk-review.ts'
import { analyseImagePixels } from '../../../packages/persistence/src/index.ts'
import {
  GET as rawDeskGet,
  POST as rawDeskPost,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/posts/[id]/desk/route.ts'

const token = 'desk-publisher-secret'
const keys = JSON.stringify([
  {
    id: 'desk-agent',
    role: 'publisher',
    sha256: createHash('sha256').update(token).digest('hex'),
    sites: ['default'],
  },
])
let dataDirectory
// sharp is an admin dependency; resolve it from there like the service does.
const { default: sharp } = await import(
  new URL(
    '../../../apps/admin/node_modules/sharp/dist/index.mjs',
    import.meta.url,
  ).href
)

const BODY = `${Array.from({ length: 40 }, (_, index) => `Sentence ${index + 1} of a properly sourced story about a platform release.`).join(' ')}\n\nSource: [Official announcement](https://example.com/announcement).\n`

function compliantPost(overrides = {}) {
  return {
    title: 'A compliant headline that describes the story clearly',
    excerpt:
      'A short standfirst that summarises the reporting for readers in two lines.',
    bodyMarkdown: BODY,
    imageUrl: '/media/hero.webp',
    authorSlug: 'example-editor',
    categories: ['General'],
    tags: [],
    seoTitle: 'A compliant headline that describes the story',
    seoDescription:
      'Search description that reads as a complete sentence describing this story for readers.',
    ...overrides,
  }
}

const goodImage = {
  found: true,
  width: 1600,
  height: 900,
  channelDeviation: 60,
  duplicatesFirstFigure: false,
  analysed: true,
}

const fails = (checks) =>
  checks.filter((check) => check.level === 'fail').map((check) => check.id)

const deskContext = (siteId, postId) => ({
  params: Promise.resolve({ siteId, id: postId }),
})

function request(method, body, revision) {
  return new Request('http://admin.test/desk', {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(revision === undefined ? {} : { 'if-match': `"${revision}"` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('desk review contract (EDIT-001)', () => {
  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'publisher-desk-'))
    process.env.NODE_ENV = 'test'
    process.env.ADMIN_AUTOMATION_KEYS = keys
    process.env.ADMIN_DATA_DIR = dataDirectory
  })

  afterAll(async () => {
    await rm(dataDirectory, { recursive: true, force: true })
    delete process.env.ADMIN_AUTOMATION_KEYS
    delete process.env.ADMIN_DATA_DIR
  })

  it('fails the automated checks that would let a weak story through', () => {
    expect(
      fails(
        runDeskChecks(compliantPost(), {
          image: goodImage,
          authorActive: true,
        }),
      ),
    ).toEqual([])
    expect(
      fails(runDeskChecks(compliantPost({ imageUrl: undefined }))),
    ).toContain('image.present')
    expect(
      fails(
        runDeskChecks(compliantPost(), {
          image: { ...goodImage, width: 800, height: 450 },
        }),
      ),
    ).toContain('image.size')
    expect(
      fails(
        runDeskChecks(compliantPost(), {
          image: { ...goodImage, channelDeviation: 3 },
        }),
      ),
    ).toContain('image.content')
    expect(
      fails(
        runDeskChecks(compliantPost(), {
          image: { ...goodImage, duplicatesFirstFigure: true },
        }),
      ),
    ).toContain('image.duplicate')
    expect(
      fails(
        runDeskChecks(compliantPost({ bodyMarkdown: 'Too short.' }), {
          image: goodImage,
        }),
      ),
    ).toEqual(expect.arrayContaining(['body.length', 'body.sources']))
    expect(
      fails(
        runDeskChecks(compliantPost({ title: 'Short' }), { image: goodImage }),
      ),
    ).toContain('title.length')
    const unverified = runDeskChecks(compliantPost(), {
      image: { found: true, verified: false, analysed: false },
    })
    expect(unverified.find((check) => check.id === 'image.content').level).toBe(
      'warn',
    )
    expect(
      unverified.find((check) => check.id === 'image.resolved').level,
    ).toBe('warn')
  })

  it('binds the fingerprint to publish-relevant fields only', () => {
    const post = compliantPost()
    const fingerprint = deskContentFingerprint(post)
    expect(
      deskContentFingerprint({ ...post, featuredRank: 3, status: 'published' }),
    ).toBe(fingerprint)
    expect(
      deskContentFingerprint({ ...post, title: `${post.title}!` }),
    ).not.toBe(fingerprint)
    expect(
      deskContentFingerprint({ ...post, imageUrl: '/media/other.webp' }),
    ).not.toBe(fingerprint)
    expect(validateDeskChecklist([])).toEqual({
      ok: false,
      missing: DESK_CHECKLIST.map((item) => item.id),
    })
    expect(
      validateDeskChecklist(
        DESK_CHECKLIST.map((item) => ({ id: item.id, checked: true })),
      ),
    ).toEqual({ ok: true })
  })

  it('detects a blank image and a repeated picture from pixels', async () => {
    const blank = await sharp({
      create: { width: 64, height: 36, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    const busy = await sharp({
      create: { width: 64, height: 36, channels: 3, background: '#336699' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 32,
              height: 36,
              channels: 3,
              background: '#ffcc00',
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer()
    expect((await analyseImagePixels(blank)).channelDeviation).toBeLessThan(1)
    const analysis = await analyseImagePixels(busy, busy)
    expect(analysis.channelDeviation).toBeGreaterThan(12)
    expect(analysis.duplicatesCompared).toBe(true)
    expect((await analyseImagePixels(busy, blank)).duplicatesCompared).toBe(
      false,
    )
  })

  it('gates publication on a valid approval and invalidates it after edits', async () => {
    const repository = new FileContentRepository(dataDirectory)
    const seeded = await repository.list()
    // The checked-in fixture ships desk-approved so a fresh install publishes.
    expect(seeded.every((post) => deskApprovalValid(post))).toBe(true)
    expect(asPublishedPost(seeded[0])).not.toHaveProperty('deskReview')

    const draft = await repository.save(undefined, {
      ...compliantPost(),
      author: 'Example Editor',
      slug: 'desk-gated-story',
      status: 'review',
      publishedAt: '2026-09-19T00:00:00.000Z',
    })
    await expect(
      repository.save(draft.id, { ...draft, status: 'published' }),
    ).rejects.toThrow('requires a desk approval')

    const dependencies = {
      resolveImage: async () => goodImage,
      guidanceFor: async () => undefined,
    }
    const report = await deskReportFor('default', draft, dependencies)
    expect(fails(report.checks)).toEqual([])
    await expect(
      decideDesk(
        'default',
        draft.id,
        { action: 'approve', checklist: [] },
        { kind: 'automation', id: 'desk-agent' },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'desk_checklist_incomplete' })
    const approved = await decideDesk(
      'default',
      draft.id,
      {
        action: 'approve',
        checklist: DESK_CHECKLIST.map((item) => ({
          id: item.id,
          checked: true,
        })),
        note: 'Checked against site guidance.',
      },
      { kind: 'automation', id: 'desk-agent' },
      dependencies,
    )
    expect(approved.post.deskReview.status).toBe('approved')
    expect(approved.report.approvalValid).toBe(true)

    const published = await repository.save(approved.post.id, {
      ...approved.post,
      status: 'published',
    })
    expect(published.status).toBe('published')
    // Editing the content while published is refused until the desk re-approves.
    await expect(
      repository.save(published.id, {
        ...published,
        title: `${published.title} (edited)`,
      }),
    ).rejects.toThrow('requires a desk approval')
    const backToReview = await repository.save(published.id, {
      ...published,
      status: 'review',
      title: `${published.title} (edited)`,
    })
    expect(deskApprovalValid(backToReview)).toBe(false)
    await expect(
      repository.save(backToReview.id, {
        ...backToReview,
        status: 'published',
      }),
    ).rejects.toThrow(`post ${backToReview.slug} requires a desk approval`)
  })

  it('serves the report and records decisions through the automation route', async () => {
    const repository = new FileContentRepository(dataDirectory)
    const post = await repository.save(undefined, {
      ...compliantPost({ imageUrl: undefined }),
      author: 'Example Editor',
      slug: 'desk-route-story',
      status: 'review',
      publishedAt: '2026-09-19T00:00:00.000Z',
    })
    const shown = await rawDeskGet(
      request('GET'),
      deskContext('default', post.id),
    )
    expect(shown.status).toBe(200)
    const body = await shown.json()
    expect(body.report.checklist.map((item) => item.id)).toEqual(
      DESK_CHECKLIST.map((item) => item.id),
    )
    expect(fails(body.report.checks)).toContain('image.present')

    const rejected = await rawDeskPost(
      request(
        'POST',
        {
          action: 'approve',
          checklist: DESK_CHECKLIST.map((item) => ({
            id: item.id,
            checked: true,
          })),
        },
        post.revision,
      ),
      deskContext('default', post.id),
    )
    expect(rejected.status).toBe(409)
    const rejection = await rejected.json()
    expect(rejection.error.code).toBe('desk_checks_failed')
    expect(fails(rejection.report.checks)).toContain('image.present')

    const changes = await rawDeskPost(
      request(
        'POST',
        { action: 'request-changes', note: 'Add a representative image.' },
        post.revision,
      ),
      deskContext('default', post.id),
    )
    expect(changes.status).toBe(200)
    const changed = await changes.json()
    expect(changed.report.review).toMatchObject({
      status: 'changes_requested',
      reviewer: { kind: 'automation', id: 'desk-agent' },
      note: 'Add a representative image.',
    })
    const stale = await rawDeskPost(
      request(
        'POST',
        { action: 'request-changes', note: 'again' },
        post.revision,
      ),
      deskContext('default', post.id),
    )
    expect(stale.status).toBe(409)
  })

  it('returns unreviewed published posts to review when the gate is introduced', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-desk-upgrade-'),
    )
    try {
      const repository = new FileContentRepository(directory)
      const seeded = await repository.list()
      const stripped = seeded.map(({ deskReview: _review, ...post }) => post)
      await writeFile(
        path.join(directory, 'content.json'),
        JSON.stringify({
          siteId: 'default',
          posts: stripped,
          tags: await repository.listTags(),
          categories: await repository.listCategories(),
          settings: await repository.getSettings(),
          authors: await repository.listAuthors(),
          snapshots: [],
        }),
        'utf8',
      )
      const upgraded = await repository.list()
      expect(upgraded.every((post) => post.status === 'review')).toBe(true)
      expect(upgraded[0].deskReview).toMatchObject({
        status: 'pending',
        reviewer: { kind: 'upgrade', id: 'desk-gate' },
      })
      const result = await repository.publish()
      expect(result.snapshot.posts).toHaveLength(0)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
