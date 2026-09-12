import {
  publication,
  renderPluginContributions,
  sanitizeBodyHtml,
} from '@publisher/content'
import Link from 'next/link'
import { JsonLd } from './JsonLd'
import SiteChrome, { longDate } from './SiteChrome'
import CommentSection from './CommentSection'
import { PluginSlot } from './plugins/PluginContributions'
import { buildPublicPluginSnapshot } from '../lib/public-plugins'

export interface StaticArticlePresentation {
  readonly title: string
  readonly description: string
  readonly bodyHtml: string
  readonly publishedAt: string
  readonly updatedAt: string
  readonly authorName: string
  readonly authorSlug: string
  readonly categories: readonly string[]
  readonly canonicalPath: string
  readonly imageUrl?: string
  readonly language?: string
  readonly languages?: readonly { locale: string; path: string }[]
  readonly commentSlug?: string
  readonly showRecent?: boolean
}

function ArticleStructuredData({
  article,
}: {
  article: StaticArticlePresentation
}) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.description,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
        inLanguage: article.language,
        author: {
          '@type': 'Person',
          name: article.authorName,
          url: `${publication.canonicalOrigin}/author/${article.authorSlug}/`,
        },
        publisher: {
          '@type': 'Organization',
          name: publication.publisherName,
        },
        image: article.imageUrl
          ? [new URL(article.imageUrl, publication.canonicalOrigin).toString()]
          : undefined,
        mainEntityOfPage: `${publication.canonicalOrigin}${article.canonicalPath}`,
      }}
    />
  )
}

function ArticleHeader({ article }: { article: StaticArticlePresentation }) {
  const category = article.categories[0] ?? 'News'
  return (
    <div className="article-head">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/search/label/${category}`}>{category}</Link>
      </nav>
      <Link className="category" href={`/search/label/${category}`}>
        {category}
      </Link>
      <h1>{article.title}</h1>
      <div className="byline">
        <span>
          By{' '}
          <Link href={`/author/${article.authorSlug}/`}>
            {article.authorName}
          </Link>
        </span>
        <span aria-hidden="true">·</span>
        <span>{longDate(article.publishedAt)}</span>
      </div>
    </div>
  )
}

function ArticleTaxonomy({ article }: { article: StaticArticlePresentation }) {
  return (
    <>
      <div className="article-tags">
        {article.categories.map((category) => (
          <Link key={category} href={`/search/label/${category}`}>
            {category}
          </Link>
        ))}
      </div>
      {article.languages && article.languages.length > 1 ? (
        <nav aria-label="Article languages">
          {article.languages.map((language) => (
            <Link
              key={language.locale}
              href={language.path}
              hrefLang={language.locale}
            >
              {language.locale}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  )
}

export default function StaticArticlePage({
  article,
}: {
  readonly article: StaticArticlePresentation
}) {
  const plugins = renderPluginContributions(buildPublicPluginSnapshot())
  return (
    <SiteChrome>
      <main className="container post-body" lang={article.language}>
        <ArticleStructuredData article={article} />
        <ArticleHeader article={article} />
        <article
          className="prose"
          dangerouslySetInnerHTML={{
            __html: sanitizeBodyHtml(article.bodyHtml),
          }}
        />
        <ArticleTaxonomy article={article} />
        {article.showRecent ? (
          <aside className="sidebar" data-runtime-projection="recent">
            <h2>Recent stories</h2>
            <p>
              <Link href="/recent/">Browse the latest published stories</Link>
            </p>
          </aside>
        ) : null}
        {article.commentSlug ? (
          <CommentSection slug={article.commentSlug} />
        ) : null}
        <PluginSlot slot="article-footer" contributions={plugins} />
        <small>Canonical path: {article.canonicalPath}</small>
      </main>
    </SiteChrome>
  )
}
