import { describe, expect, it } from 'vitest'
import {
  buildIncrementalRelease,
  createPublicationRecipes,
  createScaleFixture,
  verifyPublicationCandidate,
} from '../../../packages/publication/src/index.ts'
import {
  createAdapterInstallation,
  projectPublicAdapterSnapshot,
} from '../../../packages/content/src/index.ts'

class Store {
  objects = new Map()
  async has(key) {
    return this.objects.has(key)
  }
  async put(key, body) {
    this.objects.set(key, body)
  }
  async get(key) {
    return this.objects.get(key)
  }
}

const adapters = (measurementId = 'G-FIXTURE01', state = 'enabled') =>
  projectPublicAdapterSnapshot(
    [
      {
        ...createAdapterInstallation('default', 'google.analytics', {
          measurementId,
          consent: 'granted',
        }),
        state,
      },
    ],
    'default',
  )

function inputs(overrides = {}) {
  const articles = createScaleFixture(3)
  return {
    siteId: 'default',
    origin: 'https://example.com',
    publicationName: 'Example News',
    language: 'en',
    semanticVersion: 'semantic-v3',
    runtimeVersion: 'runtime-v1',
    baselineVersion: 'baseline-v3',
    articles,
    recent: {
      generatedAt: '2026-09-11T00:00:00.000Z',
      slugs: articles.map((a) => a.slug),
    },
    popular: {
      generatedAt: '2026-09-11T00:00:00.000Z',
      slugs: [articles[0].slug],
      source: 'measured',
      window: '24h',
      policyApproved: true,
    },
    theme: { id: 'editorial', version: '1', css: 'body{color:#111}' },
    ...overrides,
  }
}

async function build(store, input, current, releaseId = 'next') {
  const graph = createPublicationRecipes(input)
  return buildIncrementalRelease({
    siteId: input.siteId,
    releaseId,
    ...graph,
    store,
    current,
    generatedAt: '2026-09-11T00:00:00.000Z',
  })
}

const text = async (store, result, route) =>
  new TextDecoder().decode(
    await store.get(
      result.manifest.entries.find((e) => e.path === route).objectKey,
    ),
  )

async function equivalent(before, after) {
  const store = new Store()
  const initial = await build(store, before, undefined, 'before')
  const incremental = await build(store, after, initial.manifest)
  const cleanStore = new Store()
  const clean = await build(cleanStore, after)
  expect(incremental.manifest.entries.map((e) => e.path)).toEqual(
    clean.manifest.entries.map((e) => e.path),
  )
  for (const entry of clean.manifest.entries) {
    expect(await text(store, incremental, entry.path), entry.path).toBe(
      await text(cleanStore, clean, entry.path),
    )
  }
  return { store, initial, incremental }
}

const runtime = (overrides = {}) => ({
  origin: 'https://comments.example.com',
  siteId: 'default',
  submissionEnabled: true,
  humanVerification: {
    siteKey: 'public-fixture-key',
    scriptUrl: 'https://verify.example.com/widget.js',
    globalName: 'verification',
    frameOrigins: ['https://frame.example.com'],
    connectOrigins: ['https://verify.example.com'],
  },
  ...overrides,
})

describe('operating publication continuity', () => {
  it('matches clean bytes for every HTML consumer after adapter enable/change/disable/removal', async () => {
    for (const [before, after] of [
      [inputs(), inputs({ adapters: adapters() })],
      [
        inputs({ adapters: adapters() }),
        inputs({ adapters: adapters('G-FIXTURE02') }),
      ],
      [
        inputs({ adapters: adapters() }),
        inputs({ adapters: adapters('G-FIXTURE01', 'disabled') }),
      ],
      [inputs({ adapters: adapters() }), inputs()],
    ]) {
      const { store, initial, incremental } = await equivalent(before, after)
      const html = incremental.manifest.entries.filter((e) =>
        e.contentType.startsWith('text/html'),
      )
      expect(html.length).toBeGreaterThan(6)
      for (const entry of html) {
        const body = await text(store, incremental, entry.path)
        expect(body.includes('publisher-google-analytics-id')).toBe(
          Boolean(after.adapters?.installations.length),
        )
      }
      const projection = incremental.manifest.entries.find(
        (e) => e.path === '/search-index.json',
      )
      expect(projection.objectKey).toBe(
        initial.manifest.entries.find((e) => e.path === projection.path)
          .objectKey,
      )
      expect(incremental.metrics.reused).toBeGreaterThan(0)
    }
  })

  it('matches clean bytes for comment submission and explicit verification capability changes', async () => {
    const original = runtime()
    for (const commentRuntime of [
      runtime({ origin: 'https://receiver.example.com' }),
      runtime({ submissionEnabled: false }),
      runtime({
        humanVerification: {
          ...original.humanVerification,
          siteKey: 'changed-key',
          frameOrigins: ['https://frame2.example.com'],
        },
      }),
      undefined,
    ]) {
      const { store, initial, incremental } = await equivalent(
        inputs({ commentRuntime: original }),
        inputs({ commentRuntime }),
      )
      expect(
        incremental.manifest.entries.find((e) => e.path === '/')
          .sourceReleaseId,
      ).toBe(initial.manifest.releaseId)
      const body = await text(store, incremental, '/2026/09/article-0001.html')
      if (commentRuntime) expect(body).toContain(commentRuntime.origin)
      else expect(body).not.toContain('data-comment-origin')
    }
  })

  it('updates an RSS body-only edit and lead byline name/path edits', async () => {
    const before = inputs()
    for (const delta of [
      { bodyHtml: '<p>Corrected body only</p>' },
      { authorName: 'Changed Author', authorPath: '/author/changed/' },
    ]) {
      const articles = before.articles.map((a, index) =>
        index ? a : { ...a, ...delta },
      )
      const { store, incremental } = await equivalent(
        before,
        inputs({ articles }),
      )
      if (delta.bodyHtml)
        expect(await text(store, incremental, '/feed.xml')).toContain(
          delta.bodyHtml,
        )
      else {
        expect(await text(store, incremental, '/')).toContain('Changed Author')
        expect(await text(store, incremental, '/')).toContain(
          '/author/changed/',
        )
      }
    }
  })

  it('adds/removes static comment bootstrap only when the corresponding projection exists', async () => {
    const article = inputs().articles[0]
    for (const [before, after, expected] of [
      [inputs(), inputs({ comments: { [article.slug]: [] } }), true],
      [inputs({ comments: { [article.slug]: [] } }), inputs(), false],
    ]) {
      const { store, incremental } = await equivalent(before, after)
      expect(
        (await text(store, incremental, article.path)).includes(
          '/site-runtime/comment-bootstrap.v1.js',
        ),
      ).toBe(expected)
    }
  })

  it('emits linked content-addressed consent CSS without inline style exceptions', async () => {
    const store = new Store()
    const result = await build(store, inputs())
    const css = result.manifest.entries.find((e) =>
      /^\/site-runtime\/immutable\/consent\.[a-f0-9]{64}\.css$/.test(e.path),
    )
    expect(css).toBeDefined()
    expect(await text(store, result, '/')).toContain(
      `<link rel="stylesheet" href="${css.path}">`,
    )
    expect(
      await text(store, result, '/site-runtime/consent.v1.js'),
    ).not.toContain("createElement('style')")
    expect(await text(store, result, '/_headers')).toContain("style-src 'self'")
    expect(await text(store, result, '/_headers')).not.toMatch(
      /unsafe-inline|\*\.example/,
    )
  })

  it('permits only exact configured comment/verification CSP capabilities', async () => {
    const store = new Store()
    const result = await build(store, inputs({ commentRuntime: runtime() }))
    const headers = await text(store, result, '/_headers')
    expect(headers).toContain(
      "connect-src 'self' https://comments.example.com https://verify.example.com",
    )
    expect(headers).toContain("script-src 'self' https://verify.example.com")
    expect(headers).toContain("frame-src 'self' https://frame.example.com")
    expect(headers).not.toContain('unrelated.example.com')
    await verifyPublicationCandidate(result.manifest, store)
  })

  it('rejects unsafe origins and missing verification capabilities at publication boundary', () => {
    for (const commentRuntime of [
      runtime({ origin: 'https://user:password@comments.example.com' }),
      runtime({ origin: 'https://comments.example.com/path' }),
      runtime({ humanVerification: undefined }),
      runtime({
        humanVerification: {
          ...runtime().humanVerification,
          frameOrigins: undefined,
        },
      }),
      runtime({
        humanVerification: {
          ...runtime().humanVerification,
          connectOrigins: ['https://*.example.com'],
        },
      }),
      runtime({
        humanVerification: {
          ...runtime().humanVerification,
          scriptUrl: 'javascript:alert(1)',
        },
      }),
      runtime({ origin: 42 }),
      runtime({
        humanVerification: {
          ...runtime().humanVerification,
          frameOrigins: [42],
        },
      }),
      runtime({
        humanVerification: {
          ...runtime().humanVerification,
          connectOrigins: {},
        },
      }),
    ])
      expect(() =>
        createPublicationRecipes(inputs({ commentRuntime })),
      ).toThrow(/comment|verification|origin/i)
    expect(() =>
      createPublicationRecipes(
        inputs({
          commentRuntime: runtime({
            submissionEnabled: false,
            humanVerification: undefined,
          }),
        }),
      ),
    ).not.toThrow()
  })

  it('rejects CSP origins absent from declarations, unsafe directives and malformed declarations', async () => {
    const base = createPublicationRecipes(inputs({ commentRuntime: runtime() }))
    for (const change of [
      {
        'headers:csp': base.dependencies['headers:csp'].replace(
          "style-src 'self'",
          "style-src 'self' 'unsafe-inline'",
        ),
      },
      {
        'headers:csp': base.dependencies['headers:csp'].replace(
          "script-src 'self'",
          "script-src 'self' https://unrelated.example.com",
        ),
      },
      {
        'headers:csp': `${base.dependencies['headers:csp']}; form-action https://unrelated.example.com`,
      },
      {
        'headers:origins': JSON.stringify({
          script: [],
          connect: [],
          frame: [],
          style: ['https://unrelated.example.com'],
        }),
      },
      {
        'headers:origins': JSON.stringify({
          script: ['https://*.example.com'],
          connect: [],
          frame: [],
        }),
      },
    ]) {
      const store = new Store()
      const result = await buildIncrementalRelease({
        siteId: 'default',
        releaseId: 'invalid-policy',
        recipes: base.recipes,
        dependencies: { ...base.dependencies, ...change },
        store,
        generatedAt: '2026-09-11T00:00:00.000Z',
      })
      await expect(
        verifyPublicationCandidate(result.manifest, store),
      ).rejects.toThrow(/policy|CSP|origins/)
    }
  })
})
