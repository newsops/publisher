import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sanitizeBodyHtml,
  validateFeaturedRanks,
  validatePostInput,
} from '../../../packages/content/src/editor.ts'
import {
  articleFromPost,
  isValidLocale,
  validateArticleLocales,
} from '../../../packages/content/src/article-adapter.ts'
import {
  getArticleVariantPath,
  getTheme,
  themes,
} from '../../../packages/content/src/index.ts'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('content safety contract', () => {
  it('supports independent canonical locales and rejects duplicates', () => {
    expect(isValidLocale('en-US')).toBe(true)
    expect(isValidLocale('not a locale')).toBe(false)
    expect(
      validateArticleLocales([{ locale: 'en-US' }, { locale: 'en-US' }]),
    ).toEqual(['locale en-US must be unique'])
    const article = articleFromPost(
      {
        sourceId: 'source-1',
        sourceUrl: 'https://example.com/2024/01/article.html',
        slug: 'article',
        title: 'Article',
        excerpt: 'Excerpt',
        bodyHtml: '<p>Body</p>',
        author: 'Author',
        authorSlug: 'author',
        seoTitle: 'Article',
        seoDescription: 'Excerpt',
        publishedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        categories: ['General'],
        imageUrl: undefined,
        featured: false,
        featuredRank: undefined,
      },
      'en-US',
    )
    expect(article.variants).toHaveLength(1)
    expect(article.variants[0].locale).toBe('en-US')
    expect(
      validateArticleLocales([...article.variants, { locale: 'ko-KR' }]),
    ).toEqual([])
    const korean = {
      ...article.variants[0],
      locale: 'ko-KR',
      slug: 'korean-article',
    }
    expect(getArticleVariantPath(article, korean)).toBe(
      '/locale/ko-KR/article/2024/01/korean-article.html',
    )
    const localizedRoute = fs.readFileSync(
      path.join(
        root,
        'apps/site/app/locale/[locale]/article/[year]/[month]/[slug]/page.tsx',
      ),
      'utf8',
    )
    const articleRenderer = fs.readFileSync(
      path.join(root, 'apps/site/app/components/StaticArticlePage.tsx'),
      'utf8',
    )
    expect(localizedRoute).toContain('language: variant.locale')
    expect(articleRenderer).toContain('lang={article.language}')
    expect(localizedRoute).toContain('alternates')
  })

  it('removes executable HTML from editor input', () => {
    const sanitized = sanitizeBodyHtml(
      '<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">link</a><a href="&#106;avascript:alert(3)">encoded</a><svg><a href="javascript:alert(4)">svg</a></svg>',
    )
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('<svg')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).toContain('<p>Hello</p>')
  })

  it('rejects unstable slugs and accepts a canonical post', () => {
    const invalid = validatePostInput({
      slug: 'Not Stable',
      title: 'x',
      excerpt: 'x',
      bodyHtml: '<p>x</p>',
      author: 'x',
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
    })
    expect(invalid.ok).toBe(false)
    const valid = validatePostInput({
      slug: 'stable-post',
      title: 'x',
      excerpt: 'x',
      bodyHtml: '<p>x</p>',
      author: 'x',
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
    })
    expect(valid.ok).toBe(true)
    expect(valid.value?.sourceUrl).toContain('/stable-post.html')
  })

  it('keeps public cache policy and private admin contracts in the repository', () => {
    expect(
      fs.readFileSync(path.join(root, 'apps/site/public/_headers'), 'utf8'),
    ).toContain('immutable')
    expect(
      fs.readFileSync(path.join(root, 'apps/admin/app/lib/auth.ts'), 'utf8'),
    ).toContain('jwtVerify')
  })

  it('validates editorial pick ranks and resolves only registered themes', () => {
    expect(
      validateFeaturedRanks([{ featuredRank: 1 }, { featuredRank: 1 }]),
    ).toEqual(['featuredRank 1 must be unique'])
    const invalid = validatePostInput({
      slug: 'ranked-post',
      title: 'x',
      excerpt: 'x',
      bodyHtml: '<p>x</p>',
      author: 'x',
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
      featuredRank: 0,
    })
    expect(invalid.ok).toBe(false)
    expect(getTheme('signal').id).toBe('signal')
    expect(getTheme('missing').id).toBe('editorial')
  })

  it('keeps registered theme accents readable and keyboard-focusable', () => {
    const channel = (value) => {
      const normalized = Number.parseInt(value, 16) / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    const luminance = (hex) => {
      const value = hex.slice(1)
      const rgb = [0, 2, 4].map((index) =>
        channel(value.slice(index, index + 2)),
      )
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    }
    for (const theme of Object.values(themes)) {
      const colors = theme.css.match(
        /--paper:\s*(#[0-9a-f]{6}).*--accent:\s*(#[0-9a-f]{6})/s,
      )
      expect(colors).not.toBeNull()
      const ratio =
        (Math.max(luminance(colors[1]), luminance(colors[2])) + 0.05) /
        (Math.min(luminance(colors[1]), luminance(colors[2])) + 0.05)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      fs.readFileSync(path.join(root, 'apps/site/app/styles.css'), 'utf8'),
    ).toContain(':focus-visible')
  })
})
