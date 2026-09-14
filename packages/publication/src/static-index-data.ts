import type {
  ArticleDocument,
  PublicationInputs,
  PublicationProjection,
} from './static-types'

export function projectionPayload(
  projection: PublicationProjection,
  articles: ReadonlyMap<string, ArticleDocument>,
): PublicationProjection & {
  readonly items: readonly Pick<
    ArticleDocument,
    'slug' | 'path' | 'title' | 'description' | 'publishedAt' | 'updatedAt'
  >[]
} {
  return {
    ...projection,
    items: projection.slugs
      .map((slug) => articles.get(slug))
      .filter((article): article is ArticleDocument => Boolean(article))
      .map(({ slug, path, title, description, publishedAt, updatedAt }) => ({
        slug,
        path,
        title,
        description,
        publishedAt,
        updatedAt,
      })),
  }
}

export function indexPageDependency(
  title: string,
  articles: readonly ArticleDocument[],
): string {
  return JSON.stringify({
    title,
    articles: articles.map(
      ({
        slug,
        path,
        title: itemTitle,
        description,
        category,
        categoryPath,
        archivePath,
        publishedAt,
        imageUrl,
      }) => ({
        slug,
        path,
        title: itemTitle,
        description,
        category,
        categoryPath,
        archivePath,
        publishedAt,
        imageUrl,
      }),
    ),
  })
}

export function editorialShellDependency(input: PublicationInputs): string {
  return JSON.stringify({
    copyrightYear: input.recent.generatedAt.slice(0, 4),
    articles: input.articles.map(
      ({
        slug,
        path,
        title,
        category,
        categoryPath,
        archivePath,
        publishedAt,
      }) => ({
        slug,
        path,
        title,
        category,
        categoryPath,
        archivePath,
        publishedAt,
      }),
    ),
  })
}
