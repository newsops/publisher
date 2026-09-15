import { renderPluginContributions, type PublicPluginSnapshot } from './plugins'
import { assertValidArticleVariant } from './article-adapter'
import type { Article, ArticleVariant, NewsPost } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Invalid content snapshot field: ${field}`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function requiredStringArray(value: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  )
    throw new Error(`Invalid content snapshot field: ${field}`)
  return value
}

function parseArticleVariant(value: unknown): ArticleVariant {
  if (!isRecord(value)) throw new Error('Invalid article variant')
  return assertValidArticleVariant({
    locale: optionalString(value.locale),
    slug: optionalString(value.slug),
    title: optionalString(value.title),
    excerpt: optionalString(value.excerpt),
    bodyHtml: optionalString(value.bodyHtml),
    seoTitle: optionalString(value.seoTitle),
    seoDescription: optionalString(value.seoDescription),
    status:
      value.status === 'draft' ||
      value.status === 'review' ||
      value.status === 'scheduled' ||
      value.status === 'published'
        ? value.status
        : undefined,
    revision: typeof value.revision === 'number' ? value.revision : undefined,
    publishedAt: optionalString(value.publishedAt),
    updatedAt: optionalString(value.updatedAt),
  })
}

export function parseArticle(value: unknown): Article | undefined {
  if (!isRecord(value)) return undefined
  const variants = value.variants
  if (
    typeof value.id !== 'string' ||
    typeof value.sourceId !== 'string' ||
    typeof value.sourceUrl !== 'string' ||
    typeof value.author !== 'string' ||
    typeof value.authorSlug !== 'string' ||
    !Array.isArray(variants) ||
    typeof value.featured !== 'boolean'
  )
    return undefined
  const imageUrl = value.imageUrl
  if (imageUrl !== undefined && typeof imageUrl !== 'string') return undefined
  try {
    const parsedVariants = variants.map(parseArticleVariant)
    if (parsedVariants.length === 0) return undefined
    return {
      id: value.id,
      sourceId: value.sourceId,
      sourceUrl: value.sourceUrl,
      author: value.author,
      authorSlug: value.authorSlug,
      categories: requiredStringArray(value.categories, 'categories'),
      tags: Array.isArray(value.tags)
        ? requiredStringArray(value.tags, 'tags')
        : [],
      imageUrl,
      featured: value.featured,
      featuredRank:
        typeof value.featuredRank === 'number' ? value.featuredRank : undefined,
      variants: parsedVariants,
    }
  } catch {
    return undefined
  }
}

export function parsePost(value: unknown): NewsPost {
  if (!isRecord(value)) throw new Error('Invalid content snapshot post')
  const imageUrl = value.imageUrl
  if (imageUrl !== undefined && typeof imageUrl !== 'string')
    throw new Error('Invalid content snapshot field: imageUrl')
  if (typeof value.featured !== 'boolean')
    throw new Error('Invalid content snapshot field: featured')
  const featuredRank = value.featuredRank
  if (
    featuredRank !== undefined &&
    featuredRank !== null &&
    (typeof featuredRank !== 'number' ||
      !Number.isInteger(featuredRank) ||
      featuredRank <= 0)
  )
    throw new Error('Invalid content snapshot field: featuredRank')
  return {
    sourceId: requiredString(value.sourceId, 'sourceId'),
    sourceUrl: requiredString(value.sourceUrl, 'sourceUrl'),
    slug: requiredString(value.slug, 'slug'),
    title: requiredString(value.title, 'title'),
    excerpt: requiredString(value.excerpt, 'excerpt'),
    bodyHtml: requiredString(value.bodyHtml, 'bodyHtml'),
    author: requiredString(value.author, 'author'),
    authorSlug:
      typeof value.authorSlug === 'string'
        ? value.authorSlug
        : 'example-editor',
    seoTitle:
      typeof value.seoTitle === 'string'
        ? value.seoTitle
        : requiredString(value.title, 'title').slice(0, 70),
    seoDescription:
      typeof value.seoDescription === 'string'
        ? value.seoDescription
        : requiredString(value.excerpt, 'excerpt').slice(0, 180),
    publishedAt: requiredString(value.publishedAt, 'publishedAt'),
    updatedAt: requiredString(value.updatedAt, 'updatedAt'),
    categories: requiredStringArray(value.categories, 'categories'),
    tags: Array.isArray(value.tags)
      ? requiredStringArray(value.tags, 'tags')
      : [],
    imageUrl,
    featured: value.featured,
    featuredRank: typeof featuredRank === 'number' ? featuredRank : undefined,
  }
}

export function parsePublicPluginSnapshot(
  value: unknown,
): PublicPluginSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.installations)
  )
    throw new Error('Invalid public plugin snapshot')
  const installations = value.installations.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.pluginId !== 'string' ||
      typeof item.definitionVersion !== 'string' ||
      !isRecord(item.configuration)
    )
      throw new Error('Invalid public plugin installation')
    return {
      pluginId: item.pluginId,
      definitionVersion: item.definitionVersion,
      configuration: item.configuration,
    }
  })
  const snapshot: PublicPluginSnapshot = { schemaVersion: 1, installations }
  renderPluginContributions(snapshot)
  return snapshot
}
