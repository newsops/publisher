import {
  renderAdapterContributions,
  type PublicAdapterSnapshot,
} from '@publisher/content'
import type { ArticleDocument, PublicationInputs } from './static-types'
import { consentCssPath } from './static-consent-style'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderAdapterHead(
  snapshot: PublicAdapterSnapshot | undefined,
): string {
  if (!snapshot) return ''
  const contributions = renderAdapterContributions(snapshot)
  return contributions.head
    .map((token) =>
      token.kind === 'meta'
        ? `<meta name="${escapeHtml(token.name ?? '')}" content="${escapeHtml(token.content ?? '')}">`
        : `<script${token.async === false ? '' : ' async'} src="${escapeHtml(token.src ?? '')}"></script>`,
    )
    .join('')
}

export function renderHead(
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
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(documentTitle)}</title>${metadata}${socialMetadata}<link rel="canonical" href="${escapeHtml(canonical)}"><link rel="stylesheet" href="${escapeHtml(baselinePath)}"><link rel="stylesheet" href="/theme-runtime/current.css"><link rel="stylesheet" href="${consentCssPath}"><script src="/site-runtime/consent.v1.js" defer></script>${renderAdapterHead(input.adapters)}`
}
