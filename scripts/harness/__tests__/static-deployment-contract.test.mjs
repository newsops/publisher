import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPostPath, posts } from '../../../packages/content/src/index.ts'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const output = path.join(root, 'apps/site/out')

function readOutput(file) {
  return fs.readFileSync(path.join(output, file), 'utf8')
}

describe('static deployment contract', () => {
  it('contains only public static routes and no admin/API output', () => {
    expect(fs.existsSync(path.join(output, 'index.html'))).toBe(true)
    expect(fs.existsSync(path.join(output, 'admin'))).toBe(false)
    expect(fs.existsSync(path.join(output, 'api'))).toBe(false)
    expect(fs.existsSync(path.join(output, 'search-index.json'))).toBe(true)
    expect(
      fs.existsSync(path.join(output, 'author/example-editor/index.html')),
    ).toBe(true)
    expect(fs.existsSync(path.join(output, 'llms.txt'))).toBe(true)
    expect(fs.existsSync(path.join(output, 'page/2/index.html'))).toBe(true)
    expect(
      fs.existsSync(
        path.join(output, 'search/label/General/page/2/index.html'),
      ),
    ).toBe(true)
  })

  it('contains one compatible article file for every migrated post', () => {
    for (const post of posts)
      expect(fs.existsSync(path.join(output, getPostPath(post)))).toBe(true)
  })

  it('emits canonical SEO and feed metadata on an article page', () => {
    const html = readOutput('2026/09/sample-report-01.html')
    expect(html).toContain('rel="canonical"')
    expect(html).toContain('property="og:title"')
    expect(html).toContain('name="twitter:card"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('rel="sitemap"')
    expect(html).toContain('type="application/rss+xml"')
    expect(html).toContain('/sitemap.xml')
    expect(html).toContain('/feed.xml')
    expect(html).toContain('/author/example-editor/')
  })

  it('loads presentation synchronously and leaves scripts to data enhancement', () => {
    const html = readOutput('index.html')
    expect(html).toContain('href="/theme-runtime/current.css"')
    expect(html).toContain('src="/site-runtime/projection-bootstrap.v1.js"')
    expect(html).not.toContain('theme-bootstrap.v1.js')
    expect(fs.existsSync(path.join(output, 'theme-runtime/immutable'))).toBe(
      true,
    )
  })

  it("renders the honest editor's picks label without popularity claims", () => {
    const html = readOutput('index.html')
    expect(html).toMatch(/Editor(?:'|&#x27;)s picks/)
    expect(html).not.toContain('Most read')
    expect(html).not.toContain('analytics')
  })

  it('emits crawlable pagination controls and a mobile continuation manifest', () => {
    const html = readOutput('page/2/index.html')
    expect(html).toContain('aria-label="Page navigation"')
    expect(html).toContain('href="/"')
    expect(html).toContain('data-progressive-feed')
    const searchIndex = JSON.parse(readOutput('search-index.json'))
    expect(searchIndex).toHaveLength(posts.length)
    expect(searchIndex[0]).not.toHaveProperty('imageUrl')
    expect(searchIndex[0]).toHaveProperty('authorSlug', 'example-editor')
  })

  it('keeps immutable assets separate from revalidated stable routes', () => {
    const headers = fs.readFileSync(
      path.join(root, 'apps/site/public/_headers'),
      'utf8',
    )
    expect(headers).toContain('/theme-runtime/immutable/*')
    expect(headers).toContain('/data/immutable/*')
    expect(headers).toContain('/theme-runtime/current.css')
    expect(headers).toContain('max-age=0, must-revalidate')
    expect(headers).not.toContain('/theme-runtime/*')
    expect(headers).not.toContain('/data/*\n')
    expect(headers).not.toContain('/*.html')
  })
})
