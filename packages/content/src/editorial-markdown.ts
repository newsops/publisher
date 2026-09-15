import sanitizeHtml from 'sanitize-html'
import { unified } from 'unified'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkStringify from 'remark-stringify'
import rehypeStringify from 'rehype-stringify'
import { directiveToMarkdown } from 'mdast-util-directive'
import type { Root } from 'mdast'

export class EditorialMarkdownError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EditorialMarkdownError'
    this.code = code
  }
}

/** A controlled pre-release import error; it is never an editor write fallback. */
export class EditorialMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorialMigrationError'
  }
}

export interface FigureAttribution {
  readonly src: string
  readonly alt: string
  readonly caption?: string
  readonly credit?: Readonly<{ name: string; url?: string }>
}

export interface EditorialDocument {
  readonly version: 1
  readonly markdown: string
  readonly nodes: readonly EditorialNode[]
  readonly figures: readonly FigureAttribution[]
  readonly embeds: readonly EditorialEmbed[]
}

/**
 * The stable, non-executable editorial AST surface. It is derived from
 * canonical Markdown and is intentionally not a database identity.
 */
export interface EditorialNode {
  readonly type:
    | 'paragraph'
    | 'heading'
    | 'list'
    | 'blockquote'
    | 'code'
    | 'thematicBreak'
    | 'figure'
    | 'embed'
}

export interface EditorialEmbed {
  readonly provider: 'x'
  readonly url: string
  readonly quote?: string
  readonly authorName?: string
}

function fail(code: string, message: string): never {
  throw new EditorialMarkdownError(code, message)
}

function text(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const value = node as { value?: unknown; children?: unknown[] }
  if (typeof value.value === 'string') return value.value
  return (value.children ?? []).map(text).join('')
}

function safeFigureSource(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    return fail('invalid_figure', 'figure src is required')
  const src = value.trim()
  if (src.startsWith('/media/')) return src
  try {
    if (new URL(src).protocol === 'https:') return src
  } catch {
    // The named validation error below is the public contract.
  }
  return fail('unsafe_url', 'figure src must be a /media/ path or HTTPS URL')
}

function safeCredit(value: unknown, name: string | undefined) {
  if (value === undefined) return name ? { name } : undefined
  if (typeof value !== 'string')
    return fail('invalid_figure', 'figure creditUrl must be a string')
  try {
    if (new URL(value).protocol === 'https:')
      return name ? { name, url: value } : undefined
  } catch {
    // The named validation error below is the public contract.
  }
  return fail('unsafe_url', 'figure creditUrl must use HTTPS')
}

function safeLinkUrl(value: unknown): void {
  if (typeof value !== 'string' || !value.trim())
    fail('unsafe_url', 'link URL is required')
  const href = value.trim()
  if (href.startsWith('/')) return
  try {
    if (new URL(href).protocol === 'https:') return
  } catch {
    // The named validation error below is the public contract.
  }
  fail('unsafe_url', 'link URLs must be relative paths or HTTPS URLs')
}

type MarkdownAstNode = {
  type?: unknown
  name?: unknown
  url?: unknown
  children?: readonly MarkdownAstNode[]
  attributes?: Record<string, unknown>
}

function validateInlineNodes(
  nodes: readonly MarkdownAstNode[] | undefined,
): void {
  for (const node of nodes ?? []) {
    if (node.type === 'html')
      fail('raw_html', 'raw HTML is not allowed in bodyMarkdown')
    if (typeof node.type === 'string' && node.type.includes('Directive'))
      fail(
        'unsupported_directive',
        'directives must be top-level editorial blocks',
      )
    if (node.type === 'link') safeLinkUrl(node.url)
    if (node.type === 'image' || node.type === 'imageReference')
      fail(
        'unsupported_node',
        'use an attributed figure directive instead of Markdown image syntax',
      )
    validateInlineNodes(node.children)
  }
}

function parseMarkdownAst(markdown: string): Root {
  return unified().use(remarkParse).use(remarkDirective).parse(markdown)
}

function serializeMarkdownAst(tree: Root): string {
  return String(
    unified()
      .data('toMarkdownExtensions', [directiveToMarkdown()])
      .use(remarkStringify)
      .stringify(tree),
  ).trim()
}

export function parseEditorialMarkdown(markdown: string): EditorialDocument {
  if (typeof markdown !== 'string' || !markdown.trim())
    return fail('invalid_document', 'bodyMarkdown is required')
  if (/<\/?[a-z][^>]*>/i.test(markdown))
    return fail('raw_html', 'raw HTML is not allowed in bodyMarkdown')
  const tree = parseMarkdownAst(markdown)
  const figures: FigureAttribution[] = []
  const embeds: EditorialEmbed[] = []
  const nodes: EditorialNode[] = []
  for (const node of tree.children ?? []) {
    if (!node || typeof node !== 'object') continue
    const directive = node as MarkdownAstNode
    if (
      typeof directive.type === 'string' &&
      directive.type.includes('Directive') &&
      directive.type !== 'containerDirective'
    )
      fail(
        'unsupported_directive',
        'only block figure and embed directives are supported',
      )
    if (directive.type !== 'containerDirective') {
      const type = directive.type
      if (
        type !== 'paragraph' &&
        type !== 'heading' &&
        type !== 'list' &&
        type !== 'blockquote' &&
        type !== 'code' &&
        type !== 'thematicBreak'
      )
        fail('unsupported_node', `unsupported Markdown node: ${String(type)}`)
      validateInlineNodes(directive.children)
      nodes.push({ type })
      continue
    }
    if (directive.name === 'embed') {
      const attrs = directive.attributes ?? {}
      if (attrs.provider !== 'x')
        fail('unsupported_directive', 'only the x embed provider is supported')
      const url = safeFigureSource(attrs.url)
      if (!url.startsWith('https://'))
        fail('unsafe_url', 'embed URL must use HTTPS')
      embeds.push({
        provider: 'x',
        url,
        quote:
          typeof attrs.quote === 'string'
            ? attrs.quote.trim() || undefined
            : undefined,
        authorName:
          typeof attrs.authorName === 'string'
            ? attrs.authorName.trim() || undefined
            : undefined,
      })
      nodes.push({ type: 'embed' })
      continue
    }
    if (directive.name !== 'figure')
      fail(
        'unsupported_directive',
        `unsupported directive: ${directive.name ?? ''}`,
      )
    const attrs = directive.attributes ?? {}
    const alt = typeof attrs.alt === 'string' ? attrs.alt.trim() : ''
    if (!alt) fail('invalid_figure', 'figure alt is required')
    const creditName =
      typeof attrs.creditName === 'string' ? attrs.creditName.trim() : undefined
    figures.push({
      src: safeFigureSource(attrs.src),
      alt,
      caption: text(node).trim() || undefined,
      credit: safeCredit(attrs.creditUrl, creditName || undefined),
    })
    nodes.push({ type: 'figure' })
  }
  return {
    version: 1,
    markdown: serializeMarkdownAst(tree),
    nodes,
    figures,
    embeds,
  }
}

/** Serializes a validated document into canonical, deterministic Markdown. */
export function serializeEditorialMarkdown(
  document: EditorialDocument,
): string {
  const parsed = parseEditorialMarkdown(document.markdown)
  if (parsed.version !== document.version)
    fail('invalid_document', 'unsupported editorial document version')
  return parsed.markdown
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character] as string
  })
}

export function figureDirective(figure: FigureAttribution): string {
  const attributes = [
    `src="${figure.src.replaceAll('"', '\\"')}"`,
    `alt="${figure.alt.replaceAll('"', '\\"')}"`,
    ...(figure.credit?.name
      ? [`creditName="${figure.credit.name.replaceAll('"', '\\"')}"`]
      : []),
    ...(figure.credit?.url ? [`creditUrl="${figure.credit.url}"`] : []),
  ]
  return `:::figure{${attributes.join(' ')}}\n${figure.caption ?? ''}\n:::`
}

export function renderEditorialMarkdown(markdown: string): string {
  const document = parseEditorialMarkdown(markdown)
  const figures = new Map(
    document.figures.map((figure) => [figure.src, figure]),
  )
  const embeds = new Map(document.embeds.map((embed) => [embed.url, embed]))
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(() => (tree: unknown) => {
      const root = tree as { children?: unknown[] }
      root.children = (root.children ?? []).map((node) => {
        const directive = node as {
          name?: string
          attributes?: { src?: string; url?: string }
        }
        if (directive.name === 'embed') {
          const embed = embeds.get(directive.attributes?.url ?? '')
          if (!embed) return node
          return {
            type: 'html',
            value: `<figure class="publisher-x-post" data-publisher-x-post="true"><blockquote><p>${escapeHtml(embed.quote ?? 'View this post on X.')}</p></blockquote><figcaption><a href="${escapeHtml(embed.url)}">${escapeHtml(embed.authorName ? `${embed.authorName} on X` : 'View source on X')}</a></figcaption></figure>`,
          }
        }
        if (directive.name !== 'figure') return node
        const figure = figures.get(directive.attributes?.src ?? '')
        if (!figure) return node
        const credit = figure.credit
          ? ` <span>Source: ${figure.credit.url ? `<a href="${escapeHtml(figure.credit.url)}">${escapeHtml(figure.credit.name)}</a>` : escapeHtml(figure.credit.name)}</span>`
          : ''
        return {
          type: 'html',
          value: `<figure><img src="${escapeHtml(figure.src)}" alt="${escapeHtml(figure.alt)}" loading="lazy" decoding="async">${figure.caption || credit ? `<figcaption>${escapeHtml(figure.caption ?? '')}${credit}</figcaption>` : ''}</figure>`,
        }
      })
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
  return sanitizeHtml(String(processor.processSync(document.markdown)), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      a: ['href'],
      img: ['src', 'alt', 'loading', 'decoding'],
      figure: ['class', 'data-publisher-x-post'],
    },
    allowedSchemes: ['https'],
    allowProtocolRelative: false,
  }).trim()
}

export function importPreReleaseHtmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || !html.trim())
    throw new EditorialMigrationError('pre-release HTML body is empty')
  if (/<(?:script|style|iframe|object)\b/i.test(html))
    throw new EditorialMigrationError(
      'pre-release HTML contains unsupported executable markup',
    )
  const attribute = (value: string, name: string): string | undefined => {
    const match = new RegExp(
      `\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
      'i',
    ).exec(value)
    return match?.[2]?.trim()
  }
  const supported = html
    .replace(
      /<figure\b[^>]*>\s*<img\b([^>]*)\/?>(?:\s*<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/gi,
      (_match, imageAttributes: string, caption: string | undefined) => {
        const src = attribute(imageAttributes, 'src')
        const alt = attribute(imageAttributes, 'alt')
        if (!src || !alt)
          throw new EditorialMigrationError(
            'pre-release figure requires image src and alternative text',
          )
        return `${figureDirective({
          src,
          alt,
          caption: caption?.replace(/<[^>]+>/g, '').trim() || undefined,
        })}\n\n`
      },
    )
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level, body) =>
        `${'#'.repeat(Math.min(Number(level), 6))} ${body.replace(/<[^>]+>/g, '').trim()}\n\n`,
    )
    .replace(
      /<p[^>]*>([\s\S]*?)<\/p>/gi,
      (_m, body) => `${body.replace(/<[^>]+>/g, '').trim()}\n\n`,
    )
    .trim()
  if (!supported || /<\/?[a-z][^>]*>/i.test(supported))
    throw new EditorialMigrationError(
      'pre-release HTML contains unsupported markup',
    )
  parseEditorialMarkdown(supported)
  return supported
}
