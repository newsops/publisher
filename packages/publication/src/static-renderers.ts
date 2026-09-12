import type { sanitizeCommentProjection } from './projections'
import type { ArticleDocument, PublicationInputs } from './static-types'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderArticleHtml(
  input: PublicationInputs,
  article: ArticleDocument,
  comments: readonly ReturnType<typeof sanitizeCommentProjection>[number][],
  baselinePath: string,
): string {
  const canonical = `${input.origin.replace(/\/$/, '')}${article.path}`
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: {
      '@type': 'Person',
      name: article.authorName,
      url: `${input.origin.replace(/\/$/, '')}${article.authorPath}`,
    },
    publisher: { '@type': 'Organization', name: input.publicationName },
    mainEntityOfPage: canonical,
    image: article.imageUrl
      ? [`${input.origin.replace(/\/$/, '')}${article.imageUrl}`]
      : undefined,
  }).replaceAll('<', '\\u003c')
  const commentMarkup = comments.length
    ? `<ol>${comments
        .map(
          (comment) =>
            `<li><strong>${escapeHtml(comment.authorName)}</strong><p>${escapeHtml(comment.body)}</p></li>`,
        )
        .join('')}</ol>`
    : '<p>Comments load separately and may be unavailable.</p>'
  return `<!doctype html><html lang="${escapeHtml(input.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(article.seoTitle)} | ${escapeHtml(input.publicationName)}</title><meta name="description" content="${escapeHtml(article.description)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(article.seoTitle)}"><meta property="og:description" content="${escapeHtml(article.description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><link rel="stylesheet" href="${escapeHtml(baselinePath)}"><script src="/site-runtime/theme-bootstrap.v1.js" defer></script><script src="/site-runtime/comment-bootstrap.v1.js" defer></script><script type="application/ld+json">${jsonLd}</script></head><body><header><a href="/">${escapeHtml(input.publicationName)}</a><nav aria-label="Essential navigation"><a href="/recent/">Recent</a><a href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a></nav></header><main><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a></nav><article><h1>${escapeHtml(article.title)}</h1><p>By <a href="${escapeHtml(article.authorPath)}">${escapeHtml(article.authorName)}</a></p><p>Published <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(article.publishedAt)}</time> · Updated <time data-updated datetime="${escapeHtml(article.updatedAt)}">${escapeHtml(article.updatedAt)}</time></p>${article.imageUrl ? `<img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt ?? '')}">` : ''}${article.bodyHtml}</article><aside data-runtime-projection="recent"><a href="/recent/">Read recent stories</a></aside><section data-comments="${escapeHtml(article.slug)}"><h2>Comments</h2>${commentMarkup}</section></main></body></html>`
}

export function renderProjectionPage(
  input: PublicationInputs,
  title: string,
  routePath: string,
  slugs: readonly string[],
  articles: ReadonlyMap<string, ArticleDocument>,
  baselinePath: string,
): string {
  const canonical = `${input.origin.replace(/\/$/, '')}${routePath}`
  return `<!doctype html><html lang="${escapeHtml(input.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | ${escapeHtml(input.publicationName)}</title><link rel="canonical" href="${escapeHtml(canonical)}"><link rel="stylesheet" href="${escapeHtml(baselinePath)}"><script src="/site-runtime/theme-bootstrap.v1.js" defer></script></head><body><header><a href="/">${escapeHtml(input.publicationName)}</a><nav aria-label="Essential navigation"><a href="/recent/">Recent</a><a href="/search/">Search</a></nav></header><main><h1>${escapeHtml(title)}</h1><ol>${slugs
    .map((slug) => articles.get(slug))
    .filter((article): article is ArticleDocument => Boolean(article))
    .map(
      (article) =>
        `<li><a href="${escapeHtml(article.path)}">${escapeHtml(article.title)}</a></li>`,
    )
    .join('')}</ol></main></body></html>`
}

export function renderFeedXml(
  input: PublicationInputs,
  articles: readonly ArticleDocument[],
): string {
  const origin = input.origin.replace(/\/$/, '')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(input.publicationName)}</title><link>${escapeXml(origin + '/')}</link><description>${escapeXml(input.publicationName)}</description>${articles
    .map(
      (article) =>
        `<item><title>${escapeXml(article.title)}</title><link>${escapeXml(origin + article.path)}</link><guid>${escapeXml(origin + article.path)}</guid><pubDate>${escapeXml(new Date(article.publishedAt).toUTCString())}</pubDate><description>${escapeXml(article.description)}</description></item>`,
    )
    .join('')}</channel></rss>`
}

export function escapeXml(value: string): string {
  return escapeHtml(value)
}
