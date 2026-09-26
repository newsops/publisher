import {
  ContentValidationError,
  type ContentStatus,
  type PostDraftInput,
} from './editor'
import type { PublicationSettings } from './types'
import { renderEditorialMarkdown } from './editorial-markdown'
import { importHtmlBodyToMarkdown } from './html-body-import'

export interface ArchiveMediaEntry {
  readonly assetPath: string
  readonly sha256: string
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'
  readonly byteSize: number
}

export interface ArchiveAuthorEntry {
  readonly slug: string
  readonly name: string
  readonly bio: string
  readonly avatarAsset?: string
}

export interface ArchiveTagEntry {
  readonly slug: string
  readonly name: string
}

export interface ArchivePostEntry extends Omit<PostDraftInput, 'sourceId'> {
  readonly sourceId: string
  readonly imageAsset?: string
  /** Exact body `/media/...` reference to declared archive media asset. */
  readonly bodyMediaAssets?: Readonly<Record<string, string>>
}

export interface EditorialArchive {
  readonly schemaVersion: 1
  readonly settings: PublicationSettings
  readonly authors: readonly ArchiveAuthorEntry[]
  readonly tags: readonly ArchiveTagEntry[]
  readonly posts: readonly ArchivePostEntry[]
  readonly media: readonly ArchiveMediaEntry[]
}

function fail(message: string): never {
  throw new ContentValidationError(`Invalid archive: ${message}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be text`)
  return value.trim()
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  return value
}

function relativeAsset(value: unknown, label: string): string {
  const assetPath = string(value, label)
  if (
    assetPath.startsWith('/') ||
    assetPath.includes('\\') ||
    assetPath
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  )
    fail(`${label} must be a relative non-traversing path`)
  return assetPath
}

function bodyMediaReferences(bodyHtml: string): readonly string[] {
  const references = new Set<string>()
  for (const match of bodyHtml.matchAll(
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  )) {
    const reference = match[1]
    if (reference.startsWith('/media/')) references.add(reference)
  }
  return [...references]
}

function bodyMediaAssets(
  value: unknown,
  bodyHtml: string,
  mediaPaths: ReadonlySet<string>,
  label: string,
): Readonly<Record<string, string>> | undefined {
  const references = bodyMediaReferences(bodyHtml)
  if (value === undefined) {
    if (references.length > 0)
      fail(`${label} is required for body media references`)
    return undefined
  }
  const bindings = record(value, label)
  const normalized: Record<string, string> = {}
  for (const [reference, asset] of Object.entries(bindings)) {
    if (
      !reference.startsWith('/media/') ||
      reference.startsWith('//') ||
      reference.includes('\\') ||
      reference.includes('?') ||
      reference.includes('#') ||
      reference
        .slice(1)
        .split('/')
        .some((segment) => !segment || segment === '.' || segment === '..')
    )
      fail(`${label} key must be a root-relative media path`)
    if (!references.includes(reference))
      fail(`${label} key must occur in bodyHtml`)
    const assetPath = relativeAsset(asset, `${label}.${reference}`)
    if (!mediaPaths.has(assetPath))
      fail(`${label}.${reference} references unknown media`)
    normalized[reference] = assetPath
  }
  for (const reference of references) {
    if (!Object.hasOwn(normalized, reference))
      fail(`${label} must bind every body media reference`)
  }
  return normalized
}

function safeHttpsOrigin(value: unknown): string {
  const origin = string(value, 'settings.canonicalOrigin')
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    fail('settings.canonicalOrigin must be a URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    fail('settings.canonicalOrigin must be a credential-free HTTPS origin')
  return parsed.origin
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`)
}

function safeText(value: unknown, label: string): string {
  const result = string(value, label)
  if (
    /fixture-secret-sentinel|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(result)
  )
    fail(`${label} contains a secret sentinel`)
  return result
}

function parseSettings(value: unknown): PublicationSettings {
  const source = record(value, 'settings')
  return {
    name: safeText(source.name, 'settings.name'),
    shortName: safeText(source.shortName, 'settings.shortName'),
    description: safeText(source.description, 'settings.description'),
    canonicalOrigin: safeHttpsOrigin(source.canonicalOrigin),
    language: string(source.language, 'settings.language'),
    locale: string(source.locale, 'settings.locale'),
    publisherName: safeText(source.publisherName, 'settings.publisherName'),
    themeId: string(source.themeId, 'settings.themeId'),
  }
}

export function validateEditorialArchive(value: unknown): EditorialArchive {
  const source = record(value, 'archive')
  if (source.schemaVersion !== 1) fail('schemaVersion must be 1')
  const settings = parseSettings(source.settings)
  const authors = array(source.authors, 'authors').map((item, index) => {
    const author = record(item, `authors[${index}]`)
    return {
      slug: string(author.slug, `authors[${index}].slug`),
      name: safeText(author.name, `authors[${index}].name`),
      bio: safeText(author.bio, `authors[${index}].bio`),
      ...(author.avatarAsset === undefined
        ? {}
        : {
            avatarAsset: relativeAsset(
              author.avatarAsset,
              `authors[${index}].avatarAsset`,
            ),
          }),
    }
  })
  if (authors.length === 0) fail('authors must not be empty')
  unique(
    authors.map((author) => author.slug),
    'author slugs',
  )

  const tags = array(source.tags, 'tags').map((item, index) => {
    const tag = record(item, `tags[${index}]`)
    return {
      slug: string(tag.slug, `tags[${index}].slug`),
      name: safeText(tag.name, `tags[${index}].name`),
    }
  })
  unique(
    tags.map((tag) => tag.slug),
    'tag slugs',
  )

  const media = array(source.media, 'media').map((item, index) => {
    const entry = record(item, `media[${index}]`)
    const mimeType = string(entry.mimeType, `media[${index}].mimeType`)
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(
        mimeType,
      )
    )
      fail(`media[${index}].mimeType is unsupported`)
    const sha256 = string(entry.sha256, `media[${index}].sha256`).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(sha256))
      fail(`media[${index}].sha256 is invalid`)
    if (!Number.isSafeInteger(entry.byteSize) || (entry.byteSize as number) < 1)
      fail(`media[${index}].byteSize is invalid`)
    return {
      assetPath: relativeAsset(entry.assetPath, `media[${index}].assetPath`),
      sha256,
      mimeType: mimeType as ArchiveMediaEntry['mimeType'],
      byteSize: entry.byteSize as number,
    }
  })
  unique(
    media.map((entry) => entry.assetPath),
    'media asset paths',
  )

  const mediaPaths = new Set(media.map((entry) => entry.assetPath))
  const authorSlugs = new Set(authors.map((author) => author.slug))
  const tagSlugs = new Set(tags.map((tag) => tag.slug))
  const posts = array(source.posts, 'posts').map((item, index) => {
    const post = record(item, `posts[${index}]`)
    const categories = array(post.categories, `posts[${index}].categories`).map(
      (category, categoryIndex) =>
        string(category, `posts[${index}].categories[${categoryIndex}]`),
    )
    if (categories.some((category) => !tagSlugs.has(category)))
      fail(`posts[${index}].categories reference an unknown tag`)
    const authorSlug = string(post.authorSlug, `posts[${index}].authorSlug`)
    if (!authorSlugs.has(authorSlug))
      fail(`posts[${index}].authorSlug references an unknown author`)
    const imageAsset =
      post.imageAsset === undefined
        ? undefined
        : relativeAsset(post.imageAsset, `posts[${index}].imageAsset`)
    if (imageAsset && !mediaPaths.has(imageAsset))
      fail(`posts[${index}].imageAsset references unknown media`)
    const bodyMarkdown =
      typeof post.bodyMarkdown === 'string'
        ? safeText(post.bodyMarkdown, `posts[${index}].bodyMarkdown`)
        : importHtmlBodyToMarkdown(
            safeText(post.bodyHtml, `posts[${index}].bodyHtml`),
          )
    const bodyHtml = renderEditorialMarkdown(bodyMarkdown)
    const inlineMediaAssets = bodyMediaAssets(
      post.bodyMediaAssets,
      bodyHtml,
      mediaPaths,
      `posts[${index}].bodyMediaAssets`,
    )
    const sourceUrl =
      post.sourceUrl === undefined
        ? undefined
        : string(post.sourceUrl, `posts[${index}].sourceUrl`)
    if (sourceUrl) {
      let parsed: URL
      try {
        parsed = new URL(sourceUrl)
      } catch {
        fail(`posts[${index}].sourceUrl must be a URL`)
      }
      if (parsed.origin !== settings.canonicalOrigin)
        fail(`posts[${index}].sourceUrl must use the publication origin`)
    }
    const status =
      post.status === undefined
        ? 'published'
        : (string(post.status, `posts[${index}].status`) as ContentStatus)
    if (!['draft', 'review', 'scheduled', 'published'].includes(status))
      fail(`posts[${index}].status is invalid`)
    return {
      sourceId: string(post.sourceId, `posts[${index}].sourceId`),
      slug: string(post.slug, `posts[${index}].slug`),
      title: safeText(post.title, `posts[${index}].title`),
      excerpt: safeText(post.excerpt, `posts[${index}].excerpt`),
      bodyMarkdown,
      bodyHtml,
      author: safeText(post.author, `posts[${index}].author`),
      authorSlug,
      seoTitle: safeText(post.seoTitle, `posts[${index}].seoTitle`),
      seoDescription: safeText(
        post.seoDescription,
        `posts[${index}].seoDescription`,
      ),
      publishedAt: string(post.publishedAt, `posts[${index}].publishedAt`),
      categories,
      status,
      featured: post.featured === true,
      ...(typeof post.featuredRank === 'number'
        ? { featuredRank: post.featuredRank }
        : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(imageAsset ? { imageAsset } : {}),
      ...(inlineMediaAssets ? { bodyMediaAssets: inlineMediaAssets } : {}),
    }
  })
  unique(
    posts.map((post) => post.sourceId),
    'post source IDs',
  )
  unique(
    posts.map((post) => post.slug),
    'post slugs',
  )
  return { schemaVersion: 1, settings, authors, tags, posts, media }
}

export function archiveSummary(archive: EditorialArchive): {
  readonly schemaVersion: 1
  readonly counts: {
    readonly authors: number
    readonly tags: number
    readonly posts: number
    readonly media: number
  }
} {
  return {
    schemaVersion: 1,
    counts: {
      authors: archive.authors.length,
      tags: archive.tags.length,
      posts: archive.posts.length,
      media: archive.media.length,
    },
  }
}

/** Canonical validated representation used by restore idempotency. */
export function archiveCanonicalJson(archive: EditorialArchive): string {
  return JSON.stringify(archive)
}
