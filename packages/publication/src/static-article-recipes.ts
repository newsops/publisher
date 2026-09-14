import type { ArtifactRecipe } from './release-manifest'
import { sanitizeCommentProjection } from './projections'
import { contentDigest } from './static-policy'
import { renderArticleHtml } from './static-renderers'
import type { ArticleDocument, PublicationInputs } from './static-types'

function projectionPaths(slug: string, payload: string) {
  const encodedSlug = encodeURIComponent(slug)
  return {
    pointer: `/data/comments/${encodedSlug}.json`,
    projection:
      `/data/immutable/comments/${encodedSlug}.` +
      `${contentDigest(payload)}.json`,
  }
}

function appendCommentRecipes(
  article: ArticleDocument,
  payload: string,
  commentKey: string,
  recipes: ArtifactRecipe[],
): void {
  const paths = projectionPaths(article.slug, payload)
  recipes.push({
    path: paths.projection,
    kind: 'projection',
    contentType: 'application/json',
    cacheClass: 'immutable',
    dependencyKeys: [commentKey],
    render: (read) => read(commentKey),
  })
  recipes.push({
    path: paths.pointer,
    kind: 'runtime',
    contentType: 'application/json',
    cacheClass: 'runtime-pointer',
    dependencyKeys: [commentKey],
    render: (read) => {
      read(commentKey)
      return JSON.stringify({ schemaVersion: 1, projection: paths.projection })
    },
  })
}

function appendArticleRecipe(
  input: PublicationInputs,
  article: ArticleDocument,
  baselinePath: string,
  dependencies: Record<string, string>,
  recipes: ArtifactRecipe[],
): void {
  const articleKey = `article:${article.id}`
  const commentKey = `comments:${article.slug}`
  const hasProjection = Object.hasOwn(input.comments ?? {}, article.slug)
  const comments = sanitizeCommentProjection(
    input.comments?.[article.slug] ?? [],
  )
  const commentPayload = JSON.stringify(comments)
  dependencies[articleKey] = JSON.stringify(article)
  if (hasProjection || input.embedApprovedComments)
    dependencies[commentKey] = commentPayload
  const keys = [
    articleKey,
    'template:semantic',
    'theme:baseline',
    'site:identity',
    ...(input.embedApprovedComments ? [commentKey] : []),
  ]
  recipes.push({
    path: article.path,
    kind: 'article-html',
    contentType: 'text/html; charset=utf-8',
    cacheClass: 'html',
    dependencyKeys: keys,
    render: (read) => {
      for (const key of keys) read(key)
      return renderArticleHtml(
        input,
        article,
        input.embedApprovedComments ? comments : [],
        baselinePath,
      )
    },
  })
  if (hasProjection)
    appendCommentRecipes(article, commentPayload, commentKey, recipes)
}

export function appendArticleRecipes(
  input: PublicationInputs,
  baselinePath: string,
  dependencies: Record<string, string>,
  recipes: ArtifactRecipe[],
): void {
  for (const article of input.articles)
    appendArticleRecipe(input, article, baselinePath, dependencies, recipes)
  for (const slug of Object.keys(input.comments ?? {}))
    if (!input.articles.some((article) => article.slug === slug))
      throw new Error(`Comment projection has no published article: ${slug}`)
}

export function expectedCommentPaths(
  input: PublicationInputs,
): readonly string[] {
  return input.articles.flatMap((article) => {
    if (!Object.hasOwn(input.comments ?? {}, article.slug)) return []
    const payload = JSON.stringify(
      sanitizeCommentProjection(input.comments?.[article.slug] ?? []),
    )
    return Object.values(projectionPaths(article.slug, payload))
  })
}
