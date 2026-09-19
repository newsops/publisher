import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASELINE_CSP,
  assertCompletePublicationGraph,
  InMemoryReleaseActivation,
  InMemoryBuildJobRepository,
  FileSystemStaticDeployment,
  activateVerifiedRelease,
  buildIncrementalRelease,
  createPublicationRecipes,
  createScaleFixture,
  manifestChecksum,
  sanitizeCommentProjection,
  verifyPublicationCandidate,
  validatePopularityProjection,
  assertBuildJobTransition,
  getTheme,
  guardBuildJobTransitions,
} from '../../../packages/publication/src/index.ts'
import { FileBuildJobRepository } from '../../../packages/persistence/src/index.ts'
import {
  createPluginInstallation,
  projectPublicPluginSnapshot,
} from '../../../packages/content/src/index.ts'

class MemoryArtifactStore {
  objects = new Map()

  async has(key) {
    return this.objects.has(key)
  }

  async put(key, body, metadata) {
    this.objects.set(key, { body, metadata })
  }

  async get(key) {
    const value = this.objects.get(key)
    if (!value) throw new Error(`Missing object: ${key}`)
    return value.body
  }
}

function inputs(overrides = {}) {
  const articles = overrides.articles ?? createScaleFixture(12)
  return {
    siteId: 'default',
    origin: 'https://publication.example',
    publicationName: 'Fixture News',
    language: 'en',
    semanticVersion: 'semantic-v1',
    runtimeVersion: 'runtime-v1',
    baselineVersion: 'baseline-v1',
    articles,
    recent: {
      generatedAt: '2026-09-11T00:00:00.000Z',
      slugs: articles.slice(0, 5).map((article) => article.slug),
    },
    theme: {
      id: 'editorial',
      version: '1',
      css: ':root{--paper:#fff;--ink:#111}',
    },
    ...overrides,
  }
}

async function build(store, releaseId, values, current) {
  const graph = createPublicationRecipes(values)
  return buildIncrementalRelease({
    siteId: values.siteId,
    releaseId,
    dependencies: graph.dependencies,
    recipes: graph.recipes,
    store,
    current,
    generatedAt: '2026-09-11T00:00:00.000Z',
  })
}

function replaceArtifact(store, manifest, artifactPath, body) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const original = manifest.entries.find((entry) => entry.path === artifactPath)
  if (!original) throw new Error(`Missing fixture artifact: ${artifactPath}`)
  const extension = /\.[A-Za-z0-9]+$/.exec(original.objectKey)?.[0] ?? '.bin'
  const objectKey = `artifacts/sha256/${checksum}${extension}`
  const localReferences = original.contentType.startsWith('text/html')
    ? [
        ...new Set(
          [
            ...new TextDecoder()
              .decode(bytes)
              .matchAll(/(?:href|src)="([^"]+)"/g),
          ]
            .map((match) => match[1])
            .filter((value) => value.startsWith('/') && !value.startsWith('//'))
            .map((value) => value.split('#')[0].split('?')[0]),
        ),
      ].sort()
    : original.localReferences
  store.objects.set(objectKey, { body: bytes, metadata: {} })
  const { sha256: _checksum, ...payload } = manifest
  const changed = {
    ...payload,
    entries: manifest.entries.map((entry) =>
      entry.path === artifactPath
        ? { ...entry, sha256: checksum, objectKey, localReferences }
        : entry,
    ),
  }
  return { ...changed, sha256: manifestChecksum(changed) }
}

function removeArtifact(manifest, artifactPath) {
  const { sha256: _checksum, ...payload } = manifest
  const changed = {
    ...payload,
    entries: manifest.entries.filter((entry) => entry.path !== artifactPath),
  }
  return { ...changed, sha256: manifestChecksum(changed) }
}

describe('WEB-008 incremental publication contract', () => {
  it('deduplicates build jobs before a worker is claimed', async () => {
    const jobs = new InMemoryBuildJobRepository()
    const request = {
      siteId: 'default',
      snapshotId: 'snapshot-1',
      snapshotChecksum: 'a'.repeat(64),
      snapshotKey: 'sites/default/snapshots/snapshot-1.json',
      idempotencyKey: 'publish-request-1',
    }
    const first = await jobs.enqueue(request)
    const replay = await jobs.enqueue(request)
    expect(replay.jobId).toBe(first.jobId)
    expect(replay.status).toBe('queued')
    expect((await jobs.claimNext('default')).jobId).toBe(first.jobId)
    expect(await jobs.claimNext('default')).toBeUndefined()
    await expect(
      jobs.enqueue({ ...request, snapshotId: 'snapshot-2' }),
    ).rejects.toThrow('different build')
  })

  it('rejects publication status shortcuts', () => {
    expect(() => assertBuildJobTransition('queued', 'published')).toThrow(
      'Invalid build job transition',
    )
    expect(() => assertBuildJobTransition('running', 'verifying')).not.toThrow()
    expect(() => assertBuildJobTransition('verifying', 'ready')).not.toThrow()
    expect(() => assertBuildJobTransition('ready', 'published')).not.toThrow()
  })

  it('guards a storage adapter that only compare-and-swaps on status', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-jobs-'))
    try {
      const jobs = guardBuildJobTransitions(
        new FileBuildJobRepository(directory),
      )
      const queued = await jobs.enqueue({
        siteId: 'default',
        snapshotId: 'snapshot-guard',
        snapshotChecksum: 'c'.repeat(64),
        idempotencyKey: 'guard-request',
      })
      await expect(
        jobs.transition(queued.jobId, 'queued', 'published'),
      ).rejects.toThrow('Invalid build job transition')
      const running = await jobs.claimNext('default')
      expect(running.status).toBe('running')
      await expect(
        jobs.transition(running.jobId, 'queued', 'failed'),
      ).rejects.toThrow('Build job status conflict')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requeues only a failed job and preserves its attempt count', async () => {
    const jobs = new InMemoryBuildJobRepository()
    const queued = await jobs.enqueue({
      siteId: 'default',
      snapshotId: 'snapshot-retry',
      snapshotChecksum: 'b'.repeat(64),
      idempotencyKey: 'retry-request',
    })
    const running = await jobs.claimNext()
    await jobs.transition(running.jobId, 'running', 'failed', 'fixture failure')
    const retried = await jobs.retry(queued.jobId)
    expect(retried).toMatchObject({ status: 'queued', attempts: 1 })
    expect(await jobs.claimNext()).toMatchObject({
      status: 'running',
      attempts: 2,
    })
    await expect(jobs.retry(queued.jobId)).rejects.toThrow('status conflict')
  })

  it('reuses every artifact for a no-op release', async () => {
    const store = new MemoryArtifactStore()
    const first = await build(store, 'release-1', inputs())
    const second = await build(store, 'release-2', inputs(), first.manifest)
    expect(first.metrics.rendered).toBeGreaterThan(0)
    expect(second.changed).toBe(false)
    expect(second.metrics.rendered).toBe(0)
    expect(second.metrics.uploaded).toBe(0)
    expect(second.metrics.reused).toBe(first.manifest.entries.length)
  })

  it('activates manifest semantics even when changed dependencies render identical bytes', async () => {
    const store = new MemoryArtifactStore()
    const recipe = {
      path: '/constant.txt',
      kind: 'metadata',
      contentType: 'text/plain',
      cacheClass: 'html',
      dependencyKeys: ['semantic'],
      render: (read) => {
        read('semantic')
        return 'constant body'
      },
    }
    const first = await buildIncrementalRelease({
      siteId: 'default',
      releaseId: 'semantic-a',
      dependencies: { semantic: 'v1' },
      recipes: [recipe],
      store,
    })
    const second = await buildIncrementalRelease({
      siteId: 'default',
      releaseId: 'semantic-b',
      dependencies: { semantic: 'v2' },
      recipes: [recipe],
      store,
      current: first.manifest,
    })
    expect(second.metrics).toMatchObject({ rendered: 1, uploaded: 0 })
    expect(second.manifest.entries[0].sha256).toBe(
      first.manifest.entries[0].sha256,
    )
    expect(second.manifest.entries[0].dependencySha256).not.toBe(
      first.manifest.entries[0].dependencySha256,
    )
    expect(second.changed).toBe(true)
  })

  it('rejects cross-site artifact reuse and mismatched release lineage', async () => {
    const store = new MemoryArtifactStore()
    const first = await build(store, 'site-a-release', inputs())
    await expect(
      buildIncrementalRelease({
        siteId: 'site-b',
        releaseId: 'site-b-release',
        dependencies: {},
        recipes: [],
        store,
        current: first.manifest,
      }),
    ).rejects.toThrow('different site')
    const candidate = await build(
      store,
      'site-a-next',
      inputs(),
      first.manifest,
    )
    const wrongPrevious = {
      ...first.manifest,
      releaseId: 'unrelated-release',
    }
    const { sha256: _checksum, ...wrongPreviousPayload } = wrongPrevious
    await expect(
      verifyPublicationCandidate(candidate.manifest, store, {
        ...wrongPreviousPayload,
        sha256: manifestChecksum(wrongPreviousPayload),
      }),
    ).rejects.toThrow('lineage mismatch')
  })

  it('keeps semantic article HTML free of theme and mutable list dependencies', () => {
    const graph = createPublicationRecipes(inputs())
    const article = graph.recipes.find(
      (recipe) => recipe.kind === 'article-html',
    )
    expect(article.dependencyKeys).toContain('template:semantic')
    expect(article.dependencyKeys).toContain('theme:baseline')
    expect(
      article.dependencyKeys.some((key) => key.startsWith('theme:editorial')),
    ).toBe(false)
    expect(article.dependencyKeys).not.toContain('projection:recent')
    expect(article.dependencyKeys).not.toContain('projection:popular')
  })

  it('emits a complete responsive selected-theme artifact outside article dependencies', () => {
    const graph = createPublicationRecipes(
      inputs({ theme: getTheme('editorial') }),
    )
    const theme = graph.recipes.find(
      (recipe) =>
        recipe.kind === 'theme' &&
        recipe.path.startsWith('/theme-runtime/immutable/editorial.'),
    )
    expect(theme).toBeDefined()
    const css = theme.render((key) => graph.dependencies[key])
    expect(css).toMatch(/body\s*\{/)
    expect(css).toMatch(/header\s*\{/)
    expect(css).toMatch(/main\s*\{/)
    expect(css).toMatch(/article\s*\{/)
    for (const selector of [
      '.main-header',
      '.lead-title',
      ".post-list[data-variant='grid']",
      '.editorial-rail',
      '.post-body',
      '.comments',
      '.site-footer',
    ])
      expect(css).toContain(selector)
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)/)
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)/)
    const article = graph.recipes.find(
      (recipe) => recipe.kind === 'article-html',
    )
    expect(article?.dependencyKeys).not.toContain('theme:editorial:1')
    const currentTheme = graph.recipes.find(
      (recipe) => recipe.path === '/theme-runtime/current.css',
    )
    expect(currentTheme).toMatchObject({
      kind: 'theme',
      cacheClass: 'runtime-pointer',
    })
    expect(currentTheme.render((key) => graph.dependencies[key])).toBe(css)
  })

  it('emits a portable cache policy without broad immutable rules', () => {
    const graph = createPublicationRecipes(inputs())
    const headers = graph.recipes.find((recipe) => recipe.path === '/_headers')
    expect(headers).toMatchObject({
      kind: 'metadata',
      contentType: 'text/plain; charset=utf-8',
    })
    const policy = headers.render((key) => graph.dependencies[key])
    for (const path of [
      '/media/*',
      '/theme-runtime/immutable/*',
      '/data/immutable/*',
    ])
      expect(policy).toContain(
        `${path}\n  Cache-Control: public, max-age=31536000, immutable`,
      )
    for (const path of [
      '/theme-runtime/current.css',
      '/.well-known/publisher/*',
      '/data/comments/*',
      '/search-index.json',
      '/site-runtime/*',
    ])
      expect(policy).toContain(
        `${path}\n  Cache-Control: public, max-age=0, must-revalidate`,
      )
    expect(policy).not.toMatch(/\n\/theme-runtime\/\*\n[\s\S]*immutable/)
    expect(policy).not.toMatch(/\n\/data\/\*\n[\s\S]*immutable/)
    expect(policy).not.toMatch(/\n\/\*\n\s+Cache-Control:/)
  })

  it('uses hash-shaped immutable namespaces behind stable runtime pointers', () => {
    const graph = createPublicationRecipes(
      inputs({
        popular: {
          generatedAt: '2026-09-11T00:00:00.000Z',
          slugs: ['article-0002', 'article-0001'],
          source: 'editorial',
          window: '7d',
          policyApproved: true,
        },
      }),
    )
    const paths = graph.recipes.map((recipe) => recipe.path)
    expect(paths).toContain('/theme-runtime/current.css')
    expect(paths).toContain('/search-index.json')
    expect(paths).toContain('/_headers')
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^\/theme-runtime\/immutable\/baseline\.[a-f0-9]{64}\.css$/,
        ),
        expect.stringMatching(
          /^\/theme-runtime\/immutable\/editorial\.[a-f0-9]{64}\.css$/,
        ),
        expect.stringMatching(
          /^\/data\/immutable\/recent\.[a-f0-9]{64}\.json$/,
        ),
        expect.stringMatching(
          /^\/data\/immutable\/popular\.[a-f0-9]{64}\.json$/,
        ),
      ]),
    )
  })

  it('renders the complete editorial home shell with a lead, feed, rail, and footer', async () => {
    const body = new TextEncoder().encode('editorial image fixture')
    const sha256 = createHash('sha256').update(body).digest('hex')
    const mediaPath = `/media/${sha256}.webp`
    const base = inputs()
    const articles = base.articles.map((article, index) =>
      index < 3
        ? {
            ...article,
            imageUrl: mediaPath,
            imageAlt: 'Editorial fixture illustration',
          }
        : article,
    )
    const values = inputs({
      articles,
      media: [
        {
          id: 'editorial-media',
          publicPath: mediaPath,
          sha256,
          mimeType: 'image/webp',
          body,
        },
      ],
    })
    const store = new MemoryArtifactStore()
    const result = await build(store, 'editorial-home', values)
    const home = result.manifest.entries.find((entry) => entry.path === '/')
    const html = new TextDecoder().decode(
      store.objects.get(home.objectKey).body,
    )
    for (const expected of [
      'class="topbar"',
      'class="brand"',
      'aria-label="Essential navigation"',
      'class="lead"',
      'class="lead-title"',
      'class="lead-figure"',
      'class="post-list" data-variant="grid"',
      '<h2>Latest stories</h2>',
      'class="sidebar editorial-rail"',
      '<h2>Archive</h2>',
      '<h2>Sections</h2>',
      'class="site-footer"',
    ])
      expect(html).toContain(expected)
    expect(html).toContain('Description 0001')
    expect(html).toContain(`src="${mediaPath}"`)
  })

  it('renders crawlable editorial article content and metadata without JavaScript', async () => {
    const body = new TextEncoder().encode('article hero fixture')
    const sha256 = createHash('sha256').update(body).digest('hex')
    const mediaPath = `/media/${sha256}.webp`
    const base = inputs()
    const articles = base.articles.map((article, index) =>
      index === 0
        ? {
            ...article,
            imageUrl: mediaPath,
            imageAlt: 'Article hero fixture',
          }
        : article,
    )
    const store = new MemoryArtifactStore()
    const result = await build(
      store,
      'release-seo',
      inputs({
        articles,
        media: [
          {
            id: 'article-hero',
            publicPath: mediaPath,
            sha256,
            mimeType: 'image/webp',
            body,
          },
        ],
      }),
    )
    const entry = result.manifest.entries.find(
      (candidate) => candidate.kind === 'article-html',
    )
    const html = new TextDecoder().decode(
      store.objects.get(entry.objectKey).body,
    )
    expect(html).toContain('<h1>Article 0001</h1>')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<h2>Section 0001</h2>')
    expect(html).toContain('rel="canonical"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('NewsArticle')
    expect(html).toContain('property="og:description"')
    expect(html).toContain('data-updated')
    expect(html).toContain('aria-label="Essential navigation"')
    expect(html).toContain('class="article-head"')
    expect(html).toContain('class="byline"')
    expect(html).toContain('class="article-figure"')
    expect(html).toContain('alt="Article hero fixture"')
    expect(html).toContain('class="prose"')
    expect(html).toContain('class="article-tags"')
    expect(html).toContain('class="comments"')
    expect(html).toContain('class="site-footer"')
    expect(html).toContain('Read recent stories')
    expect(html).toContain(
      '<link rel="stylesheet" href="/theme-runtime/current.css">',
    )
    expect(html).not.toContain('/site-runtime/theme-bootstrap.v1.js')
    expect(html).not.toContain('theme:editorial')
    const baseline = result.manifest.entries.find((candidate) =>
      candidate.path.startsWith('/theme-runtime/immutable/baseline.'),
    )
    expect(baseline).toMatchObject({ kind: 'theme' })
    expect(store.objects.has(baseline.objectKey)).toBe(true)
    expect(
      result.manifest.entries.find(
        (candidate) => candidate.path === '/theme-runtime/current.css',
      ),
    ).toMatchObject({ kind: 'theme', cacheClass: 'runtime-pointer' })
  })

  it('updates synchronous theme CSS without rebuilding article HTML', async () => {
    const store = new MemoryArtifactStore()
    const first = await build(store, 'theme-before', inputs())
    const second = await build(
      store,
      'theme-after',
      inputs({
        theme: {
          id: 'editorial',
          version: '2',
          css: ':root{--paper:#f7f4ee;--ink:#101010}',
        },
      }),
      first.manifest,
    )
    const article = second.manifest.entries.find(
      (entry) => entry.kind === 'article-html',
    )
    const currentTheme = second.manifest.entries.find(
      (entry) => entry.path === '/theme-runtime/current.css',
    )
    const immutableTheme = second.manifest.entries.find((entry) =>
      entry.path.startsWith('/theme-runtime/immutable/editorial.'),
    )
    expect(article.sourceReleaseId).toBe('theme-before')
    expect(currentTheme.sourceReleaseId).toBe('theme-after')
    expect(immutableTheme.sourceReleaseId).toBe('theme-after')
    expect(
      new TextDecoder().decode(store.objects.get(currentTheme.objectKey).body),
    ).toContain('--paper:#f7f4ee')
  })

  it('rebuilds editorial indexes when visible story-card data changes', async () => {
    const store = new MemoryArtifactStore()
    const original = inputs()
    const first = await build(store, 'story-card-before', original)
    const articles = original.articles.map((article, index) =>
      index === 0
        ? { ...article, description: 'Updated visible deck' }
        : article,
    )
    const second = await build(
      store,
      'story-card-after',
      inputs({ articles }),
      first.manifest,
    )
    const home = second.manifest.entries.find((entry) => entry.path === '/')
    const html = new TextDecoder().decode(
      store.objects.get(home.objectKey).body,
    )
    expect(html).toContain('Updated visible deck')
    expect(home.sourceReleaseId).toBe('story-card-after')
  })

  it('generates every article-derived index, search, feed, and sitemap route', async () => {
    const values = inputs()
    const graph = createPublicationRecipes(values)
    const paths = graph.recipes.map((recipe) => recipe.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/404.html',
        '/recent/',
        '/search/',
        '/search-index.json',
        '/search/label/Technology/',
        '/author/fixture/',
        '/2026/09/',
        '/feed.xml',
        '/sitemap.xml',
      ]),
    )
    const store = new MemoryArtifactStore()
    const result = await build(store, 'complete-indexes', values)
    const sitemap = result.manifest.entries.find(
      (entry) => entry.path === '/sitemap.xml',
    )
    const feed = result.manifest.entries.find(
      (entry) => entry.path === '/feed.xml',
    )
    expect(
      new TextDecoder().decode(store.objects.get(sitemap.objectKey).body),
    ).toContain('https://publication.example/2026/09/article-0001.html')
    expect(
      new TextDecoder().decode(store.objects.get(feed.objectKey).body),
    ).toContain('<title>Article 0001</title>')
    const notFound = result.manifest.entries.find(
      (entry) => entry.path === '/404.html',
    )
    const notFoundHtml = new TextDecoder().decode(
      store.objects.get(notFound.objectKey).body,
    )
    expect(notFoundHtml).toContain('<h1>Page not found</h1>')
    expect(notFoundHtml).toContain('content="noindex,follow"')
    expect(notFoundHtml).toContain('class="site-footer"')
  })

  it('requires article images to be materialized with alternative text', async () => {
    const body = new TextEncoder().encode('verified image fixture')
    const sha256 = createHash('sha256').update(body).digest('hex')
    const mediaPath = `/media/${sha256}.webp`
    const base = inputs()
    const articles = base.articles.map((article, index) =>
      index === 0
        ? {
            ...article,
            imageUrl: mediaPath,
            imageAlt: 'Verified fixture illustration',
          }
        : article,
    )
    expect(() => createPublicationRecipes(inputs({ articles }))).toThrow(
      'outside the release',
    )
    expect(() =>
      createPublicationRecipes(
        inputs({
          articles,
          media: [
            {
              id: 'mutable-media-path',
              publicPath: '/media/verified.webp',
              sha256,
              mimeType: 'image/webp',
              body,
            },
          ],
        }),
      ),
    ).toThrow('content-addressed')
    const values = inputs({
      articles,
      media: [
        {
          id: 'verified-media',
          publicPath: mediaPath,
          sha256,
          mimeType: 'image/webp',
          body,
        },
      ],
    })
    const store = new MemoryArtifactStore()
    const result = await build(store, 'materialized-image', values)
    const article = result.manifest.entries.find(
      (entry) => entry.path === articles[0].path,
    )
    expect(
      new TextDecoder().decode(store.objects.get(article.objectKey).body),
    ).toContain('alt="Verified fixture illustration"')
  })

  it('fails closed on undeclared or unused dependencies', async () => {
    const store = new MemoryArtifactStore()
    await expect(
      buildIncrementalRelease({
        siteId: 'default',
        releaseId: 'undeclared',
        dependencies: { declared: 'a', hidden: 'b' },
        recipes: [
          {
            path: '/index.html',
            kind: 'index-html',
            contentType: 'text/html',
            cacheClass: 'html',
            dependencyKeys: ['declared'],
            render: (read) => read('hidden'),
          },
        ],
        store,
      }),
    ).rejects.toThrow('undeclared dependency')
    await expect(
      buildIncrementalRelease({
        siteId: 'default',
        releaseId: 'unused',
        dependencies: { declared: 'a' },
        recipes: [
          {
            path: '/index.html',
            kind: 'index-html',
            contentType: 'text/html',
            cacheClass: 'html',
            dependencyKeys: ['declared'],
            render: () => '<html></html>',
          },
        ],
        store,
      }),
    ).rejects.toThrow('declared but did not read')

    const values = inputs()
    const complete = createPublicationRecipes(values)
    expect(() =>
      assertCompletePublicationGraph(
        values,
        complete.recipes.filter(
          (recipe) => recipe.path !== values.articles[0].path,
        ),
      ),
    ).toThrow('omitted required artifact')
    await expect(
      buildIncrementalRelease({
        siteId: 'default',
        releaseId: 'duplicate',
        dependencies: { declared: 'a' },
        recipes: [
          {
            path: '/duplicate',
            kind: 'metadata',
            contentType: 'text/plain',
            cacheClass: 'html',
            dependencyKeys: ['declared'],
            render: (read) => read('declared'),
          },
          {
            path: '/duplicate',
            kind: 'metadata',
            contentType: 'text/plain',
            cacheClass: 'html',
            dependencyKeys: ['declared'],
            render: (read) => read('declared'),
          },
        ],
        store,
      }),
    ).rejects.toThrow('Duplicate artifact path')
  })

  it('removes unpublished routes and their projections from the candidate', async () => {
    const store = new MemoryArtifactStore()
    const seed = inputs()
    const baselineInput = inputs({ comments: { [seed.articles[0].slug]: [] } })
    const baseline = await build(store, 'before-unpublish', baselineInput)
    const removedArticle = baselineInput.articles[0]
    const articles = baselineInput.articles.slice(1)
    const unpublished = await build(
      store,
      'after-unpublish',
      inputs({ articles }),
      baseline.manifest,
    )
    const paths = unpublished.manifest.entries.map((entry) => entry.path)
    expect(paths).not.toContain(removedArticle.path)
    expect(paths).not.toContain(
      `/data/comments/${encodeURIComponent(removedArticle.slug)}.json`,
    )
    expect(unpublished.metrics.removed).toBeGreaterThanOrEqual(2)
  })

  it('rejects a reused HTML artifact that links to an unpublished route', async () => {
    const store = new MemoryArtifactStore()
    const original = inputs()
    const removed = original.articles[0]
    const linkedArticles = original.articles.map((article, index) =>
      index === 1
        ? {
            ...article,
            bodyHtml: `${article.bodyHtml}<p><a href="${removed.path}">Related</a></p>`,
          }
        : article,
    )
    const baseline = await build(
      store,
      'linked-before-unpublish',
      inputs({ articles: linkedArticles }),
    )
    await verifyPublicationCandidate(baseline.manifest, store)
    const candidate = await build(
      store,
      'linked-after-unpublish',
      inputs({ articles: linkedArticles.slice(1) }),
      baseline.manifest,
    )
    expect(
      candidate.manifest.entries.find(
        (entry) => entry.path === linkedArticles[1].path,
      ).sourceReleaseId,
    ).toBe(baseline.manifest.releaseId)
    await expect(
      verifyPublicationCandidate(candidate.manifest, store, baseline.manifest),
    ).rejects.toThrow('missing local artifact')
  })

  it('requires evidence before a list may be called popular', () => {
    expect(() =>
      validatePopularityProjection({ slugs: ['article-0001'] }),
    ).toThrow('Popular projection requires')
    expect(() =>
      validatePopularityProjection({
        source: 'privacy-reviewed aggregate',
        window: '7d',
        generatedAt: '2026-09-11T00:00:00.000Z',
        policyApproved: true,
        slugs: ['article-0001'],
      }),
    ).not.toThrow()
  })

  it('projects only sanitized approved comments', () => {
    const projected = sanitizeCommentProjection([
      {
        id: 'approved',
        authorName: '<b>Alice</b>',
        body: '<script>alert(1)</script>Useful note',
        status: 'approved',
        createdAt: '2026-09-11T00:00:00.000Z',
      },
      {
        id: 'pending',
        authorName: 'Mallory',
        body: 'not public',
        status: 'pending',
        createdAt: '2026-09-11T00:00:00.000Z',
      },
    ])
    expect(projected).toEqual([
      {
        id: 'approved',
        authorName: 'Alice',
        body: 'alert(1)Useful note',
        createdAt: '2026-09-11T00:00:00.000Z',
      },
    ])
  })

  it('publishes short-lived comment pointers to immutable approved data', async () => {
    const store = new MemoryArtifactStore()
    const values = inputs({
      comments: {
        'article-0001': [
          {
            id: 'approved-comment',
            authorName: 'Reader',
            body: 'Useful context',
            status: 'approved',
            createdAt: '2026-09-11T00:00:00.000Z',
          },
        ],
      },
    })
    const result = await build(store, 'comment-pointer', values)
    const pointer = result.manifest.entries.find(
      (entry) => entry.path === '/data/comments/article-0001.json',
    )
    expect(pointer).toMatchObject({
      kind: 'runtime',
      cacheClass: 'runtime-pointer',
    })
    const pointerBody = JSON.parse(
      new TextDecoder().decode(store.objects.get(pointer.objectKey).body),
    )
    const projection = result.manifest.entries.find(
      (entry) => entry.path === pointerBody.projection,
    )
    expect(projection).toMatchObject({
      kind: 'projection',
      cacheClass: 'immutable',
    })
    expect(pointerBody.projection).toMatch(
      /^\/data\/immutable\/comments\/article-0001\.[a-f0-9]{64}\.json$/,
    )
    expect(
      JSON.parse(
        new TextDecoder().decode(store.objects.get(projection.objectKey).body),
      ),
    ).toMatchObject([{ id: 'approved-comment', body: 'Useful context' }])
    await expect(
      verifyPublicationCandidate(result.manifest, store),
    ).resolves.toBeUndefined()
  })

  it('allows only verified compare-and-swap activation and rebuild-free rollback', async () => {
    const store = new MemoryArtifactStore()
    const first = await build(store, 'release-a', inputs())
    const second = await build(store, 'release-b', inputs(), first.manifest)
    const activation = new InMemoryReleaseActivation()
    await expect(
      activateVerifiedRelease({
        manifest: first.manifest,
        expectedReleaseId: undefined,
        activation,
        verified: false,
      }),
    ).rejects.toThrow('Unverified')
    await activateVerifiedRelease({
      manifest: first.manifest,
      expectedReleaseId: undefined,
      activation,
      verified: true,
    })
    await expect(
      activateVerifiedRelease({
        manifest: second.manifest,
        expectedReleaseId: undefined,
        activation,
        verified: true,
      }),
    ).rejects.toThrow('activation conflict')
    await activateVerifiedRelease({
      manifest: second.manifest,
      expectedReleaseId: 'release-a',
      activation,
      verified: true,
    })
    await activation.compareAndSwap('default', 'release-b', 'release-a')
    expect(await activation.current('default')).toBe('release-a')
    expect(second.metrics.rendered).toBe(0)
  })

  it('materializes immutable static candidates and survives provider outage', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'static-release-'))
    const store = new MemoryArtifactStore()
    try {
      const first = await build(store, 'release-static-a', inputs())
      const second = await build(
        store,
        'release-static-b',
        inputs({
          articles: inputs().articles.map((article, index) =>
            index === 0 ? { ...article, title: 'Updated title' } : article,
          ),
        }),
        first.manifest,
      )
      const deployment = new FileSystemStaticDeployment(directory)
      await deployment.materializeCandidate(first.manifest, store)
      const conflicting = await build(
        store,
        first.manifest.releaseId,
        inputs({
          articles: inputs().articles.map((article, index) =>
            index === 1 ? { ...article, title: 'Conflicting title' } : article,
          ),
        }),
      )
      await expect(
        deployment.materializeCandidate(conflicting.manifest, store),
      ).rejects.toThrow('different content')
      await deployment.materializeCandidate(second.manifest, store)
      const unchangedPath = first.manifest.entries
        .find(
          (entry) =>
            entry.kind === 'article-html' &&
            entry.path !== '/2026/09/article-0001.html',
        )
        .path.slice(1)
      expect(
        (
          await stat(
            path.join(directory, 'releases/release-static-a', unchangedPath),
          )
        ).ino,
      ).toBe(
        (
          await stat(
            path.join(directory, 'releases/release-static-b', unchangedPath),
          )
        ).ino,
      )
      await deployment.activate(undefined, first.manifest.releaseId)
      const beforeOutage = new TextDecoder().decode(
        await deployment.readCurrent(first.manifest.entries[0].path),
      )
      store.get = async () => {
        throw new Error('object provider unavailable')
      }
      expect(
        new TextDecoder().decode(
          await deployment.readCurrent(first.manifest.entries[0].path),
        ),
      ).toBe(beforeOutage)
      await deployment.activate(
        first.manifest.releaseId,
        second.manifest.releaseId,
      )
      await deployment.verifyRelease(first.manifest.releaseId)
      await deployment.activate(
        second.manifest.releaseId,
        first.manifest.releaseId,
      )
      expect(await deployment.currentReleaseId()).toBe(first.manifest.releaseId)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects malformed candidates and stale concurrent activation', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'static-cas-'))
    const store = new MemoryArtifactStore()
    try {
      const first = await build(store, 'release-cas-a', inputs())
      const second = await build(
        store,
        'release-cas-b',
        inputs(),
        first.manifest,
      )
      const malformed = {
        ...first.manifest,
        sha256: '0'.repeat(64),
      }
      const deployment = new FileSystemStaticDeployment(directory)
      await expect(
        deployment.materializeCandidate(malformed, store),
      ).rejects.toThrow('manifest checksum')
      const partial = await build(store, 'release-partial', inputs())
      await mkdir(path.join(directory, 'releases/release-partial'), {
        recursive: true,
      })
      await expect(
        deployment.materializeCandidate(partial.manifest, store),
      ).rejects.toThrow()
      const articleEntry = first.manifest.entries.find(
        (entry) => entry.kind === 'article-html',
      )
      const invalidHtml = new TextEncoder().encode(
        '<html>invalid article</html>',
      )
      const invalidSha256 = createHash('sha256')
        .update(invalidHtml)
        .digest('hex')
      const invalidObjectKey = `artifacts/sha256/${invalidSha256}.html`
      store.objects.set(invalidObjectKey, { body: invalidHtml, metadata: {} })
      const { sha256: _checksum, ...manifestPayload } = first.manifest
      const semanticPayload = {
        ...manifestPayload,
        entries: first.manifest.entries.map((entry) =>
          entry.path === articleEntry.path
            ? {
                ...entry,
                sha256: invalidSha256,
                objectKey: invalidObjectKey,
              }
            : entry,
        ),
      }
      await expect(
        verifyPublicationCandidate(
          {
            ...semanticPayload,
            sha256: manifestChecksum(semanticPayload),
          },
          store,
        ),
      ).rejects.toThrow('semantic document shell')
      await deployment.materializeCandidate(first.manifest, store)
      await deployment.materializeCandidate(second.manifest, store)
      await deployment.activate(undefined, first.manifest.releaseId)
      const attempts = await Promise.allSettled([
        deployment.activate(
          first.manifest.releaseId,
          second.manifest.releaseId,
        ),
        deployment.activate(
          first.manifest.releaseId,
          second.manifest.releaseId,
        ),
      ])
      expect(
        attempts.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        attempts.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects semantic policy, runtime, and internal-link corruption', async () => {
    const store = new MemoryArtifactStore()
    const result = await build(
      store,
      'semantic-verification',
      inputs({
        comments: {
          'article-0001': [
            {
              id: 'approved-comment',
              authorName: 'Reader',
              body: 'Useful context',
              status: 'approved',
              createdAt: '2026-09-11T00:00:00.000Z',
            },
          ],
        },
      }),
    )
    const policy = replaceArtifact(
      store,
      result.manifest,
      '/.well-known/publisher/release-policy.json',
      `${JSON.stringify({
        schemaVersion: 1,
        contentSecurityPolicy: "default-src * 'unsafe-inline'",
      })}\n`,
    )
    await expect(verifyPublicationCandidate(policy, store)).rejects.toThrow(
      'baseline CSP',
    )

    await expect(
      verifyPublicationCandidate(
        removeArtifact(result.manifest, '/_headers'),
        store,
      ),
    ).rejects.toThrow('static-host policy')
    await expect(
      verifyPublicationCandidate(
        removeArtifact(result.manifest, '/theme-runtime/current.css'),
        store,
      ),
    ).rejects.toThrow('missing local artifact')

    const runtimeEntry = result.manifest.entries.find(
      (entry) => entry.path === '/.well-known/publisher/runtime.json',
    )
    const runtime = JSON.parse(
      new TextDecoder().decode(store.objects.get(runtimeEntry.objectKey).body),
    )
    const badRuntime = replaceArtifact(
      store,
      result.manifest,
      runtimeEntry.path,
      `${JSON.stringify({ ...runtime, themeCss: '/missing-theme.css' })}\n`,
    )
    await expect(verifyPublicationCandidate(badRuntime, store)).rejects.toThrow(
      'missing artifact',
    )

    const articleEntry = result.manifest.entries.find(
      (entry) => entry.kind === 'article-html',
    )
    const article = new TextDecoder().decode(
      store.objects.get(articleEntry.objectKey).body,
    )
    const badLink = replaceArtifact(
      store,
      result.manifest,
      articleEntry.path,
      article.replace('href="/recent/"', 'href="/missing-index/"'),
    )
    await expect(verifyPublicationCandidate(badLink, store)).rejects.toThrow(
      'missing local artifact',
    )

    const badCommentPointer = replaceArtifact(
      store,
      result.manifest,
      '/data/comments/article-0001.json',
      `${JSON.stringify({
        schemaVersion: 1,
        projection: '/data/comments/missing.json',
      })}\n`,
    )
    await expect(
      verifyPublicationCandidate(badCommentPointer, store),
    ).rejects.toThrow('comment pointer is invalid')
  })

  it('publishes the exact provider-neutral baseline CSP', () => {
    expect(BASELINE_CSP).toBe(
      "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'",
    )
    expect(BASELINE_CSP).not.toMatch(/https?:|\*|unsafe-/)
  })

  it('carries a granted public plugin through HTML, runtime, and CSP output', async () => {
    const store = new MemoryArtifactStore()
    const plugins = projectPublicPluginSnapshot(
      [
        {
          ...createPluginInstallation('default', 'google.analytics', {
            measurementId: 'G-ABC12345',
            consent: 'granted',
          }),
          state: 'enabled',
        },
      ],
      'default',
    )
    const result = await build(store, 'plugin-granted', inputs({ plugins }))
    const htmlEntry = result.manifest.entries.find(
      (entry) => entry.kind === 'index-html',
    )
    const html = new TextDecoder().decode(
      store.objects.get(htmlEntry.objectKey).body,
    )
    expect(html).toContain('publisher-google-analytics-id')
    expect(html).toContain('/plugin-runtime/google-analytics.js')
    const runtime = result.manifest.entries.find(
      (entry) => entry.path === '/plugin-runtime/google-analytics.js',
    )
    expect(runtime).toBeDefined()
    const headers = new TextDecoder().decode(
      store.objects.get(
        result.manifest.entries.find((entry) => entry.path === '/_headers')
          .objectKey,
      ).body,
    )
    expect(headers).toContain('https://www.googletagmanager.com')
    expect(headers).toContain('https://www.google-analytics.com')
    await verifyPublicationCandidate(result.manifest, store)
  })

  it('keeps denied analytics byte-inert and provider-neutral', async () => {
    const store = new MemoryArtifactStore()
    const plugins = projectPublicPluginSnapshot(
      [
        {
          ...createPluginInstallation('default', 'google.analytics', {
            measurementId: 'G-ABC12345',
            consent: 'denied',
          }),
          state: 'enabled',
        },
      ],
      'default',
    )
    const result = await build(store, 'plugin-denied', inputs({ plugins }))
    const htmlEntry = result.manifest.entries.find(
      (entry) => entry.kind === 'index-html',
    )
    const html = new TextDecoder().decode(
      store.objects.get(htmlEntry.objectKey).body,
    )
    expect(html).not.toContain('publisher-google-analytics-id')
    expect(
      result.manifest.entries.some(
        (entry) => entry.path === '/plugin-runtime/google-analytics.js',
      ),
    ).toBe(false)
    const headers = new TextDecoder().decode(
      store.objects.get(
        result.manifest.entries.find((entry) => entry.path === '/_headers')
          .objectKey,
      ).body,
    )
    expect(headers).not.toContain('googletagmanager.com')
    expect(headers).not.toContain('google-analytics.com')
    await verifyPublicationCandidate(result.manifest, store)
  })
})
