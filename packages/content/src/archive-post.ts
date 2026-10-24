import type { ArchivePostEntry, EditorialArchive } from './archive'
import { renderEditorialMarkdown } from './editorial-markdown'
import { importHtmlBodyToMarkdown } from './html-body-import'
import {
  array,
  bodyMediaAssets,
  fail,
  record,
  relativeAsset,
  safeText,
  string,
} from './archive-values'

interface PostReferences {
  readonly canonicalOrigin: string
  readonly mediaPaths: ReadonlySet<string>
  readonly authorSlugs: ReadonlySet<string>
  readonly tagSlugs: ReadonlySet<string>
}

function draftStatus(value: unknown, label: string): 'draft' {
  if (value !== undefined && value !== 'draft')
    fail(
      `${label}: draft import requires status "draft"; choose draft before importing`,
    )
  return 'draft'
}

function sourceUrl(
  value: unknown,
  label: string,
  origin: string,
): string | undefined {
  if (value === undefined) return undefined
  const url = string(value, label)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    fail(`${label} must be a URL`)
  }
  if (parsed.origin !== origin) fail(`${label} must use the publication origin`)
  return url
}

function body(
  post: Record<string, unknown>,
  label: string,
  mediaPaths: ReadonlySet<string>,
) {
  const bodyMarkdown =
    typeof post.bodyMarkdown === 'string'
      ? safeText(post.bodyMarkdown, `${label}.bodyMarkdown`)
      : importHtmlBodyToMarkdown(safeText(post.bodyHtml, `${label}.bodyHtml`))
  const bodyHtml = renderEditorialMarkdown(bodyMarkdown)
  const assets = bodyMediaAssets(
    post.bodyMediaAssets,
    bodyHtml,
    mediaPaths,
    `${label}.bodyMediaAssets`,
  )
  return {
    bodyMarkdown,
    bodyHtml,
    ...(assets ? { bodyMediaAssets: assets } : {}),
  }
}

function references(
  post: Record<string, unknown>,
  label: string,
  allowed: PostReferences,
) {
  const categories = array(post.categories, `${label}.categories`).map(
    (category, index) => string(category, `${label}.categories[${index}]`),
  )
  if (categories.some((category) => !allowed.tagSlugs.has(category)))
    fail(`${label}.categories reference an unknown tag`)
  const authorSlug = string(post.authorSlug, `${label}.authorSlug`)
  if (!allowed.authorSlugs.has(authorSlug))
    fail(`${label}.authorSlug references an unknown author`)
  const imageAsset =
    post.imageAsset === undefined
      ? undefined
      : relativeAsset(post.imageAsset, `${label}.imageAsset`)
  if (imageAsset && !allowed.mediaPaths.has(imageAsset))
    fail(`${label}.imageAsset references unknown media`)
  const url = sourceUrl(
    post.sourceUrl,
    `${label}.sourceUrl`,
    allowed.canonicalOrigin,
  )
  return {
    categories,
    authorSlug,
    ...(imageAsset ? { imageAsset } : {}),
    ...(url ? { sourceUrl: url } : {}),
  }
}

function parsePost(
  value: unknown,
  index: number,
  allowed: PostReferences,
): ArchivePostEntry {
  const label = `posts[${index}]`
  const post = record(value, label)
  const status = draftStatus(post.status, `${label}.status`)
  return {
    sourceId: string(post.sourceId, `${label}.sourceId`),
    slug: string(post.slug, `${label}.slug`),
    title: safeText(post.title, `${label}.title`),
    excerpt: safeText(post.excerpt, `${label}.excerpt`),
    ...body(post, label, allowed.mediaPaths),
    author: safeText(post.author, `${label}.author`),
    ...references(post, label, allowed),
    seoTitle: safeText(post.seoTitle, `${label}.seoTitle`),
    seoDescription: safeText(post.seoDescription, `${label}.seoDescription`),
    publishedAt: string(post.publishedAt, `${label}.publishedAt`),
    status,
    featured: post.featured === true,
    ...(typeof post.featuredRank === 'number'
      ? { featuredRank: post.featuredRank }
      : {}),
  }
}

export function parseArchivePosts(
  value: unknown,
  archive: Omit<EditorialArchive, 'posts'>,
): readonly ArchivePostEntry[] {
  const allowed: PostReferences = {
    canonicalOrigin: archive.settings.canonicalOrigin,
    mediaPaths: new Set(archive.media.map((entry) => entry.assetPath)),
    authorSlugs: new Set(archive.authors.map((author) => author.slug)),
    tagSlugs: new Set(archive.tags.map((tag) => tag.slug)),
  }
  return array(value, 'posts').map((post, index) =>
    parsePost(post, index, allowed),
  )
}
