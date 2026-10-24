import type { PostDraftInput } from './editor'
import type { PublicationSettings } from './types'
import { parseArchivePosts } from './archive-post'
import {
  array,
  fail,
  record,
  relativeAsset,
  safeHttpsOrigin,
  safeText,
  string,
  unique,
} from './archive-values'

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

function parseAuthors(value: unknown): readonly ArchiveAuthorEntry[] {
  const authors = array(value, 'authors').map((item, index) => {
    const label = `authors[${index}]`
    const author = record(item, label)
    return {
      slug: string(author.slug, `${label}.slug`),
      name: safeText(author.name, `${label}.name`),
      bio: safeText(author.bio, `${label}.bio`),
      ...(author.avatarAsset === undefined
        ? {}
        : {
            avatarAsset: relativeAsset(
              author.avatarAsset,
              `${label}.avatarAsset`,
            ),
          }),
    }
  })
  if (authors.length === 0) fail('authors must not be empty')
  unique(
    authors.map((author) => author.slug),
    'author slugs',
  )
  return authors
}

function parseTags(value: unknown): readonly ArchiveTagEntry[] {
  const tags = array(value, 'tags').map((item, index) => {
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
  return tags
}

function isMediaType(value: string): value is ArchiveMediaEntry['mimeType'] {
  return (
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/webp' ||
    value === 'image/avif'
  )
}

function parseMedia(value: unknown): readonly ArchiveMediaEntry[] {
  const media = array(value, 'media').map((item, index) => {
    const label = `media[${index}]`
    const entry = record(item, label)
    const mimeType = string(entry.mimeType, `${label}.mimeType`)
    if (!isMediaType(mimeType)) fail(`${label}.mimeType is unsupported`)
    const sha256 = string(entry.sha256, `${label}.sha256`).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail(`${label}.sha256 is invalid`)
    if (
      typeof entry.byteSize !== 'number' ||
      !Number.isSafeInteger(entry.byteSize) ||
      entry.byteSize < 1
    )
      fail(`${label}.byteSize is invalid`)
    return {
      assetPath: relativeAsset(entry.assetPath, `${label}.assetPath`),
      sha256,
      mimeType,
      byteSize: entry.byteSize,
    }
  })
  unique(
    media.map((entry) => entry.assetPath),
    'media asset paths',
  )
  return media
}

export function validateEditorialArchive(value: unknown): EditorialArchive {
  const source = record(value, 'archive')
  if (source.schemaVersion !== 1) fail('schemaVersion must be 1')
  const archive = {
    schemaVersion: 1,
    settings: parseSettings(source.settings),
    authors: parseAuthors(source.authors),
    tags: parseTags(source.tags),
    media: parseMedia(source.media),
  } satisfies Omit<EditorialArchive, 'posts'>
  const posts = parseArchivePosts(source.posts, archive)
  unique(
    posts.map((post) => post.sourceId),
    'post source IDs',
  )
  unique(
    posts.map((post) => post.slug),
    'post slugs',
  )
  return { ...archive, posts }
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
