import sanitizeHtml from 'sanitize-html'
import { unified } from 'unified'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

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
  readonly figures: readonly FigureAttribution[]
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

export function parseEditorialMarkdown(markdown: string): EditorialDocument {
  if (typeof markdown !== 'string' || !markdown.trim())
    return fail('invalid_document', 'bodyMarkdown is required')
  if (/<\/?[a-z][^>]*>/i.test(markdown))
    return fail('raw_html', 'raw HTML is not allowed in bodyMarkdown')
  const tree = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .parse(markdown) as { children?: unknown[] }
  const figures: FigureAttribution[] = []
  for (const node of tree.children ?? []) {
    if (!node || typeof node !== 'object') continue
    const directive = node as {
      type?: string
      name?: string
      attributes?: Record<string, unknown>
    }
    if (!directive.type?.includes('Directive')) continue
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
  }
  return { version: 1, markdown: markdown.trim(), figures }
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
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(() => (tree: unknown) => {
      const root = tree as { children?: unknown[] }
      root.children = (root.children ?? []).map((node) => {
        const directive = node as {
          name?: string
          attributes?: { src?: string }
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
    },
    allowedSchemes: ['https'],
    allowProtocolRelative: false,
  }).trim()
}

export function migrateLegacyHtmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || !html.trim())
    throw new EditorialMigrationError('legacy HTML body is empty')
  if (/<(?:script|style|iframe|object)\b/i.test(html))
    throw new EditorialMigrationError(
      'legacy HTML contains unsupported executable markup',
    )
  const supported = html
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
    throw new EditorialMigrationError('legacy HTML contains unsupported markup')
  parseEditorialMarkdown(supported)
  return supported
}
