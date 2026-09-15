import sanitizeHtml from 'sanitize-html'
import type { ContentStatus, PostDraftInput } from './editor'
import { publicPostPath } from './public-paths'

const allowedBodyTags = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'div',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]

const allowedBodyAttributes = {
  '*': ['dir', 'lang'],
  a: ['href', 'title'],
  figure: ['class', 'data-publisher-x-post'],
  img: ['alt', 'decoding', 'height', 'loading', 'src', 'title', 'width'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
}

export interface ResolvedPostFields {
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly bodyHtml: string
  readonly author: string
  readonly authorSlug: string
  readonly seoTitle: string
  readonly seoDescription: string
  readonly publishedAt: string
  readonly status: ContentStatus
  readonly canonicalOrigin: string
  readonly sourceId: string
  readonly sourceUrl: string
}

function text(value: unknown, field: string, errors: string[]): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} is required`)
    return ''
  }
  return value.trim()
}

function validateFeaturedRank(value: unknown, errors: string[]): void {
  if (value === undefined || value === null || value === '') return
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    errors.push('featuredRank must be a positive integer')
}

export function sanitizeBodyHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: allowedBodyTags,
    allowedAttributes: allowedBodyAttributes,
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  }).trim()
}

function resolveSeo(
  input: PostDraftInput,
  title: string,
  excerpt: string,
  errors: string[],
): Pick<ResolvedPostFields, 'seoTitle' | 'seoDescription'> {
  return {
    seoTitle: text(
      input.seoTitle?.trim() ? input.seoTitle : title.slice(0, 70),
      'seoTitle',
      errors,
    ),
    seoDescription: text(
      input.seoDescription?.trim()
        ? input.seoDescription
        : excerpt.slice(0, 180),
      'seoDescription',
      errors,
    ),
  }
}

function resolvePostFields(
  input: PostDraftInput,
  canonicalOriginInput: string | undefined,
  errors: string[],
): ResolvedPostFields {
  const slug = text(input.slug, 'slug', errors)
  const title = text(input.title, 'title', errors)
  const excerpt = text(input.excerpt, 'excerpt', errors)
  const author = text(input.author, 'author', errors)
  const publishedAt = text(input.publishedAt, 'publishedAt', errors)
  const canonicalOrigin = (
    canonicalOriginInput ?? 'https://www.publisher.com'
  ).replace(/\/$/, '')
  return {
    slug,
    title,
    excerpt,
    bodyHtml: sanitizeBodyHtml(text(input.bodyHtml, 'bodyHtml', errors)),
    author,
    authorSlug: text(
      input.authorSlug ??
        author
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
      'authorSlug',
      errors,
    ),
    ...resolveSeo(input, title, excerpt, errors),
    publishedAt,
    status: input.status ?? 'draft',
    canonicalOrigin,
    sourceId: text(input.sourceId ?? `admin-${slug}`, 'sourceId', errors),
    sourceUrl: text(
      input.sourceUrl ??
        `${canonicalOrigin}${publicPostPath({ publishedAt, slug })}`,
      'sourceUrl',
      errors,
    ),
  }
}

function validatePostFields(
  fields: ResolvedPostFields,
  allowedAuthorSlugs: readonly string[] | undefined,
  errors: string[],
): void {
  if (fields.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug))
    errors.push(
      'slug must contain lowercase letters, numbers, and hyphens only',
    )
  if (
    fields.authorSlug &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.authorSlug)
  )
    errors.push(
      'authorSlug must contain lowercase letters, numbers, and hyphens only',
    )
  if (allowedAuthorSlugs && !allowedAuthorSlugs.includes(fields.authorSlug))
    errors.push(`unsupported author: ${fields.authorSlug}`)
  if (fields.seoTitle.length > 70)
    errors.push('seoTitle must be 70 characters or fewer')
  if (fields.seoDescription.length > 180)
    errors.push('seoDescription must be 180 characters or fewer')
  if (fields.publishedAt && Number.isNaN(Date.parse(fields.publishedAt)))
    errors.push('publishedAt must be an ISO date')
  if (!['draft', 'review', 'scheduled', 'published'].includes(fields.status))
    errors.push('status must be draft, review, scheduled, or published')
  try {
    const parsed = new URL(fields.sourceUrl)
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== fields.canonicalOrigin
    )
      errors.push('sourceUrl must use the publication canonical origin')
  } catch {
    errors.push('sourceUrl must be a valid URL')
  }
}

function validatedCategories(
  input: PostDraftInput,
  allowed: readonly string[],
  errors: string[],
): string[] {
  if (!Array.isArray(input.categories) || input.categories.length === 0)
    errors.push('at least one category is required')
  const categories = Array.isArray(input.categories)
    ? [...new Set(input.categories.map(String))]
    : []
  for (const category of categories)
    if (!allowed.includes(category))
      errors.push(`unsupported category: ${category}`)
  if (
    input.imageUrl !== undefined &&
    input.imageUrl !== '' &&
    !input.imageUrl.startsWith('/media/') &&
    !input.imageUrl.startsWith('https://')
  )
    errors.push('imageUrl must be a local media path or HTTPS URL')
  return categories
}

export function resolveValidatedPost(
  input: PostDraftInput,
  allowed: readonly string[],
  context: {
    readonly canonicalOrigin?: string
    readonly allowedAuthorSlugs?: readonly string[]
  },
): {
  fields: ResolvedPostFields
  categories: string[]
  tags: string[]
  errors: string[]
} {
  const errors: string[] = []
  validateFeaturedRank(input.featuredRank, errors)
  const fields = resolvePostFields(input, context.canonicalOrigin, errors)
  validatePostFields(fields, context.allowedAuthorSlugs, errors)
  return {
    fields,
    categories: validatedCategories(input, allowed, errors),
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(String))] : [],
    errors,
  }
}
