import type {
  AuthorProfile,
  Article,
  ManagedAuthorProfile,
  ManagedPublicationSettings,
  ManagedTaxonomyTerm,
  NewsPost,
  PublicationSettings,
} from './types'
import type { PublicPluginSnapshot } from './plugins'
import { resolveValidatedPost } from './post-validation'

export { sanitizeBodyHtml } from './post-validation'

export const defaultCategories = ['General'] as const
export const allowedCategories = defaultCategories
export type ContentStatus = 'draft' | 'review' | 'scheduled' | 'published'

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentValidationError'
  }
}

export interface ManagedPost extends NewsPost {
  readonly id: string
  readonly status: ContentStatus
  readonly revision: number
  readonly createdAt: string
}

export interface ManagedArticle extends Article {
  readonly revision: number
  readonly createdAt: string
}

export interface PostDraftInput {
  readonly sourceId?: string
  readonly sourceUrl?: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly bodyMarkdown: string
  readonly author: string
  readonly authorSlug?: string
  readonly seoTitle?: string
  readonly seoDescription?: string
  readonly status?: ContentStatus
  readonly publishedAt: string
  readonly categories: readonly string[]
  readonly tags?: readonly string[]
  readonly imageUrl?: string
  readonly featured?: boolean
  readonly featuredRank?: number | null
}

export type PublicationSettingsInput = PublicationSettings

export function validateFeaturedRanks(
  posts: readonly Pick<NewsPost, 'featuredRank'>[],
): readonly string[] {
  const errors: string[] = []
  const seen = new Set<number>()
  for (const post of posts) {
    if (post.featuredRank === undefined) continue
    if (seen.has(post.featuredRank))
      errors.push(`featuredRank ${post.featuredRank} must be unique`)
    seen.add(post.featuredRank)
  }
  return errors
}

export interface AuthorProfileInput {
  readonly slug?: string
  readonly name: string
  readonly bio: string
  readonly avatarUrl?: string
  readonly active?: boolean
  readonly editorialPersona?: string
}

export interface TaxonomyTermInput {
  readonly slug?: string
  readonly name: string
  readonly active?: boolean
}

export interface ContentSnapshot {
  readonly schemaVersion: 4
  readonly siteId: string
  readonly snapshotId: string
  readonly generatedAt: string
  readonly settings: PublicationSettings
  readonly authors: readonly AuthorProfile[]
  readonly tags: readonly ManagedTaxonomyTerm[]
  readonly categories: readonly ManagedTaxonomyTerm[]
  readonly posts: readonly NewsPost[]
  readonly articles: readonly Article[]
  readonly plugins: PublicPluginSnapshot
  readonly media: readonly SnapshotMedia[]
}

export interface SnapshotMedia {
  readonly id: string
  readonly publicPath: string
  readonly objectKey: string
  readonly sha256: string
  readonly mimeType: string
  readonly byteSize: number
}

export interface ValidationResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly errors: readonly string[]
}

export function validatePostInput(
  input: PostDraftInput,
  now = new Date().toISOString(),
  allowed: readonly string[] = defaultCategories,
  context: {
    readonly canonicalOrigin?: string
    readonly allowedAuthorSlugs?: readonly string[]
  } = {},
): ValidationResult<ManagedPost> {
  const { fields, categories, tags, errors } = resolveValidatedPost(
    input,
    allowed,
    context,
  )
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    errors: [],
    value: {
      id: `post-${fields.sourceId}`,
      sourceId: fields.sourceId,
      sourceUrl: fields.sourceUrl,
      slug: fields.slug,
      title: fields.title,
      excerpt: fields.excerpt,
      bodyMarkdown: fields.bodyMarkdown,
      bodyHtml: fields.bodyHtml,
      author: fields.author,
      authorSlug: fields.authorSlug,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      publishedAt: fields.publishedAt,
      updatedAt: now,
      categories,
      tags,
      imageUrl: input.imageUrl || undefined,
      featured: input.featured === true,
      featuredRank: input.featuredRank ?? undefined,
      status: fields.status,
      revision: 1,
      createdAt: now,
    },
  }
}

export function publicAuthor(author: ManagedAuthorProfile): AuthorProfile {
  const {
    revision: _revision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    editorialPersona: _editorialPersona,
    ...profile
  } = author
  return profile
}

export function publicSettings(
  settings: ManagedPublicationSettings,
): PublicationSettings {
  const {
    revision: _revision,
    updatedAt: _updatedAt,
    ...publication
  } = settings
  return publication
}

export function asPublishedPost(post: ManagedPost): NewsPost {
  const {
    id: _id,
    status: _status,
    revision: _revision,
    createdAt: _createdAt,
    ...published
  } = post
  return published
}
