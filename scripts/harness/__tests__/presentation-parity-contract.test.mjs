import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { themeIds } from '../../../packages/content/src/index.ts'
import {
  PRESENTATION_MARKERS,
  createScaleFixture,
  getTheme,
  themes,
} from '../../../packages/publication/src/index.ts'
import {
  renderArticleHtml,
  renderProjectionPage,
} from '../../../packages/publication/src/static-renderers.ts'

/**
 * ARCH-004: the publication renderer is the canonical public HTML and the
 * checked-in `apps/site` export is its preview. Both must carry the same
 * semantic markers, every theme must style them, and the theme registry
 * must match the content contract's theme ids.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const siteOut = (relative) =>
  readFileSync(path.join(root, 'apps/site/out', relative), 'utf8')

function inputs() {
  const articles = createScaleFixture(6)
  return {
    siteId: 'default',
    origin: 'https://publication.example',
    publicationName: 'Fixture News',
    language: 'en',
    semanticVersion: 'semantic-v3',
    runtimeVersion: 'runtime-v1',
    baselineVersion: 'baseline-v3',
    articles,
    recent: {
      generatedAt: '2026-09-19T00:00:00.000Z',
      slugs: articles.map((article) => article.slug),
    },
    theme: getTheme('editorial'),
  }
}

const has = (html, marker) =>
  new RegExp(`class="[^"]*\\b${marker}\\b`).test(html)

describe('presentation parity contract (ARCH-004)', () => {
  it('renders every article marker from both renderers', () => {
    const values = inputs()
    const publication = renderArticleHtml(
      values,
      values.articles[0],
      [],
      '/theme-runtime/baseline.css',
    )
    const preview = siteOut('2026/09/sample-report-01.html')
    for (const marker of [
      ...PRESENTATION_MARKERS.chrome,
      ...PRESENTATION_MARKERS.article,
    ]) {
      expect(has(publication, marker), `publication article: ${marker}`).toBe(
        true,
      )
      expect(has(preview, marker), `apps/site article: ${marker}`).toBe(true)
    }
  })

  it('renders every index marker from both renderers', () => {
    const values = inputs()
    const publication = renderProjectionPage(
      values,
      values.publicationName,
      '/',
      values.recent.slugs,
      new Map(values.articles.map((article) => [article.slug, article])),
      '/theme-runtime/baseline.css',
    )
    const preview = siteOut('index.html')
    for (const marker of [
      ...PRESENTATION_MARKERS.chrome,
      ...PRESENTATION_MARKERS.index,
    ]) {
      expect(has(publication, marker), `publication index: ${marker}`).toBe(
        true,
      )
      expect(has(preview, marker), `apps/site index: ${marker}`).toBe(true)
    }
  })

  it('styles every marker in every registered theme', () => {
    const markers = [
      ...PRESENTATION_MARKERS.chrome,
      ...PRESENTATION_MARKERS.article,
      ...PRESENTATION_MARKERS.index,
    ]
    for (const theme of Object.values(themes))
      for (const marker of markers)
        expect(
          theme.css.includes(`.${marker}`),
          `${theme.id}: .${marker}`,
        ).toBe(true)
  })

  it('keeps the theme registry equal to the content contract ids', () => {
    expect(Object.keys(themes).sort()).toEqual([...themeIds].sort())
    expect(getTheme('missing').id).toBe('editorial')
  })
})
