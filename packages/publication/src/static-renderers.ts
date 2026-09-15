import type { sanitizeCommentProjection } from './projections'
import type { ArticleDocument, PublicationInputs } from './static-types'

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function longDate(value: string): string {
  const month = LONG_MONTHS[Number(value.slice(5, 7)) - 1]
  if (!month) return value
  return `${month} ${Number(value.slice(8, 10))}, ${value.slice(0, 4)}`
}

function shortDate(value: string): string {
  const month = SHORT_MONTHS[Number(value.slice(5, 7)) - 1]
  if (!month) return value
  return `${month} ${Number(value.slice(8, 10))}, ${value.slice(0, 4)}`
}

function siteSections(
  input: PublicationInputs,
  currentArticle?: ArticleDocument,
): readonly Pick<ArticleDocument, 'category' | 'categoryPath'>[] {
  if (currentArticle) {
    return [
      {
        category: currentArticle.category,
        categoryPath: currentArticle.categoryPath,
      },
    ]
  }
  const sections = new Map<
    string,
    Pick<ArticleDocument, 'category' | 'categoryPath'>
  >()
  for (const article of input.articles) {
    if (!sections.has(article.categoryPath)) {
      sections.set(article.categoryPath, {
        category: article.category,
        categoryPath: article.categoryPath,
      })
    }
  }
  return [...sections.values()].slice(0, 6)
}

function renderHead(
  input: PublicationInputs,
  title: string,
  canonical: string,
  baselinePath: string,
  description?: string,
  article?: ArticleDocument,
): string {
  const documentTitle =
    title === input.publicationName
      ? input.publicationName
      : `${title} | ${input.publicationName}`
  const metadata = description
    ? `<meta name="description" content="${escapeHtml(description)}"><meta property="og:description" content="${escapeHtml(description)}">`
    : ''
  const socialMetadata = article
    ? `<meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(article.seoTitle)}">${article.imageUrl ? `<meta property="og:image" content="${escapeHtml(input.origin.replace(/\/$/, '') + article.imageUrl)}">` : ''}`
    : `<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}">`
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(documentTitle)}</title>${metadata}${socialMetadata}<link rel="canonical" href="${escapeHtml(canonical)}"><link rel="stylesheet" href="${escapeHtml(baselinePath)}"><link rel="stylesheet" href="/theme-runtime/current.css">`
}

function renderSiteHeader(
  input: PublicationInputs,
  currentArticle?: ArticleDocument,
): string {
  const latest = currentArticle ?? input.articles[0]
  const sectionLinks = siteSections(input, currentArticle)
    .map(
      ({ category, categoryPath }) =>
        `<li><a href="${escapeHtml(categoryPath)}">${escapeHtml(category)}</a></li>`,
    )
    .join('')
  const updateLabel = currentArticle ? 'Published' : 'Latest update'
  return `<header class="site-header"><div class="topbar"><div class="container topbar-inner"><span class="topbar-date">${latest ? `${updateLabel} <span aria-hidden="true">·</span> ${escapeHtml(longDate(latest.publishedAt))}` : 'Independent publishing'}</span><nav aria-label="Utility navigation"><ul class="topbar-nav"><li><a href="/recent/">Recent</a></li><li><a href="/feed.xml">RSS</a></li></ul></nav></div></div><div class="main-header container"><a class="brand" href="/">${escapeHtml(input.publicationName)}</a></div><div class="section-nav"><div class="container section-nav-inner"><nav aria-label="Essential navigation"><ul class="main-nav"><li><a href="/">Home</a></li>${sectionLinks}<li><a class="nav-search" href="/search/">Search</a></li></ul></nav></div></div></header>`
}

function renderSiteFooter(
  input: PublicationInputs,
  currentArticle?: ArticleDocument,
): string {
  const sectionLinks = siteSections(input, currentArticle)
    .map(
      ({ category, categoryPath }) =>
        `<a href="${escapeHtml(categoryPath)}">${escapeHtml(category)}</a>`,
    )
    .join('')
  const year = currentArticle
    ? currentArticle.publishedAt.slice(0, 4)
    : input.recent.generatedAt.slice(0, 4)
  return `<footer class="site-footer"><div class="container footer-main"><div class="footer-col"><h2>Sections</h2>${sectionLinks || '<span>No sections yet</span>'}</div><div class="footer-col"><h2>Explore</h2><a href="/recent/">Recent stories</a><a href="/search/">All articles</a></div><div class="footer-col"><h2>Follow</h2><a href="/feed.xml">RSS feed</a></div></div><div class="container footer-bar-inner"><small>© ${escapeHtml(year)} ${escapeHtml(input.publicationName)}</small><a class="to-top" href="#top">Back to top</a></div></footer>`
}

function renderArticleImage(
  article: ArticleDocument,
  className: string,
  eager = false,
): string {
  if (!article.imageUrl) {
    return `<div class="${className} post-image-placeholder" aria-hidden="true"></div>`
  }
  return `<a class="${className}" href="${escapeHtml(article.path)}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(article.imageUrl)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>`
}

function renderStoryCard(article: ArticleDocument): string {
  return `<article class="post-card">${renderArticleImage(article, 'post-image')}<div class="post-copy"><a class="category" href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a><h2 class="post-title"><a href="${escapeHtml(article.path)}">${escapeHtml(article.title)}</a></h2><p class="excerpt">${escapeHtml(article.description)}</p><p class="post-date"><time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(shortDate(article.publishedAt))}</time></p></div></article>`
}

function archiveLabel(path: string): string {
  const match = /^\/(\d{4})\/(\d{2})\/$/.exec(path)
  if (!match) return path
  const month = LONG_MONTHS[Number(match[2]) - 1]
  return month ? `${month} ${match[1]}` : path
}

function renderSidebar(
  input: PublicationInputs,
  pageArticles: readonly ArticleDocument[],
): string {
  const onPage = new Set(pageArticles.map((article) => article.slug))
  const moreStories = input.articles
    .filter((article) => !onPage.has(article.slug))
    .slice(0, 5)
  const archives = new Map<string, number>()
  for (const article of input.articles) {
    archives.set(
      article.archivePath,
      (archives.get(article.archivePath) ?? 0) + 1,
    )
  }
  const storyItems = moreStories
    .map(
      (article) =>
        `<li><span class="rail-stamp">${escapeHtml(shortDate(article.publishedAt))}</span><a href="${escapeHtml(article.path)}">${escapeHtml(article.title)}</a></li>`,
    )
    .join('')
  const archiveItems = [...archives]
    .map(
      ([archivePath, count]) =>
        `<li><a href="${escapeHtml(archivePath)}"><span>${escapeHtml(archiveLabel(archivePath))}</span><span class="archive-count">${count}</span></a></li>`,
    )
    .join('')
  const sectionLinks = siteSections(input)
    .map(
      ({ category, categoryPath }) =>
        `<a href="${escapeHtml(categoryPath)}">${escapeHtml(category)}</a>`,
    )
    .join('')
  return `<aside class="sidebar editorial-rail"><section><h2>Search</h2><form action="/search/" class="field-row"><input type="search" name="q" aria-label="Search articles" placeholder="Search articles"><button type="submit">Go</button></form></section>${storyItems ? `<section><h2>More stories</h2><ul class="rail-list">${storyItems}</ul></section>` : ''}${archiveItems ? `<section><h2>Archive</h2><ul class="archive-list">${archiveItems}</ul></section>` : ''}<section><h2>Sections</h2><div class="sidebar-tags">${sectionLinks || '<span class="sidebar-empty">No sections yet.</span>'}</div></section></aside>`
}

function renderLead(article: ArticleDocument): string {
  return `<article class="lead"><a class="category" href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a><h1 class="lead-title"><a href="${escapeHtml(article.path)}">${escapeHtml(article.title)}</a></h1><p class="lead-excerpt">${escapeHtml(article.description)}</p><p class="post-date"><time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(longDate(article.publishedAt))}</time></p>${renderArticleImage(article, 'lead-figure', true)}</article>`
}

function renderCommentMarkup(
  comments: readonly ReturnType<typeof sanitizeCommentProjection>[number][],
): string {
  if (!comments.length) {
    return '<p class="comments-empty" data-comment-status>Be the first to join the conversation.</p><ol class="comment-list" data-comment-list></ol>'
  }
  return `<p data-comment-status>${comments.length} approved comment${comments.length === 1 ? '' : 's'}</p><ol class="comment-list" data-comment-list>${comments
    .map(
      (comment) =>
        `<li><strong>${escapeHtml(comment.authorName)}</strong><p>${escapeHtml(comment.body)}</p></li>`,
    )
    .join('')}</ol>`
}

function renderCommentSection(
  input: PublicationInputs,
  article: ArticleDocument,
  comments: readonly ReturnType<typeof sanitizeCommentProjection>[number][],
): string {
  const runtime = input.commentRuntime
  const attributes = runtime
    ? ` data-comment-origin="${escapeHtml(runtime.origin)}" data-comment-site="${escapeHtml(runtime.siteId)}" data-comment-submission="${runtime.submissionEnabled ? 'enabled' : 'disabled'}"`
    : ''
  const form =
    runtime?.submissionEnabled && runtime.humanVerification
      ? `<form class="comment-form" data-comment-form><label>Name<input name="authorName" maxlength="80" required></label><label>Comment<textarea name="body" maxlength="2000" required></textarea></label><input type="hidden" name="verificationToken"><div data-human-verification-widget data-human-verification-site-key="${escapeHtml(runtime.humanVerification.siteKey)}" data-human-verification-script-url="${escapeHtml(runtime.humanVerification.scriptUrl)}" data-human-verification-global="${escapeHtml(runtime.humanVerification.globalName)}"></div><p class="comment-verification-note">Complete the configured verification challenge before submitting.</p><p data-human-verification-status aria-live="polite"></p><button type="submit">Submit for moderation</button><p data-comment-submit-status aria-live="polite"></p></form>`
      : ''
  return `<section class="comments" data-comments="${escapeHtml(article.slug)}"${attributes}><h2>Comments</h2>${renderCommentMarkup(comments)}${form}</section>`
}

export function renderArticleHtml(
  input: PublicationInputs,
  article: ArticleDocument,
  comments: readonly ReturnType<typeof sanitizeCommentProjection>[number][],
  baselinePath: string,
): string {
  const origin = input.origin.replace(/\/$/, '')
  const canonical = `${origin}${article.path}`
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
      url: `${origin}${article.authorPath}`,
    },
    publisher: { '@type': 'Organization', name: input.publicationName },
    mainEntityOfPage: canonical,
    image: article.imageUrl ? [`${origin}${article.imageUrl}`] : undefined,
  }).replaceAll('<', '\\u003c')
  const heroImage = article.imageUrl
    ? `<figure class="article-figure"><img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageAlt ?? '')}" fetchpriority="high" decoding="async"></figure>`
    : ''
  const hasCommentProjection =
    input.embedApprovedComments ||
    Object.hasOwn(input.comments ?? {}, article.slug)
  const commentScripts = input.commentRuntime
    ? `<script src="/site-runtime/comments.v1.js" defer></script>${input.commentRuntime.submissionEnabled && input.commentRuntime.humanVerification ? '<script src="/site-runtime/human-verification.v1.js" defer></script>' : ''}`
    : hasCommentProjection
      ? '<script src="/site-runtime/comment-bootstrap.v1.js" defer></script>'
      : ''
  const tags = (article.tags ?? [])
    .map(
      (tag) =>
        `<a href="/search/?tag=${encodeURIComponent(tag)}" rel="tag">${escapeHtml(tag)}</a>`,
    )
    .join('')
  return `<!doctype html><html lang="${escapeHtml(input.language)}"><head>${renderHead(input, article.seoTitle, canonical, baselinePath, article.description, article)}${commentScripts}<script type="application/ld+json">${jsonLd}</script></head><body><div class="site-shell" id="top">${renderSiteHeader(input, article)}<main class="container post-body"><div class="article-head"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a></nav><a class="category" href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a><h1>${escapeHtml(article.title)}</h1><div class="byline"><span>By <a href="${escapeHtml(article.authorPath)}">${escapeHtml(article.authorName)}</a></span><span aria-hidden="true">·</span><span>Published <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(longDate(article.publishedAt))}</time></span><span class="updated-time">Updated <time data-updated datetime="${escapeHtml(article.updatedAt)}">${escapeHtml(longDate(article.updatedAt))}</time></span></div></div>${heroImage}<article class="prose">${article.bodyHtml}</article><div class="article-tags"><a href="${escapeHtml(article.categoryPath)}">${escapeHtml(article.category)}</a>${tags}</div><aside class="article-related" data-runtime-projection="recent"><h2>Recent stories</h2><p><a href="/recent/">Read recent stories</a></p></aside>${renderCommentSection(input, article, comments)}</main>${renderSiteFooter(input, article)}</div></body></html>`
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
  const pageArticles = slugs
    .map((slug) => articles.get(slug))
    .filter((article): article is ArticleDocument => Boolean(article))
  const isHome = routePath === '/'
  const displayTitle = isHome ? 'Latest stories' : title
  const lead = isHome ? pageArticles[0] : undefined
  const feedArticles = lead ? pageArticles.slice(1) : pageArticles
  const headingLevel = lead ? 'h2' : 'h1'
  const emptyMessage =
    routePath === '/404.html'
      ? 'The requested page could not be found.'
      : 'No published articles yet.'
  const feed = feedArticles.length
    ? feedArticles.map(renderStoryCard).join('')
    : `<p class="sidebar-empty">${emptyMessage}</p>`
  const description =
    routePath === '/404.html'
      ? `The requested page could not be found on ${input.publicationName}.`
      : isHome
        ? `Latest reporting from ${input.publicationName}.`
        : `${title} stories from ${input.publicationName}.`
  const noIndex =
    routePath === '/404.html'
      ? '<meta name="robots" content="noindex,follow">'
      : ''
  return `<!doctype html><html lang="${escapeHtml(input.language)}"><head>${renderHead(input, title, canonical, baselinePath, description)}${noIndex}</head><body><div class="site-shell" id="top">${renderSiteHeader(input)}<main class="container content-grid"><div class="primary">${lead ? renderLead(lead) : ''}<section class="${lead ? 'feed-section' : 'index-section'}"><div class="section-heading"><${headingLevel}>${escapeHtml(displayTitle)}</${headingLevel}><a href="/search/">All articles</a></div><div class="post-list" data-variant="${lead ? 'grid' : 'list'}">${feed}</div></section></div>${renderSidebar(input, pageArticles)}</main>${renderSiteFooter(input)}</div></body></html>`
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
