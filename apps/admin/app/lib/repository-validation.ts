import { createHash, randomUUID } from 'node:crypto'
import {
  asPublishedPost,
  ContentValidationError,
  isThemeId,
  publicAuthor,
  publicSettings,
  type AuthorProfileInput,
  articleFromPost,
  type ContentSnapshot,
  emptyPublicPluginSnapshot,
  type ManagedAuthorProfile,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
  type PostDraftInput,
  type PublicationSettingsInput,
  type TaxonomyTermInput,
  validatePostInput,
  validateFeaturedRanks,
  withCanonicalBody,
} from '@publisher/content'

export function validatedSettings(
  input: PublicationSettingsInput,
  current: ManagedPublicationSettings,
): ManagedPublicationSettings {
  const required = [
    ['name', input.name],
    ['shortName', input.shortName],
    ['description', input.description],
    ['language', input.language],
    ['locale', input.locale],
    ['publisherName', input.publisherName],
  ] as const
  for (const [field, value] of required)
    if (!value.trim()) throw new ContentValidationError(`${field} is required`)
  let canonicalOrigin: string
  try {
    const parsed = new URL(input.canonicalOrigin)
    if (
      parsed.protocol !== 'https:' ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('invalid')
    canonicalOrigin = parsed.origin
  } catch {
    throw new ContentValidationError(
      'canonicalOrigin must be an HTTPS origin without a path',
    )
  }
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(input.language))
    throw new ContentValidationError('language must be a valid language tag')
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(input.locale))
    throw new ContentValidationError('locale must be a valid locale')
  if (!isThemeId(input.themeId))
    throw new ContentValidationError(`unknown theme: ${input.themeId}`)
  return {
    name: input.name.trim(),
    shortName: input.shortName.trim(),
    description: input.description.trim(),
    canonicalOrigin,
    language: input.language.trim(),
    locale: input.locale.trim(),
    publisherName: input.publisherName.trim(),
    themeId: input.themeId,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  }
}

function slugify(value: string, prefix: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `${prefix}-${randomUUID().slice(0, 8)}`
}

export function validatedAuthor(
  slug: string | undefined,
  input: AuthorProfileInput,
  current: ManagedAuthorProfile | undefined,
): ManagedAuthorProfile {
  const name = input.name.trim()
  const bio = input.bio.trim()
  if (!name) throw new ContentValidationError('author name is required')
  if (!bio) throw new ContentValidationError('author bio is required')
  if (name.length > 120)
    throw new ContentValidationError('author name is too long')
  if (bio.length > 500)
    throw new ContentValidationError('author bio is too long')
  if (
    (input.editorialPersona ?? current?.editorialPersona ?? '').trim().length >
    4000
  )
    throw new ContentValidationError('editorialPersona is too long')
  const resolvedSlug =
    current?.slug ?? slug ?? input.slug ?? slugify(name, 'author')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resolvedSlug))
    throw new ContentValidationError(
      'author slug must contain lowercase letters, numbers, and hyphens only',
    )
  if (current && input.slug && input.slug !== current.slug)
    throw new ContentValidationError('author slug cannot be changed')
  const avatarUrl = input.avatarUrl?.trim() || undefined
  if (
    avatarUrl &&
    !avatarUrl.startsWith('/media/') &&
    !avatarUrl.startsWith('https://')
  )
    throw new ContentValidationError(
      'avatarUrl must be a local media path or HTTPS URL',
    )
  const now = new Date().toISOString()
  return {
    slug: resolvedSlug,
    name,
    bio,
    avatarUrl,
    active: input.active !== false,
    editorialPersona: (
      input.editorialPersona ??
      current?.editorialPersona ??
      ''
    ).trim(),
    revision: (current?.revision ?? 0) + 1,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
}

export function assertAuthorUnassigned(
  posts: readonly ManagedPost[],
  slug: string,
): void {
  if (posts.some((post) => post.authorSlug === slug))
    throw new ContentValidationError(
      'Reassign every post before archiving its author',
    )
}

export function validatedTag(
  slug: string | undefined,
  input: TaxonomyTermInput,
  current: ManagedTaxonomyTerm | undefined,
): ManagedTaxonomyTerm {
  const name = input.name.trim()
  if (!name) throw new ContentValidationError('tag name is required')
  if (name.length > 80) throw new ContentValidationError('tag name is too long')
  const resolvedSlug = current?.slug ?? slug ?? slugify(name, 'tag')
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(resolvedSlug))
    throw new ContentValidationError(
      'tag slug must contain letters, numbers, and hyphens only',
    )
  const now = new Date().toISOString()
  return {
    slug: resolvedSlug,
    name,
    active: input.active !== false,
    revision: (current?.revision ?? 0) + 1,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
}

function inputFromPost(post: ManagedPost): PostDraftInput {
  return {
    sourceId: post.sourceId,
    sourceUrl: post.sourceUrl,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    author: post.author,
    authorSlug: post.authorSlug,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status: post.status,
    publishedAt: post.publishedAt,
    categories: post.categories,
    tags: post.tags,
    imageUrl: post.imageUrl,
    featured: post.featured,
    featuredRank: post.featuredRank,
  }
}

export function validatedPost(
  id: string | undefined,
  current: ManagedPost | undefined,
  input: PostDraftInput,
  allowedCategories: readonly string[],
  allowedAuthorSlugs: readonly string[],
  canonicalOrigin: string,
  allowedTags: readonly string[] = allowedCategories,
): ManagedPost {
  let candidate = input
  if (current) {
    const {
      sourceId: currentSourceId,
      sourceUrl: currentSourceUrl,
      ...editable
    } = inputFromPost(current)
    const { sourceId, sourceUrl, ...patch } = input
    const merged = {
      ...editable,
      ...patch,
      sourceId: sourceId ?? currentSourceId,
      sourceUrl: sourceUrl ?? currentSourceUrl,
    }
    try {
      const parsed = new URL(merged.sourceUrl ?? '')
      if (
        merged.sourceUrl === current.sourceUrl &&
        parsed.origin !== canonicalOrigin
      )
        merged.sourceUrl = `${canonicalOrigin}${parsed.pathname}${parsed.search}`
    } catch {
      // Shared validation reports malformed URLs below.
    }
    candidate = merged
  }
  const result = validatePostInput(candidate, undefined, allowedCategories, {
    allowedAuthorSlugs,
    canonicalOrigin,
  })
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  for (const tag of result.value.tags)
    if (!allowedTags.includes(tag))
      throw new ContentValidationError(`unsupported tag: ${tag}`)
  return {
    ...result.value,
    id: id ?? result.value.id,
    revision: current ? current.revision + 1 : result.value.revision,
    createdAt: current?.createdAt ?? result.value.createdAt,
  }
}

export function assertUniqueFeaturedRanks(posts: readonly ManagedPost[]): void {
  const errors = validateFeaturedRanks(posts)
  if (errors.length > 0) throw new ContentValidationError(errors.join('; '))
}

export function makeSnapshot(
  posts: readonly ManagedPost[],
  tags: readonly ManagedTaxonomyTerm[],
  settings: ManagedPublicationSettings,
  authors: readonly ManagedAuthorProfile[],
  siteId = 'default',
  articles: readonly import('@publisher/content').Article[] = posts.map(
    (post) => articleFromPost(post, settings.locale),
  ),
  plugins = emptyPublicPluginSnapshot,
  media: readonly import('@publisher/content').SnapshotMedia[],
  categories: readonly ManagedTaxonomyTerm[] = tags,
): { snapshot: ContentSnapshot; checksum: string } {
  const generatedAt = new Date().toISOString()
  const snapshot: ContentSnapshot = {
    schemaVersion: 4,
    siteId,
    snapshotId: `snapshot-${generatedAt.replace(/[^0-9]/g, '')}-${randomUUID()}`,
    generatedAt,
    settings: publicSettings(settings),
    authors: authors.filter((author) => author.active).map(publicAuthor),
    tags: tags.filter((tag) => tag.active),
    categories: categories.filter((category) => category.active),
    posts: posts
      .filter(
        (post) =>
          post.status === 'published' ||
          (post.status === 'scheduled' &&
            Date.parse(post.publishedAt) <= Date.parse(generatedAt)),
      )
      .map((post) => {
        try {
          return withCanonicalBody(asPublishedPost(post), post.slug)
        } catch (error) {
          throw new ContentValidationError(
            `post ${post.slug} cannot be published: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }),
    articles: articles
      .map((article) => ({
        ...article,
        variants: article.variants.filter(
          (variant) =>
            variant.status === 'published' ||
            (variant.status === 'scheduled' &&
              Date.parse(variant.publishedAt) <= Date.parse(generatedAt)),
        ),
      }))
      .filter((article) => article.variants.length > 0),
    plugins,
    media,
  }
  const checksum = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex')
  return { snapshot, checksum }
}
