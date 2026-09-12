import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('static progressive feed contract', () => {
  it('renders the complete supplied feed without client-side data fetching', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/site/app/components/ProgressivePostFeed.tsx'),
      'utf8',
    )
    expect(source).not.toContain("'use client'")
    expect(source).toContain('NEXT_PUBLIC_SEARCH_INDEX_URL')
    expect(source).not.toContain('fetch(')
    expect(source).toContain('data-search-index-url={SEARCH_INDEX_URL}')
    expect(source).not.toContain('IntersectionObserver')
    expect(source).toContain('initialPosts.map')
    expect(source).toContain('loading="lazy"')
  })

  it('uses one page-size helper for home and tag routes', () => {
    const helper = fs.readFileSync(
      path.join(root, 'apps/site/app/components/PostIndexPage.tsx'),
      'utf8',
    )
    expect(helper).toContain('INDEX_PAGE_SIZE')
    expect(
      fs.existsSync(path.join(root, 'apps/site/app/page/[page]/page.tsx')),
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          root,
          'apps/site/app/search/label/[label]/page/[page]/page.tsx',
        ),
      ),
    ).toBe(true)
  })
})
