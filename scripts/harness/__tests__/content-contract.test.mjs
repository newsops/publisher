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
  importPreReleaseHtmlToMarkdown,
  parseEditorialMarkdown,
  renderEditorialMarkdown,
  serializeEditorialMarkdown,
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
        bodyMarkdown: 'Body',
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
      bodyMarkdown: 'x',
      author: 'x',
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
    })
    expect(invalid.ok).toBe(false)
    const valid = validatePostInput({
      slug: 'stable-post',
      title: 'x',
      excerpt: 'x',
      bodyMarkdown: 'x',
      author: 'x',
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
    })
    expect(valid.ok).toBe(true)
    expect(valid.value?.sourceUrl).toContain('/stable-post.html')
  })

  it('keeps the normal editorial SEO title limit strict', () => {
    const invalid = validatePostInput({
      slug: 'long-seo-title',
      title: 'Article',
      excerpt: 'Excerpt',
      bodyMarkdown: 'Body',
      author: 'Author',
      seoTitle: 'S'.repeat(71),
      publishedAt: '2024-11-27T00:33:00.000Z',
      categories: ['General'],
    })
    expect(invalid).toMatchObject({
      ok: false,
      errors: ['seoTitle must be 70 characters or fewer'],
    })
  })

  it('keeps public cache policy and private admin contracts in the repository', () => {
    expect(
      fs.readFileSync(path.join(root, 'apps/site/public/_headers'), 'utf8'),
    ).toContain('immutable')
    expect(
      fs.readFileSync(path.join(root, 'apps/admin/app/lib/auth.ts'), 'utf8'),
    ).toContain('account_sessions')
  })

  it('validates editorial pick ranks and resolves only registered themes', () => {
    expect(
      validateFeaturedRanks([{ featuredRank: 1 }, { featuredRank: 1 }]),
    ).toEqual(['featuredRank 1 must be unique'])
    const invalid = validatePostInput({
      slug: 'ranked-post',
      title: 'x',
      excerpt: 'x',
      bodyMarkdown: 'x',
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

  it('renders credited figures and static X embeds from non-executable Markdown', () => {
    const markdown = `> A quoted source.\n\n:::figure{src="https://images.example.test/briefing.webp" alt="Product briefing" creditName="Example" creditUrl="https://example.test/source"}\nOfficial product image.\n:::\n\n:::embed{provider="x" url="https://x.com/example/status/123" quote="A source statement." authorName="Example"}\n:::`
    const document = parseEditorialMarkdown(markdown)
    expect(document.figures).toHaveLength(1)
    expect(document.embeds).toHaveLength(1)
    expect(document.nodes.map((node) => node.type)).toEqual([
      'blockquote',
      'figure',
      'embed',
    ])
    expect(serializeEditorialMarkdown(document)).toBe(document.markdown)
    const html = renderEditorialMarkdown(markdown)
    expect(html).toContain('<figure>')
    expect(html).toContain('Source:')
    expect(html).toContain('publisher-x-post')
    expect(() => renderEditorialMarkdown('<script>alert(1)</script>')).toThrow(
      'raw HTML',
    )
    expect(() =>
      renderEditorialMarkdown(
        ':::figure{src="http://bad.test/a.png" alt=""}\n:::',
      ),
    ).toThrow('figure alt is required')
    expect(() => renderEditorialMarkdown('[bad](javascript:alert(1))')).toThrow(
      'link URLs must be relative paths or HTTPS URLs',
    )
    expect(() =>
      renderEditorialMarkdown('![unattributed](https://example.test/a.webp)'),
    ).toThrow('attributed figure directive')
    expect(() =>
      renderEditorialMarkdown(
        '> :::figure{src="/media/briefing.webp" alt="Nested"}\n> :::',
      ),
    ).toThrow('directives must be top-level editorial blocks')
  })

  it('performs a one-time pre-release HTML figure conversion or stops with a named migration error', () => {
    const migrated = importPreReleaseHtmlToMarkdown(
      '<h2>Heading</h2><figure><img src="/media/briefing.webp" alt="Product briefing"><figcaption>Official image.</figcaption></figure><p>Body.</p>',
    )
    const document = parseEditorialMarkdown(migrated)
    expect(document.figures).toEqual([
      {
        src: '/media/briefing.webp',
        alt: 'Product briefing',
        caption: 'Official image.',
        credit: undefined,
      },
    ])
    expect(() =>
      importPreReleaseHtmlToMarkdown(
        '<figure><img src="/media/briefing.webp"></figure>',
      ),
    ).toThrow('pre-release figure requires image src and alternative text')
    expect(() =>
      importPreReleaseHtmlToMarkdown('<iframe src="https://bad.test">'),
    ).toThrow('pre-release HTML contains unsupported executable markup')
  })
})
