import { describe, expect, it } from 'vitest'
import {
  buildIncrementalRelease,
  createPublicationRecipes,
  createScaleFixture,
} from '../../../packages/publication/src/index.ts'

class CountingStore {
  objects = new Set()
  async has(key) {
    return this.objects.has(key)
  }
  async put(key) {
    this.objects.add(key)
  }
}

function fixture(overrides = {}) {
  const articles = overrides.articles ?? createScaleFixture(1_000)
  return {
    siteId: 'scale',
    origin: 'https://scale.example',
    publicationName: 'Scale News',
    language: 'en',
    semanticVersion: 'semantic-v1',
    runtimeVersion: 'runtime-v1',
    baselineVersion: 'baseline-v1',
    articles,
    recent: {
      generatedAt: '2026-09-11T00:00:00.000Z',
      slugs: articles.slice(0, 10).map((article) => article.slug),
    },
    theme: {
      id: 'editorial',
      version: '1',
      css: ':root{--paper:#fff;--ink:#111}',
    },
    comments: {},
    ...overrides,
  }
}

async function build(store, id, input, current) {
  const graph = createPublicationRecipes(input)
  return buildIncrementalRelease({
    siteId: input.siteId,
    releaseId: id,
    dependencies: graph.dependencies,
    recipes: graph.recipes,
    store,
    current,
    generatedAt: '2026-09-11T00:00:00.000Z',
  })
}

function changedPaths(current, next) {
  const previous = new Map(current.entries.map((entry) => [entry.path, entry]))
  return next.entries
    .filter((entry) => previous.get(entry.path)?.sha256 !== entry.sha256)
    .map((entry) => entry.path)
}

describe('WEB-008 1,000-article invalidation regression', () => {
  it('keeps no-op and visual theme changes at zero article renders/uploads', async () => {
    const store = new CountingStore()
    const baselineInput = fixture()
    const baseline = await build(store, 'baseline', baselineInput)
    expect(baseline.metrics.renderedByKind['article-html']).toBe(1_000)

    const noOp = await build(store, 'no-op', baselineInput, baseline.manifest)
    expect(noOp.metrics.renderedByKind['article-html']).toBe(0)
    expect(noOp.metrics.uploadedByKind['article-html']).toBe(0)
    expect(noOp.metrics.rendered).toBe(0)

    const themed = await build(
      store,
      'theme-change',
      fixture({
        articles: baselineInput.articles,
        theme: {
          id: 'signal',
          version: '2',
          css: ':root{--paper:#fbfaf5;--ink:#17231d}',
        },
      }),
      baseline.manifest,
    )
    expect(themed.metrics.renderedByKind['article-html']).toBe(0)
    expect(themed.metrics.uploadedByKind['article-html']).toBe(0)
    expect(themed.metrics.renderedByKind.theme).toBe(1)
    expect(themed.metrics.renderedByKind.runtime).toBe(1)
    expect(
      themed.manifest.entries
        .filter((entry) => entry.kind === 'article-html')
        .map((entry) => entry.sha256),
    ).toEqual(
      baseline.manifest.entries
        .filter((entry) => entry.kind === 'article-html')
        .map((entry) => entry.sha256),
    )
  })

  it('bounds article, recent, popular, and comment invalidation independently', async () => {
    const store = new CountingStore()
    const baselineInput = fixture()
    const baseline = await build(store, 'baseline', baselineInput)

    const articles = baselineInput.articles.map((article, index) =>
      index === 0
        ? {
            ...article,
            title: 'Updated article title',
            updatedAt: '2026-09-11T01:00:00.000Z',
          }
        : article,
    )
    const edited = await build(
      store,
      'article-edit',
      fixture({ articles }),
      baseline.manifest,
    )
    expect(edited.metrics.renderedByKind['article-html']).toBe(1)
    expect(changedPaths(baseline.manifest, edited.manifest)).toEqual(
      expect.arrayContaining([
        '/2026/09/article-0001.html',
        '/',
        '/recent/',
        '/search/label/Technology/',
        '/author/fixture/',
        '/2026/09/',
        '/search/',
        '/search-index.json',
        '/feed.xml',
        '/sitemap.xml',
      ]),
    )

    const recent = await build(
      store,
      'recent-change',
      fixture({
        articles: baselineInput.articles,
        recent: {
          generatedAt: '2026-09-11T02:00:00.000Z',
          slugs: baselineInput.articles.slice(1, 11).map((item) => item.slug),
        },
      }),
      baseline.manifest,
    )
    expect(recent.metrics.renderedByKind['article-html']).toBe(0)
    expect(recent.metrics.renderedByKind.projection).toBe(1)
    expect(recent.metrics.renderedByKind['index-html']).toBe(2)

    const popular = await build(
      store,
      'popular-change',
      fixture({
        articles: baselineInput.articles,
        popular: {
          source: 'privacy-reviewed aggregate',
          window: '7d',
          generatedAt: '2026-09-11T03:00:00.000Z',
          policyApproved: true,
          slugs: baselineInput.articles.slice(5, 15).map((item) => item.slug),
        },
      }),
      baseline.manifest,
    )
    expect(popular.metrics.renderedByKind['article-html']).toBe(0)

    const comment = await build(
      store,
      'comment-change',
      fixture({
        articles: baselineInput.articles,
        comments: {
          'article-0001': [
            {
              id: 'comment-1',
              authorName: 'Reader',
              body: 'Approved comment',
              status: 'approved',
              createdAt: '2026-09-11T04:00:00.000Z',
            },
          ],
        },
      }),
      baseline.manifest,
    )
    expect(comment.metrics.renderedByKind['article-html']).toBe(0)
    expect(comment.metrics.renderedByKind.projection).toBe(1)
  })

  it('intentionally invalidates all article HTML for a semantic template change', async () => {
    const store = new CountingStore()
    const baselineInput = fixture()
    const baseline = await build(store, 'baseline', baselineInput)
    const semantic = await build(
      store,
      'semantic-v2',
      fixture({
        articles: baselineInput.articles,
        semanticVersion: 'semantic-v2',
      }),
      baseline.manifest,
    )
    expect(semantic.metrics.renderedByKind['article-html']).toBe(1_000)
  })

  it('invalidates exactly one article when moderated comments are statically embedded', async () => {
    const store = new CountingStore()
    const articles = createScaleFixture(1_000)
    const baselineInput = fixture({ articles, embedApprovedComments: true })
    const baseline = await build(
      store,
      'baseline-static-comments',
      baselineInput,
    )
    const updated = await build(
      store,
      'one-static-comment',
      fixture({
        articles,
        embedApprovedComments: true,
        comments: {
          'article-0001': [
            {
              id: 'comment-1',
              authorName: 'Reader',
              body: 'A useful comment',
              status: 'approved',
              createdAt: '2026-09-11T05:00:00.000Z',
            },
          ],
        },
      }),
      baseline.manifest,
    )
    expect(updated.metrics.renderedByKind['article-html']).toBe(1)
    expect(updated.metrics.renderedByKind.projection).toBe(1)
  })
})
