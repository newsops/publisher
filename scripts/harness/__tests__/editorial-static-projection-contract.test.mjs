import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderFeedXml } from '../../../packages/publication/src/static-renderers.ts'

const root = resolve(import.meta.dirname, '../../..')

describe('structured editorial static projection contract', () => {
  it('keeps derived figure and source-card HTML in RSS content', () => {
    const feed = renderFeedXml(
      {
        origin: 'https://publication.example',
        publicationName: 'Publication',
      },
      [
        {
          title: 'Article',
          path: '/2026/09/article.html',
          publishedAt: '2026-09-15T00:00:00.000Z',
          description: 'Description',
          bodyHtml:
            '<figure><img src="/media/image.webp" alt="Accessible image"><figcaption>Caption <span>Source: Example</span></figcaption></figure><figure class="publisher-x-post" data-publisher-x-post="true"></figure>',
        },
      ],
    )

    expect(feed).toContain('xmlns:content=')
    expect(feed).toContain('<content:encoded><![CDATA[')
    expect(feed).toContain('alt="Accessible image"')
    expect(feed).toContain('Source: Example')
    expect(feed).toContain('publisher-x-post')
  })

  it('derives publication HTML from snapshot Markdown rather than snapshot HTML', async () => {
    const worker = await readFile(
      resolve(root, 'scripts/deploy/publication-worker-core.ts'),
      'utf8',
    )

    expect(worker).toContain('renderEditorialMarkdown(post.bodyMarkdown)')
    expect(worker).not.toContain('sanitizeBodyHtml(post.bodyHtml)')
  })

  it('derives static site feeds from Markdown instead of an old HTML source field', async () => {
    const generator = await readFile(
      resolve(root, 'scripts/generate-public-metadata.mjs'),
      'utf8',
    )

    expect(generator).toContain('renderEditorialMarkdown(post.bodyMarkdown)')
    expect(generator).not.toContain('cdata(post.bodyHtml)')
  })
})
