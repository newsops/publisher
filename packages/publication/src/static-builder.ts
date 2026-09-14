import type { ArtifactRecipe } from './release-manifest'
import {
  appendArticleRecipes,
  expectedCommentPaths,
} from './static-article-recipes'
import {
  appendMediaRecipes,
  createBasePublicationGraph,
} from './static-core-recipes'
import { createStaticIndexRecipes, staticIndexPaths } from './static-indexes'
import { validatePopularityProjection } from './projections'
import { appendRuntimeRecipes } from './static-runtime-recipes'
import type {
  ArticleDocument,
  PublicationGraph,
  PublicationInputs,
} from './static-types'

export {
  BASELINE_CSP,
  DEFAULT_BASELINE_CSS,
  PUBLICATION_BASELINE_VERSION,
  PUBLICATION_RUNTIME_VERSION,
  PUBLICATION_SEMANTIC_VERSION,
} from './static-policy'
export type {
  ArticleDocument,
  MaterializedMedia,
  PublicationGraph,
  PublicationInputs,
  PublicationProjection,
  ThemeBundle,
} from './static-types'

export function createPublicationRecipes(
  input: PublicationInputs,
): PublicationGraph {
  if (input.popular) validatePopularityProjection(input.popular)
  const graph = createBasePublicationGraph(input)
  appendMediaRecipes(input, graph.dependencies, graph.recipes)
  appendArticleRecipes(
    input,
    graph.baselinePath,
    graph.dependencies,
    graph.recipes,
  )
  const indexes = createStaticIndexRecipes(input, graph.baselinePath)
  Object.assign(graph.dependencies, indexes.dependencies)
  graph.recipes.push(...indexes.recipes)
  appendRuntimeRecipes(input, indexes, graph.dependencies, graph.recipes)
  assertCompletePublicationGraph(input, graph.recipes, indexes.requiredPaths)
  return { dependencies: graph.dependencies, recipes: graph.recipes }
}

export function assertCompletePublicationGraph(
  input: PublicationInputs,
  recipes: readonly ArtifactRecipe[],
  indexPaths: readonly string[] = staticIndexPaths(input),
): void {
  const paths = recipes.map((recipe) => recipe.path)
  if (new Set(paths).size !== paths.length)
    throw new Error('Publication graph contains a duplicate artifact path')
  const expected = [
    ...input.articles.map((article) => article.path),
    ...expectedCommentPaths(input),
    ...(input.media ?? []).map((media) => media.publicPath),
    ...indexPaths,
    '/feed.xml',
    '/_headers',
    '/theme-runtime/current.css',
    '/.well-known/publisher/release-policy.json',
  ]
  for (const expectedPath of new Set(expected))
    if (!paths.includes(expectedPath))
      throw new Error(
        `Publication graph omitted required artifact: ${expectedPath}`,
      )
  for (const article of input.articles) {
    if (article.imageUrl && !paths.includes(article.imageUrl))
      throw new Error(
        `Article references media outside the release: ${article.imageUrl}`,
      )
    if (article.imageUrl && !article.imageAlt?.trim())
      throw new Error(
        `Article image requires alternative text: ${article.path}`,
      )
  }
  if (!recipes.some((recipe) => recipe.kind === 'theme'))
    throw new Error('Publication graph omitted theme assets')
  if (!recipes.some((recipe) => recipe.kind === 'runtime'))
    throw new Error('Publication graph omitted runtime assets')
}

export function createScaleFixture(count = 1_000): readonly ArticleDocument[] {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(4, '0')
    return {
      id: `article-${number}`,
      path: `/2026/09/article-${number}.html`,
      slug: `article-${number}`,
      title: `Article ${number}`,
      seoTitle: `Article ${number}`,
      description: `Description ${number}`,
      bodyHtml: `<h2>Section ${number}</h2><p>Body ${number}</p>`,
      authorName: 'Fixture Author',
      authorPath: '/author/fixture/',
      category: 'Technology',
      categoryPath: '/search/label/Technology/',
      archivePath: '/2026/09/',
      publishedAt: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      updatedAt: '2026-09-11T00:00:00.000Z',
    }
  })
}
