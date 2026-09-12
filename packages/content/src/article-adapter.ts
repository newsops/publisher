import type {
  Article,
  ArticleVariant,
  ArticleVariantStatus,
  NewsPost,
} from './types'
import { ContentValidationError, sanitizeBodyHtml } from './editor'

const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export function isValidLocale(value: unknown): value is string {
  if (typeof value !== 'string' || !LOCALE_PATTERN.test(value)) return false
  try {
    return new Intl.Locale(value).toString() === value
  } catch {
    return false
  }
}

export function validateArticleLocales(
  variants: readonly Pick<ArticleVariant, 'locale'>[],
): readonly string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const variant of variants) {
    if (!isValidLocale(variant.locale)) {
      errors.push(`locale ${variant.locale} must be a canonical BCP 47 tag`)
      continue
    }
    if (seen.has(variant.locale))
      errors.push(`locale ${variant.locale} must be unique`)
    seen.add(variant.locale)
  }
  return errors
}

export function assertValidArticleLocales(
  variants: readonly Pick<ArticleVariant, 'locale'>[],
): void {
  const errors = validateArticleLocales(variants)
  if (errors.length > 0) throw new Error(errors.join('; '))
}

const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ARTICLE_STATUSES = new Set<ArticleVariantStatus>([
  'draft',
  'review',
  'scheduled',
  'published',
])

export function validateArticleVariant(
  input: Partial<ArticleVariant>,
): readonly string[] {
  const errors: string[] = []
  if (!isValidLocale(input.locale))
    errors.push('locale must be a canonical BCP 47 tag')
  if (typeof input.slug !== 'string' || !ARTICLE_SLUG_PATTERN.test(input.slug))
    errors.push(
      'slug must contain lowercase letters, numbers, and hyphens only',
    )
  for (const field of [
    'title',
    'excerpt',
    'seoTitle',
    'seoDescription',
  ] as const)
    if (typeof input[field] !== 'string' || !input[field].trim())
      errors.push(`${field} is required`)
  if (typeof input.bodyHtml !== 'string' || !input.bodyHtml.trim())
    errors.push('bodyHtml is required')
  if (
    typeof input.status !== 'string' ||
    !ARTICLE_STATUSES.has(input.status as ArticleVariantStatus)
  )
    errors.push('status is invalid')
  if (
    typeof input.publishedAt !== 'string' ||
    Number.isNaN(Date.parse(input.publishedAt))
  )
    errors.push('publishedAt must be an ISO date')
  return errors
}

export function assertValidArticleVariant(
  input: Partial<ArticleVariant>,
): ArticleVariant {
  const errors = validateArticleVariant(input)
  if (errors.length > 0) throw new ContentValidationError(errors.join('; '))
  return {
    locale: input.locale as string,
    slug: input.slug as string,
    title: (input.title as string).trim(),
    excerpt: (input.excerpt as string).trim(),
    bodyHtml: sanitizeBodyHtml(input.bodyHtml as string),
    seoTitle: (input.seoTitle as string).trim(),
    seoDescription: (input.seoDescription as string).trim(),
    status: input.status as ArticleVariantStatus,
    revision:
      typeof input.revision === 'number' && Number.isInteger(input.revision)
        ? input.revision
        : 0,
    publishedAt: input.publishedAt as string,
    updatedAt:
      typeof input.updatedAt === 'string' && input.updatedAt
        ? input.updatedAt
        : new Date().toISOString(),
  }
}

export function articleFromPost(
  post: NewsPost,
  locale: string,
  status: ArticleVariantStatus = 'published',
): Article {
  assertValidArticleLocales([{ locale }])
  const variant: ArticleVariant = {
    locale,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyHtml: post.bodyHtml,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status,
    revision: 1,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  }
  return {
    id: `article-${post.sourceId}`,
    sourceId: post.sourceId,
    sourceUrl: post.sourceUrl,
    author: post.author,
    authorSlug: post.authorSlug,
    categories: post.categories,
    imageUrl: post.imageUrl,
    featured: post.featured,
    featuredRank: post.featuredRank,
    variants: [variant],
  }
}

export function defaultVariant(
  article: Article,
  defaultLocale: string,
): ArticleVariant | undefined {
  return article.variants.find((variant) => variant.locale === defaultLocale)
}

export function articleToPost(
  article: Article,
  defaultLocale: string,
): NewsPost | undefined {
  const variant = defaultVariant(article, defaultLocale)
  if (!variant) return undefined
  return {
    sourceId: article.sourceId,
    sourceUrl: article.sourceUrl,
    slug: variant.slug,
    title: variant.title,
    excerpt: variant.excerpt,
    bodyHtml: variant.bodyHtml,
    author: article.author,
    authorSlug: article.authorSlug,
    seoTitle: variant.seoTitle,
    seoDescription: variant.seoDescription,
    publishedAt: variant.publishedAt,
    updatedAt: variant.updatedAt,
    categories: article.categories,
    imageUrl: article.imageUrl,
    featured: article.featured,
    featuredRank: article.featuredRank,
  }
}
