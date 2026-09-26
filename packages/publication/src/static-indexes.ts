import { createHash } from 'node:crypto'
import type { ArtifactRecipe } from './release-manifest'
import {
  escapeXml,
  renderFeedXml,
  renderProjectionPage,
} from './static-renderers'
import {
  editorialShellDependency,
  indexPageDependency,
  projectionPayload,
} from './static-index-data'
import type {
  ArticleDocument,
  PublicationInputs,
  PublicationProjection,
} from './static-types'

export interface StaticIndexGraph {
  readonly dependencies: Readonly<Record<string, string>>
  readonly recipes: readonly ArtifactRecipe[]
  readonly recentDataPath: string
  readonly popularDataPath?: string
  readonly requiredPaths: readonly string[]
}

interface IndexContext {
  readonly input: PublicationInputs
  readonly baselinePath: string
  readonly articles: ReadonlyMap<string, ArticleDocument>
  readonly dependencies: Record<string, string>
  readonly recipes: ArtifactRecipe[]
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function grouped(
  articles: readonly ArticleDocument[],
  pathFor: (article: ArticleDocument) => string,
): ReadonlyMap<string, readonly ArticleDocument[]> {
  const groups = new Map<string, ArticleDocument[]>()
  for (const article of articles) {
    const route = pathFor(article)
    const existing = groups.get(route)
    if (existing) existing.push(article)
    else groups.set(route, [article])
  }
  return groups
}

export function staticIndexPaths(input: PublicationInputs): readonly string[] {
  const paths = new Set<string>(['/', '/recent/', '/search/', '/feed.xml'])
  if (input.popular) paths.add('/popular/')
  for (const article of input.articles) {
    paths.add(article.categoryPath)
    paths.add(article.authorPath)
    paths.add(article.archivePath)
  }
  return [...paths].sort()
}

function addPage(
  context: IndexContext,
  route: string,
  title: string,
  pageArticles: readonly ArticleDocument[],
): void {
  const key = `index:${route}`
  context.dependencies[key] = indexPageDependency(title, pageArticles)
  context.recipes.push({
    path: route,
    kind: 'index-html',
    contentType: 'text/html; charset=utf-8',
    cacheClass: 'html',
    dependencyKeys: [
      key,
      'index:editorial-shell',
      'template:semantic',
      'theme:baseline',
      'site:identity',
    ],
    render: (read) => {
      read(key)
      read('index:editorial-shell')
      read('template:semantic')
      read('theme:baseline')
      read('site:identity')
      return renderProjectionPage(
        context.input,
        title,
        route,
        pageArticles.map((article) => article.slug),
        context.articles,
        context.baselinePath,
      )
    },
  })
}

function projectionArticles(
  projection: PublicationProjection,
  articles: ReadonlyMap<string, ArticleDocument>,
): readonly ArticleDocument[] {
  return projection.slugs
    .map((slug) => articles.get(slug))
    .filter((article): article is ArticleDocument => Boolean(article))
}

function addProjection(
  context: IndexContext,
  name: 'recent' | 'popular',
  projection: PublicationProjection,
): string {
  const key = `projection:${name}`
  const payload = JSON.stringify(
    projectionPayload(projection, context.articles),
  )
  context.dependencies[key] = payload
  const dataPath = `/data/immutable/${name}.${digest(payload)}.json`
  context.recipes.push({
    path: dataPath,
    kind: 'projection',
    contentType: 'application/json',
    cacheClass: 'immutable',
    dependencyKeys: [key],
    render: (read) => read(key),
  })
  return dataPath
}

function addGroupedPages(context: IndexContext): void {
  const { input } = context
  for (const [route, items] of grouped(
    input.articles,
    (article) => article.categoryPath,
  ))
    addPage(context, route, `Category: ${items[0]!.category}`, items)
  for (const [route, items] of grouped(
    input.articles,
    (article) => article.authorPath,
  ))
    addPage(context, route, `Author: ${items[0]!.authorName}`, items)
  for (const [route, items] of grouped(
    input.articles,
    (article) => article.archivePath,
  ))
    addPage(context, route, `Archive: ${route.slice(1, 8)}`, items)
}

function addSearchArtifacts(context: IndexContext): void {
  addPage(context, '/search/', 'Search', context.input.articles)
  context.dependencies['metadata:search'] = JSON.stringify(
    context.input.articles.map(
      ({ slug, path, title, description, category }) => ({
        slug,
        path,
        title,
        description,
        category,
      }),
    ),
  )
  context.recipes.push({
    path: '/search-index.json',
    kind: 'projection',
    contentType: 'application/json',
    cacheClass: 'runtime-pointer',
    dependencyKeys: ['metadata:search'],
    render: (read) => read('metadata:search'),
  })
}

function addFeed(context: IndexContext): void {
  context.dependencies['metadata:feed'] = JSON.stringify(
    context.input.articles.map(({ title, path, publishedAt, description }) => ({
      title,
      path,
      publishedAt,
      description,
    })),
  )
  context.recipes.push({
    path: '/feed.xml',
    kind: 'metadata',
    contentType: 'application/rss+xml; charset=utf-8',
    cacheClass: 'html',
    dependencyKeys: ['metadata:feed', 'site:identity'],
    render: (read) => {
      read('metadata:feed')
      read('site:identity')
      return renderFeedXml(context.input, context.input.articles)
    },
  })
}

function addSitemap(context: IndexContext): void {
  const crawlablePaths = [
    ...staticIndexPaths(context.input).filter((route) => route !== '/feed.xml'),
    ...context.input.articles.map((article) => article.path),
  ]
  const updatedByPath = new Map(
    context.input.articles.map((article) => [article.path, article.updatedAt]),
  )
  context.dependencies['metadata:routes'] = JSON.stringify(
    crawlablePaths.map((route) => ({
      route,
      updatedAt: updatedByPath.get(route) ?? context.input.recent.generatedAt,
    })),
  )
  context.recipes.push({
    path: '/sitemap.xml',
    kind: 'metadata',
    contentType: 'application/xml; charset=utf-8',
    cacheClass: 'html',
    dependencyKeys: ['metadata:routes', 'site:identity'],
    render: (read) => {
      read('metadata:routes')
      read('site:identity')
      const origin = context.input.origin.replace(/\/$/, '')
      return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${crawlablePaths
        .map((route) => {
          const updated =
            updatedByPath.get(route) ?? context.input.recent.generatedAt
          return `<url><loc>${escapeXml(origin + route)}</loc><lastmod>${escapeXml(updated)}</lastmod></url>`
        })
        .join('')}</urlset>`
    },
  })
}

export function createStaticIndexRecipes(
  input: PublicationInputs,
  baselinePath: string,
): StaticIndexGraph {
  const context: IndexContext = {
    input,
    baselinePath,
    articles: new Map(input.articles.map((article) => [article.slug, article])),
    dependencies: {},
    recipes: [],
  }
  context.dependencies['index:editorial-shell'] =
    editorialShellDependency(input)
  const recentArticles = projectionArticles(input.recent, context.articles)
  addPage(context, '/', input.publicationName, recentArticles)
  addPage(context, '/recent/', 'Recent stories', recentArticles)
  const recentDataPath = addProjection(context, 'recent', input.recent)
  let popularDataPath: string | undefined
  if (input.popular) {
    addPage(
      context,
      '/popular/',
      'Popular stories',
      projectionArticles(input.popular, context.articles),
    )
    popularDataPath = addProjection(context, 'popular', input.popular)
  }
  addGroupedPages(context)
  addSearchArtifacts(context)
  addPage(context, '/404.html', 'Page not found', [])
  addFeed(context)
  addSitemap(context)
  return {
    dependencies: context.dependencies,
    recipes: context.recipes,
    recentDataPath,
    popularDataPath,
    requiredPaths: [
      ...staticIndexPaths(input),
      '/404.html',
      '/search-index.json',
      '/sitemap.xml',
    ],
  }
}
