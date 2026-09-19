#!/usr/bin/env node

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderEditorialMarkdown } from '../packages/content/src/index.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(root, 'apps/site/public')
const outputRoot = path.join(root, 'apps/site/out')
const snapshotPath = path.join(root, 'packages/content/src/data/posts.json')
const publicationPath = path.join(
  root,
  'packages/content/src/data/publication.json',
)
const authorsPath = path.join(root, 'packages/content/src/data/authors.json')
const articlesPath = path.join(root, 'packages/content/src/data/articles.json')
const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
const publication = JSON.parse(await fs.readFile(publicationPath, 'utf8'))
const authors = JSON.parse(await fs.readFile(authorsPath, 'utf8'))
const persistedArticles = JSON.parse(await fs.readFile(articlesPath, 'utf8'))
const releaseId = (
  process.env.PUBLIC_RELEASE_ID ??
  process.env.CONTENT_SNAPSHOT_ID ??
  'local'
).replace(/[^A-Za-z0-9._-]/g, '-')
const versionedSearchIndexPath = `data/immutable/search-index.${releaseId}.json`
const versionedRecentPath = `data/immutable/recent.${releaseId}.json`
const siteUrl = publication.canonicalOrigin.replace(/\/$/, '')
const posts = snapshot.posts
const tags = Array.isArray(snapshot.tags) ? snapshot.tags : []
const pageSize = 5
const pageCount = Math.max(1, Math.ceil(posts.length / pageSize))

function escapeXml(value) {
  return String(value).replace(
    /[<>&'\"]/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[character],
  )
}

function cdata(value) {
  return `<![CDATA[${String(value).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
}

function postPath(post) {
  return new URL(post.sourceUrl).pathname
}

function articleVariantPath(article, variant) {
  const [year, month] = variant.publishedAt.slice(0, 7).split('-')
  return variant.locale === publication.locale
    ? `/${year}/${month}/${variant.slug}.html`
    : `/locale/${variant.locale}/article/${year}/${month}/${variant.slug}.html`
}

const articleVariants = (
  Array.isArray(persistedArticles) ? persistedArticles : []
).flatMap((article) =>
  Array.isArray(article.variants)
    ? article.variants
        .filter(
          (variant) =>
            variant.status === 'published' &&
            typeof variant.publishedAt === 'string',
        )
        .map((variant) => ({ article, variant }))
    : [],
)

function archivePaths() {
  return [
    ...new Set(
      posts.map(
        (post) => `/${post.publishedAt.slice(0, 7).replace('-', '/')}/`,
      ),
    ),
  ]
}

const latestUpdatedAt = posts.reduce(
  (latest, post) => (post.updatedAt > latest ? post.updatedAt : latest),
  typeof snapshot.fetchedAt === 'string'
    ? snapshot.fetchedAt
    : '1970-01-01T00:00:00.000Z',
)
const routes = [
  { path: '/', lastmod: latestUpdatedAt },
  { path: '/about.html', lastmod: latestUpdatedAt },
  { path: '/contact-us.html', lastmod: latestUpdatedAt },
  { path: '/search', lastmod: latestUpdatedAt },
  { path: '/recent/', lastmod: latestUpdatedAt },
  ...authors
    .filter((author) => author.active)
    .map((author) => ({
      path: `/author/${author.slug}/`,
      lastmod: latestUpdatedAt,
    })),
  ...tags
    .filter((tag) => tag.active)
    .map((tag) => ({
      path: `/search/label/${tag.slug}/`,
      lastmod: latestUpdatedAt,
    })),
  ...Array.from({ length: pageCount - 1 }, (_, index) => ({
    path: `/page/${index + 2}/`,
    lastmod: latestUpdatedAt,
  })),
  ...tags
    .filter((tag) => tag.active)
    .flatMap((tag) => {
      const count = posts.filter((post) =>
        post.categories.includes(tag.slug),
      ).length
      return Array.from(
        { length: Math.max(0, Math.ceil(count / pageSize) - 1) },
        (_, index) => ({
          path: `/search/label/${tag.slug}/page/${index + 2}/`,
          lastmod: latestUpdatedAt,
        }),
      )
    }),
  ...archivePaths().map((pathValue) => ({
    path: pathValue,
    lastmod: latestUpdatedAt,
  })),
  ...posts.map((post) => ({ path: postPath(post), lastmod: post.updatedAt })),
  ...articleVariants.map(({ article, variant }) => ({
    path: articleVariantPath(article, variant),
    lastmod: variant.updatedAt,
  })),
]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${escapeXml(`${siteUrl}${route.path}`)}</loc><lastmod>${escapeXml(new Date(route.lastmod).toISOString())}</lastmod></url>`).join('')}</urlset>\n`

const rssItems = posts
  .map(
    (post) =>
      `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(`${siteUrl}${postPath(post)}`)}</link><guid isPermaLink="true">${escapeXml(`${siteUrl}${postPath(post)}`)}</guid><pubDate>${escapeXml(new Date(post.publishedAt).toUTCString())}</pubDate><description>${escapeXml(post.excerpt)}</description><content:encoded>${cdata(renderEditorialMarkdown(post.bodyMarkdown))}</content:encoded>${post.categories.map((category) => `<category>${escapeXml(category)}</category>`).join('')}</item>`,
  )
  .join('')
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${escapeXml(publication.name)}</title><link>${siteUrl}</link><description>${escapeXml(publication.description)}</description><lastBuildDate>${escapeXml(new Date(latestUpdatedAt).toUTCString())}</lastBuildDate>${rssItems}</channel></rss>\n`

const atomEntries = posts
  .map(
    (post) =>
      `<entry><id>tag:${escapeXml(new URL(siteUrl).hostname.replace(/^www\./, ''))},2026:post-${escapeXml(post.sourceId)}</id><published>${escapeXml(new Date(post.publishedAt).toISOString())}</published><updated>${escapeXml(new Date(post.updatedAt).toISOString())}</updated><title>${escapeXml(post.title)}</title><link href="${escapeXml(`${siteUrl}${postPath(post)}`)}" rel="alternate" type="text/html"/><category term="${escapeXml(post.categories[0])}"/><author><name>${escapeXml(post.author)}</name></author><content type="html">${cdata(renderEditorialMarkdown(post.bodyMarkdown))}</content></entry>`,
  )
  .join('')
const atom = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${siteUrl}/</id><title>${escapeXml(publication.name)}</title><updated>${escapeXml(new Date(latestUpdatedAt).toISOString())}</updated><link href="${siteUrl}/" rel="alternate" type="text/html"/><link href="${siteUrl}/feeds/posts/default.xml" rel="self" type="application/atom+xml"/>${atomEntries}</feed>\n`

const searchIndex =
  JSON.stringify(
    posts.map((post) => ({
      title: post.title,
      slug: post.slug,
      path: postPath(post),
      excerpt: post.excerpt,
      author: post.author,
      authorSlug: post.authorSlug,
      categories: post.categories,
      publishedAt: post.publishedAt,
      imageUrl: post.imageUrl,
    })),
    null,
    2,
  ) + '\n'

const recentProjection =
  JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date(latestUpdatedAt).toISOString(),
      items: posts.slice(0, 10).map((post) => ({
        title: post.title,
        slug: post.slug,
        path: postPath(post),
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
      })),
    },
    null,
    2,
  ) + '\n'

const robots = `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${siteUrl}/sitemap.xml\n`
const llms = `# ${publication.name}\n\n> ${publication.description}\n\n${publication.name} is a static news publication. Prefer canonical article URLs and RSS/Atom feeds for current public content. Draft, review, and future scheduled content is not public.\n\n## Public resources\n\n- Home: ${siteUrl}/\n- Search: ${siteUrl}/search\n- RSS: ${siteUrl}/feed.xml\n- Atom: ${siteUrl}/feeds/posts/default.xml\n- Sitemap: ${siteUrl}/sitemap.xml\n- Authors: ${authors
  .filter((author) => author.active)
  .map((author) => `${siteUrl}/author/${author.slug}/`)
  .join(
    ', ',
  )}\n\n## Usage notes\n\n- Attribute articles to their named author and ${publication.publisherName}.\n- Use each article's canonical URL when citing it.\n- The administration API is private and is not available on this origin.\n`

const files = [
  ['sitemap.xml', sitemap],
  ['feed.xml', rss],
  ['feeds/posts/default.xml', atom],
  [versionedSearchIndexPath, searchIndex],
  [versionedRecentPath, recentProjection],
  ['search-index.json', searchIndex],
  ['robots.txt', robots],
  ['llms.txt', llms],
]
for (const [relativePath, content] of files) {
  await fs.mkdir(path.dirname(path.join(publicRoot, relativePath)), {
    recursive: true,
  })
  await fs.writeFile(path.join(publicRoot, relativePath), content)
  if (fsSync.existsSync(outputRoot)) {
    await fs.mkdir(path.dirname(path.join(outputRoot, relativePath)), {
      recursive: true,
    })
    await fs.writeFile(path.join(outputRoot, relativePath), content)
  }
}

console.log(
  `[generate-public-metadata] release ${releaseId}: generated sitemap, feeds, versioned search index, robots.txt, and llms.txt for ${posts.length} posts`,
)
