import type {
  ContentStatus,
  ManagedPost,
  PostDraftInput,
  TaxonomyTermInput,
} from '@publisher/content'
import { ApiRequestError } from './api-error'

const AutomationApiError = ApiRequestError

export type PostPatchInput = Partial<PostDraftInput>
export type TagPatchInput = Partial<TaxonomyTermInput>
type MutablePostPatch = {
  -readonly [Key in keyof PostDraftInput]?: PostDraftInput[Key]
}

export function draftInputFromPost(post: ManagedPost): PostDraftInput {
  return {
    sourceId: post.sourceId,
    sourceUrl: post.sourceUrl,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyHtml: post.bodyHtml,
    author: post.author,
    authorSlug: post.authorSlug,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status: post.status,
    publishedAt: post.publishedAt,
    categories: post.categories,
    imageUrl: post.imageUrl,
    featured: post.featured,
    featuredRank: post.featuredRank,
  }
}

export function mergePostInput(
  post: ManagedPost,
  patch: PostPatchInput,
): PostDraftInput {
  return { ...draftInputFromPost(post), ...patch }
}

const fields = new Set([
  'sourceId',
  'sourceUrl',
  'slug',
  'title',
  'excerpt',
  'bodyHtml',
  'author',
  'authorSlug',
  'seoTitle',
  'seoDescription',
  'status',
  'publishedAt',
  'categories',
  'imageUrl',
  'featured',
  'featuredRank',
])

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AutomationApiError(
      'invalid_body',
      'Request body must be a JSON object',
      400,
    )
  return value as Record<string, unknown>
}

function rejectUnknownFields(object: Record<string, unknown>): void {
  const unknown = Object.keys(object).filter((key) => !fields.has(key))
  if (unknown.length > 0)
    throw new AutomationApiError(
      'unknown_fields',
      `Unknown fields: ${unknown.join(', ')}`,
      400,
    )
}

export function stringField(
  object: Record<string, unknown>,
  key: string,
  partial: boolean,
): string | undefined {
  if (!(key in object)) return partial ? undefined : ''
  if (typeof object[key] !== 'string')
    throw new AutomationApiError(
      'invalid_field',
      `${key} must be a string`,
      400,
    )
  return object[key] as string
}

function categoriesField(
  object: Record<string, unknown>,
  partial: boolean,
): readonly string[] | undefined {
  if (!('categories' in object)) return partial ? undefined : []
  if (
    !Array.isArray(object.categories) ||
    object.categories.some((item) => typeof item !== 'string')
  )
    throw new AutomationApiError(
      'invalid_field',
      'categories must be an array of strings',
      400,
    )
  return object.categories as string[]
}

export function booleanField(
  object: Record<string, unknown>,
  key: string,
  partial: boolean,
): boolean | undefined {
  if (!(key in object)) return partial ? undefined : false
  if (typeof object[key] !== 'boolean')
    throw new AutomationApiError(
      'invalid_field',
      `${key} must be a boolean`,
      400,
    )
  return object[key] as boolean
}

function numberField(
  object: Record<string, unknown>,
  key: string,
  partial: boolean,
): number | null | undefined {
  if (!(key in object)) return partial ? undefined : null
  if (object[key] === null) return null
  if (typeof object[key] !== 'number')
    throw new AutomationApiError(
      'invalid_field',
      `${key} must be a number`,
      400,
    )
  return object[key] as number
}

function statusField(
  object: Record<string, unknown>,
  partial: boolean,
): ContentStatus | undefined {
  if (!('status' in object)) return partial ? undefined : 'draft'
  if (
    typeof object.status !== 'string' ||
    !['draft', 'review', 'scheduled', 'published'].includes(object.status)
  )
    throw new AutomationApiError(
      'invalid_field',
      'status must be draft, review, scheduled, or published',
      400,
    )
  return object.status as ContentStatus
}

export function parsePostInput(value: unknown): PostDraftInput {
  const object = objectValue(value)
  rejectUnknownFields(object)
  return {
    sourceId: stringField(object, 'sourceId', true),
    sourceUrl: stringField(object, 'sourceUrl', true),
    slug: stringField(object, 'slug', false) ?? '',
    title: stringField(object, 'title', false) ?? '',
    excerpt: stringField(object, 'excerpt', false) ?? '',
    bodyHtml: stringField(object, 'bodyHtml', false) ?? '',
    author: stringField(object, 'author', false) ?? '',
    authorSlug: stringField(object, 'authorSlug', true),
    seoTitle: stringField(object, 'seoTitle', true),
    seoDescription: stringField(object, 'seoDescription', true),
    status: statusField(object, false),
    publishedAt: stringField(object, 'publishedAt', false) ?? '',
    categories: categoriesField(object, false) ?? [],
    imageUrl: stringField(object, 'imageUrl', false),
    featured: booleanField(object, 'featured', false),
    featuredRank: numberField(object, 'featuredRank', false),
  }
}

export function parsePostPatch(value: unknown): PostPatchInput {
  const object = objectValue(value)
  rejectUnknownFields(object)
  const patch: MutablePostPatch = {}
  const sourceId = stringField(object, 'sourceId', true)
  const sourceUrl = stringField(object, 'sourceUrl', true)
  const slug = stringField(object, 'slug', true)
  const title = stringField(object, 'title', true)
  const excerpt = stringField(object, 'excerpt', true)
  const bodyHtml = stringField(object, 'bodyHtml', true)
  const author = stringField(object, 'author', true)
  const authorSlug = stringField(object, 'authorSlug', true)
  const seoTitle = stringField(object, 'seoTitle', true)
  const seoDescription = stringField(object, 'seoDescription', true)
  const status = statusField(object, true)
  const publishedAt = stringField(object, 'publishedAt', true)
  const categories = categoriesField(object, true)
  const imageUrl = stringField(object, 'imageUrl', true)
  const featured = booleanField(object, 'featured', true)
  const featuredRank = numberField(object, 'featuredRank', true)
  if (sourceId !== undefined) patch.sourceId = sourceId
  if (sourceUrl !== undefined) patch.sourceUrl = sourceUrl
  if (slug !== undefined) patch.slug = slug
  if (title !== undefined) patch.title = title
  if (excerpt !== undefined) patch.excerpt = excerpt
  if (bodyHtml !== undefined) patch.bodyHtml = bodyHtml
  if (author !== undefined) patch.author = author
  if (authorSlug !== undefined) patch.authorSlug = authorSlug
  if (seoTitle !== undefined) patch.seoTitle = seoTitle
  if (seoDescription !== undefined) patch.seoDescription = seoDescription
  if (status !== undefined) patch.status = status
  if (publishedAt !== undefined) patch.publishedAt = publishedAt
  if (categories !== undefined) patch.categories = categories
  if (imageUrl !== undefined) patch.imageUrl = imageUrl
  if (featured !== undefined) patch.featured = featured
  if (featuredRank !== undefined) patch.featuredRank = featuredRank
  return patch
}

export function parseTagInput(value: unknown): TaxonomyTermInput {
  const object = objectValue(value)
  const unknown = Object.keys(object).filter(
    (key) => !['slug', 'name'].includes(key),
  )
  if (unknown.length > 0)
    throw new AutomationApiError(
      'unknown_fields',
      `Unknown fields: ${unknown.join(', ')}`,
      400,
    )
  if (typeof object.name !== 'string')
    throw new AutomationApiError('invalid_field', 'name must be a string', 400)
  if (object.slug !== undefined && typeof object.slug !== 'string')
    throw new AutomationApiError('invalid_field', 'slug must be a string', 400)
  return {
    name: object.name,
    slug: typeof object.slug === 'string' ? object.slug : undefined,
  }
}

export function parseTagPatch(value: unknown): TagPatchInput {
  const object = objectValue(value)
  const unknown = Object.keys(object).filter((key) => key !== 'name')
  if (unknown.length > 0)
    throw new AutomationApiError(
      'unknown_fields',
      `Unknown fields: ${unknown.join(', ')}`,
      400,
    )
  if (typeof object.name !== 'string')
    throw new AutomationApiError('invalid_field', 'name must be a string', 400)
  return { name: object.name }
}
