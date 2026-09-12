import snapshot from './data/posts.json'
import taxonomy from './data/taxonomy.json'
import publicationData from './data/publication.json'
import authorsData from './data/authors.json'
import articlesData from './data/articles.json'
import pluginsData from './data/plugins.json'
import type {
  AuthorProfile,
  Article,
  ArticleVariant,
  NewsPost,
  PublicationSettings,
  SitePage,
  TaxonomyTerm,
} from './types'
import { articleFromPost, defaultVariant } from './article-adapter'
import { publicArchiveMonthPath, publicPostPath } from './public-paths'
import {
  isRecord,
  parseArticle,
  parsePost,
  parsePublicPluginSnapshot,
  requiredString,
} from './seed-parsers'

if (!isRecord(snapshot) || !Array.isArray(snapshot.posts))
  throw new Error('Invalid content snapshot root')

export const posts: readonly NewsPost[] = snapshot.posts.map(parsePost)
export const publication: PublicationSettings = {
  ...publicationData,
  themeId: requiredString(publicationData.themeId, 'themeId'),
}
function persistedArticle(value: unknown): Article | undefined {
  return parseArticle(value)
}

const persistedArticles = Array.isArray(articlesData)
  ? articlesData
      .map(persistedArticle)
      .filter((article): article is Article => Boolean(article))
  : []
export const articles: readonly Article[] =
  persistedArticles.length > 0
    ? persistedArticles
    : posts.map((post) => articleFromPost(post, publication.locale))
export const authors: readonly AuthorProfile[] = (
  authorsData as readonly unknown[]
).map((author) => {
  if (!isRecord(author)) throw new Error('Invalid author fixture')
  return {
    slug: requiredString(author.slug, 'author.slug'),
    name: requiredString(author.name, 'author.name'),
    bio: requiredString(author.bio, 'author.bio'),
    active: author.active === true,
    avatarUrl:
      typeof author.avatarUrl === 'string' && author.avatarUrl.length > 0
        ? author.avatarUrl
        : undefined,
  }
})
export const tags: readonly TaxonomyTerm[] = (
  taxonomy as readonly unknown[]
).map((term) => {
  if (!isRecord(term)) throw new Error('Invalid taxonomy fixture')
  return {
    slug: requiredString(term.slug, 'taxonomy.slug'),
    name: requiredString(term.name, 'taxonomy.name'),
    active: term.active === true,
  }
})
export const categories: readonly string[] = tags
  .filter((tag) => tag.active)
  .map((tag) => tag.slug)

export const publicPluginSnapshot = parsePublicPluginSnapshot(pluginsData)

export const pages: readonly SitePage[] = [
  {
    slug: 'about',
    title: `About ${publication.name}`,
    body: `${publication.name} ${publication.description}`,
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    body: 'Contact form delivery will be connected to the admin inbox service in a later implementation phase.',
  },
]

export function getPost(slug: string): NewsPost | undefined {
  return posts.find((post) => post.slug === slug)
}

export function getArticle(id: string): Article | undefined {
  return articles.find((article) => article.id === id)
}

export function getArticleVariant(
  locale: string,
  slug: string,
): { article: Article; variant: ArticleVariant } | undefined {
  for (const article of articles) {
    const variant = article.variants.find(
      (candidate) =>
        candidate.locale === locale &&
        candidate.slug === slug &&
        candidate.status === 'published',
    )
    if (variant) return { article, variant }
  }
  return undefined
}

export function getArticleVariantPath(
  article: Article,
  variant: ArticleVariant,
): string {
  const published = variant.publishedAt.slice(0, 7).split('-')
  if (variant.locale === publication.locale)
    return `/${published[0]}/${published[1]}/${variant.slug}.html`
  return `/locale/${variant.locale}/article/${published[0]}/${published[1]}/${variant.slug}.html`
}

export function getPublishedVariants(
  article: Article,
): readonly ArticleVariant[] {
  return article.variants.filter((variant) => variant.status === 'published')
}

export function getPostsByCategory(category: string): readonly NewsPost[] {
  return posts.filter((post) => post.categories.includes(category))
}

export function getAuthor(slug: string): AuthorProfile | undefined {
  return authors.find((author) => author.slug === slug)
}

export function getPostsByAuthor(slug: string): readonly NewsPost[] {
  return posts.filter((post) => post.authorSlug === slug)
}

export function getTag(slug: string): TaxonomyTerm | undefined {
  return tags.find((tag) => tag.slug.toLowerCase() === slug.toLowerCase())
}

export function getPostPath(post: NewsPost): string {
  return publicPostPath(post)
}

export interface ArchiveMonth {
  readonly path: string
  readonly year: string
  readonly month: string
  readonly count: number
}

export function getArchiveMonths(): readonly ArchiveMonth[] {
  const counts = new Map<string, number>()
  for (const post of posts) {
    const key = post.publishedAt.slice(0, 7)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, count]) => {
      const [year, month] = key.split('-')
      return {
        path: publicArchiveMonthPath(`${year}-${month}`),
        year,
        month,
        count,
      }
    })
}

export function getArchivePaths(): readonly string[] {
  return [
    ...new Set(posts.map((post) => publicArchiveMonthPath(post.publishedAt))),
  ]
}
