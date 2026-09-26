import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EditorialMigrationError,
  importHtmlBodyToMarkdown,
  parseEditorialMarkdown,
  renderEditorialMarkdown,
  resolveEditorialBody,
  withCanonicalBody,
  deskFixtureApproval,
} from '../../../packages/content/src/index.ts'
import { publicationInputs } from '../../../scripts/deploy/publication-worker-core.ts'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'

const BLOGGER_BODY =
  'Apple is set to release visionOS 2.2 in December, bringing <b>significant</b> enhancements:<br /><br />' +
  '<a href="/media/7790ef.webp"><img alt="Vision Pro" border="0" src="/media/7790ef.webp" width="640" /></a><br /><br />' +
  '<div class="separator" style="clear: both;"><span style="font-family: arial;">Wide &amp; Ultrawide: choose 1 &lt; 2 options.</span></div>' +
  '<ul><li>One <a href="https://example.com/a?b=c">link</a></li><li>Two<ul><li>Nested</li></ul></li></ul>' +
  '<blockquote>A quoted <i>source</i>.<br />Second line.</blockquote>' +
  '<h3>Heading # here</h3><p>* not a list</p>' +
  '<iframe src="https://www.youtube.com/embed/abc" width="560"></iframe>' +
  '<script>alert(1)</script><style>p{}</style><!-- comment -->' +
  '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>' +
  '<pre><code>const x = 1;\n</code></pre><hr /><p>End.</p>'

function snapshot(posts) {
  return {
    schemaVersion: 4,
    siteId: 'default',
    snapshotId: 'snapshot-imported',
    generatedAt: '2026-09-19T00:00:00.000Z',
    settings: {
      name: 'Fixture',
      shortName: 'Fixture',
      description: 'Fixture publication',
      canonicalOrigin: 'https://fixture.example',
      language: 'en',
      locale: 'en-US',
      publisherName: 'Fixture',
      themeId: 'editorial',
    },
    authors: [{ slug: 'desk', name: 'Desk', bio: 'Desk', active: true }],
    tags: [{ slug: 'General', name: 'General', active: true }],
    posts,
    articles: [],
    plugins: { schemaVersion: 1, installations: [] },
    media: [],
  }
}

function post(overrides) {
  return {
    sourceId: 'imported-1',
    sourceUrl: 'https://fixture.example/2026/09/imported.html',
    slug: 'imported',
    title: 'Imported',
    excerpt: 'Imported excerpt',
    author: 'Desk',
    authorSlug: 'desk',
    seoTitle: 'Imported',
    seoDescription: 'Imported excerpt',
    publishedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    categories: ['General'],
    tags: [],
    featured: false,
    ...overrides,
  }
}

describe('HTML body import contract', () => {
  it('imports common CMS export HTML into canonical Markdown without losing text', () => {
    const markdown = importHtmlBodyToMarkdown(BLOGGER_BODY)
    const document = parseEditorialMarkdown(markdown)
    expect(document.figures).toEqual([
      {
        src: '/media/7790ef.webp',
        alt: 'Vision Pro',
        caption: undefined,
        credit: undefined,
      },
    ])
    expect(document.nodes.map((node) => node.type)).toEqual([
      'paragraph',
      'figure',
      'paragraph',
      'list',
      'blockquote',
      'heading',
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
      'code',
      'thematicBreak',
      'paragraph',
    ])
    const html = renderEditorialMarkdown(markdown)
    expect(html).toContain('<strong>significant</strong>')
    expect(html).toContain('Wide &amp; Ultrawide: choose 1 &lt; 2 options.')
    expect(html).toContain('<a href="https://example.com/a?b=c">link</a>')
    expect(html).toContain('<li>Nested</li>')
    expect(html).toContain('<em>source</em>')
    expect(html).toContain('<h3>Heading # here</h3>')
    expect(html).toContain('<p>* not a list</p>')
    expect(html).toContain(
      '<a href="https://www.youtube.com/embed/abc">Embedded content</a>',
    )
    expect(html).toContain('<code>const x = 1;')
    expect(html).toContain('<hr />')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('p{}')
    expect(html).not.toContain('<iframe')
  })

  it('converts published and third-party X post markup into embed directives', () => {
    const markdown = importHtmlBodyToMarkdown(
      '<p>Intro.</p>' +
        '<figure class="publisher-x-post" data-publisher-x-post="true"><blockquote><p>Demand is "really" unprecedented.</p></blockquote><figcaption><a href="https://x.com/examplesource/status/1234567890123456789">Example Source on X</a></figcaption></figure>' +
        '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello world</p>&mdash; Jane Doe (@jane) <a href="https://twitter.com/jane/status/1234567890">September 9, 2026</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>',
    )
    expect(parseEditorialMarkdown(markdown).embeds).toEqual([
      {
        provider: 'x',
        url: 'https://x.com/examplesource/status/1234567890123456789',
        quote: 'Demand is "really" unprecedented.',
        authorName: 'Example Source',
      },
      {
        provider: 'x',
        url: 'https://twitter.com/jane/status/1234567890',
        quote: 'Hello world',
        authorName: 'Jane Doe',
      },
    ])
    expect(renderEditorialMarkdown(markdown)).not.toContain(
      'platform.twitter.com',
    )
  })

  it('keeps figure captions and derives alternative text from a caption when the image has none', () => {
    const captioned = parseEditorialMarkdown(
      importHtmlBodyToMarkdown(
        '<h2>Heading</h2><figure><img src="/media/briefing.webp" alt="Product briefing"><figcaption>Official image.</figcaption></figure><p>Body.</p>',
      ),
    )
    expect(captioned.figures).toEqual([
      {
        src: '/media/briefing.webp',
        alt: 'Product briefing',
        caption: 'Official image.',
        credit: undefined,
      },
    ])
    const fromCaption = parseEditorialMarkdown(
      importHtmlBodyToMarkdown(
        '<figure><img src="/media/briefing.webp"><figcaption>Only a caption</figcaption></figure>',
      ),
    )
    expect(fromCaption.figures[0].alt).toBe('Only a caption')
  })

  it('stops with a named migration error instead of silently losing content', () => {
    for (const [html, message] of [
      ['<figure><img src="/media/briefing.webp"></figure>', 'alternative text'],
      [
        '<img src="http://insecure.example/image.png" alt="Image">',
        'HTTPS src',
      ],
      ['<div><span></span></div>', 'no editorial content'],
      ['   ', 'HTML body is empty'],
    ]) {
      expect(() => importHtmlBodyToMarkdown(html)).toThrow(
        EditorialMigrationError,
      )
      expect(() => importHtmlBodyToMarkdown(html)).toThrow(message)
    }
  })

  it('resolves any stored body shape to canonical Markdown plus rendered HTML', () => {
    const fromMarkdown = resolveEditorialBody({
      bodyMarkdown: 'Canonical *text*.',
      bodyHtml: '<p>stale copy</p>',
    })
    expect(fromMarkdown.bodyHtml).toBe('<p>Canonical <em>text</em>.</p>')
    const fromHtml = resolveEditorialBody({
      bodyHtml: '<p>Imported <b>text</b>.</p>',
    })
    expect(fromHtml.bodyMarkdown).toBe('Imported **text**.')
    expect(fromHtml.bodyHtml).toBe('<p>Imported <strong>text</strong>.</p>')
    expect(() =>
      resolveEditorialBody({}, 'posts.example.bodyMarkdown'),
    ).toThrow('posts.example.bodyMarkdown is required')
    const lenient = withCanonicalBody(
      { slug: 'broken', bodyHtml: '<img src="/media/x.webp">' },
      'broken',
      { onImportError: 'lenient' },
    )
    expect(lenient.bodyMarkdown).toBe('')
    expect(() =>
      withCanonicalBody({
        slug: 'broken',
        bodyHtml: '<img src="/media/x.webp">',
      }),
    ).toThrow(EditorialMigrationError)
  })

  it('publishes a snapshot whose posts predate the Markdown contract', async () => {
    const inputs = await publicationInputs(
      snapshot([
        post({ bodyHtml: BLOGGER_BODY }),
        post({
          sourceId: 'canonical-1',
          slug: 'canonical',
          bodyMarkdown: 'Canonical body.',
          bodyHtml: '<p>ignored stale html</p>',
        }),
      ]),
      { get: async () => new Uint8Array() },
    )
    const imported = inputs.articles.find(
      (article) => article.slug === 'imported',
    )
    const canonical = inputs.articles.find(
      (article) => article.slug === 'canonical',
    )
    expect(imported.bodyHtml).toContain('<strong>significant</strong>')
    expect(imported.bodyHtml).toContain('alt="Vision Pro"')
    expect(imported.bodyHtml).not.toContain('alert(1)')
    expect(canonical.bodyHtml).toBe('<p>Canonical body.</p>')
    // A nameless image takes the post title, matching the hero-image rule.
    const titled = await publicationInputs(
      snapshot([post({ bodyHtml: '<img src="/media/x.webp">' })]),
      { get: async () => new Uint8Array() },
    )
    expect(titled.articles[0].bodyHtml).toContain('alt="Imported"')
    await expect(
      publicationInputs(
        snapshot([
          post({ bodyHtml: '<img src="http://insecure.example/x.png">' }),
        ]),
        { get: async () => new Uint8Array() },
      ),
    ).rejects.toThrow('posts.imported.bodyMarkdown')
  })

  it('upgrades pre-release admin content on load and reports unpublishable posts by slug', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-imported-'),
    )
    try {
      const repository = new FileContentRepository(directory)
      const seeded = await repository.list()
      const imported = {
        ...seeded[0],
        bodyHtml: '<p>Imported <b>text</b>.</p>',
      }
      delete imported.bodyMarkdown
      const broken = {
        ...seeded[1],
        bodyHtml: '<img src="http://insecure.example/x.png">',
      }
      delete broken.bodyMarkdown
      const state = JSON.parse(
        JSON.stringify({
          siteId: 'default',
          posts: [imported, broken],
          tags: await repository.listTags(),
          categories: await repository.listCategories(),
          settings: await repository.getSettings(),
          authors: await repository.listAuthors(),
          snapshots: [],
        }),
      )
      await mkdir(directory, { recursive: true })
      await writeFile(
        path.join(directory, 'content.json'),
        JSON.stringify(state),
        'utf8',
      )
      const loaded = await repository.list()
      const upgraded = loaded.find((item) => item.id === imported.id)
      const unresolved = loaded.find((item) => item.id === broken.id)
      expect(upgraded.bodyMarkdown).toBe('Imported **text**.')
      expect(upgraded.bodyHtml).toBe('<p>Imported <strong>text</strong>.</p>')
      expect(unresolved.bodyMarkdown).toBe('')
      // Imported content has no desk approval for its converted body, so the
      // gate (EDIT-001) returns both posts to review instead of publishing.
      expect(upgraded.status).toBe('review')
      expect(unresolved.status).toBe('review')
      expect((await repository.publish()).snapshot.posts).toHaveLength(0)
      // Even a desk approval cannot carry an unresolved body to readers.
      const approved = await repository.reviewPost(
        unresolved.id,
        deskFixtureApproval(unresolved),
      )
      await expect(
        repository.save(approved.id, { ...approved, status: 'published' }),
      ).rejects.toThrow('bodyMarkdown is required')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
