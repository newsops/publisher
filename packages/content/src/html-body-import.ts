import type { ChildNode, Element } from 'domhandler'
import { parseDocument } from 'htmlparser2'
import {
  EditorialMigrationError,
  directiveAttribute,
  figureDirective,
  parseEditorialMarkdown,
  renderEditorialMarkdown,
} from './editorial-markdown'

/**
 * Converts pre-release CMS/export HTML (Blogger, WordPress, earlier Publisher
 * releases) into the canonical structured Markdown contract.
 *
 * The importer is deliberately tolerant of presentational markup and strict
 * about editorial content: wrappers and styling tags are unwrapped, text is
 * always preserved, and every construct that could carry meaning maps to a
 * supported Markdown block or inline node. Only non-editorial elements
 * (scripts, styles, forms, comments) are dropped. An image without any
 * accessible name and an embed that cannot be expressed as a safe link stop
 * the import with a named error so an editor resolves them explicitly.
 */

const DROPPED_ELEMENTS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'svg',
  'canvas',
  'map',
  'area',
])

const CONTAINER_ELEMENTS = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'center',
  'address',
  'details',
  'summary',
  'dl',
  'dd',
  'dt',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'caption',
  'body',
  'html',
])

const EMBED_ELEMENTS = new Set([
  'iframe',
  'object',
  'embed',
  'video',
  'audio',
  'source',
])

const STATUS_URL =
  /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i

export interface HtmlBodyImportOptions {
  /**
   * Accessible name for images that carry no alt, title, or caption. Trusted
   * boundaries pass the record title, matching the hero-image rule; without
   * a fallback such an image stops the import with a named error.
   */
  readonly imageAltFallback?: string
}

interface Context {
  readonly blocks: string[]
  readonly options: HtmlBodyImportOptions
  /**
   * Figure and embed directives must be top-level blocks. Directives found
   * inside inline-only content (list items, headings, table cells) or inside
   * a blockquote are hoisted here and emitted after the enclosing block.
   */
  readonly hoisted: string[]
  inline: string[]
  inlineOnly: number
  listDepth: number
}

function isElement(node: ChildNode): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style'
}

function attribute(element: Element, name: string): string | undefined {
  const value = element.attribs[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function classes(element: Element): readonly string[] {
  return (attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean)
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const url = value.trim()
  if (url.startsWith('/') && !url.startsWith('//')) return url
  if (/^https:\/\//i.test(url)) return url
  return undefined
}

function directiveValue(value: string): string {
  return directiveAttribute(value.replace(/\s+/g, ' ').trim())
}

function escapeText(value: string): string {
  return (
    value
      .replace(/&(?=[a-z0-9#]+;)/gi, '&amp;')
      .replace(/[\\*_`[\]]/g, (match) => `\\${match}`)
      // "5:00" would otherwise parse as an inline `:00` text directive.
      .replace(/:(?=[a-z0-9])/gi, '\\:')
      .replaceAll('<', '&lt;')
  )
}

function escapeLineStart(line: string): string {
  return line.replace(
    /^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s|---|\*\*\*)/,
    '$1\\$2',
  )
}

function collapse(value: string): string {
  return value.replace(/[ \t\r\f\v]+/g, ' ')
}

function plainText(nodes: readonly ChildNode[]): string {
  return collapse(
    nodes
      .map((node) => {
        if (node.type === 'text') return node.data
        if (isElement(node)) {
          if (node.name === 'br') return ' '
          return plainText(node.children)
        }
        return ''
      })
      .join(''),
  ).trim()
}

function inlineMarkdown(nodes: readonly ChildNode[], context: Context): string {
  const saved = context.inline
  context.inline = []
  context.inlineOnly += 1
  walkInline(nodes, context)
  context.inlineOnly -= 1
  const value = finishInline(context.inline)
  context.inline = saved
  return value
}

function drainHoisted(context: Context): void {
  if (context.inlineOnly > 0) return
  context.blocks.push(...context.hoisted.splice(0))
}

function finishInline(parts: readonly string[]): string {
  return collapse(parts.join(''))
    .split('\n')
    .map((line) => escapeLineStart(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function flushInline(context: Context): void {
  const text = finishInline(context.inline)
  context.inline = []
  if (!text) return
  for (const paragraph of text.split(/\n\s*\n/)) {
    const lines = paragraph.trim().split('\n')
    if (lines.length === 0 || !lines.join('')) continue
    context.blocks.push(lines.join('  \n'))
  }
  drainHoisted(context)
}

function pushBlock(context: Context, block: string): void {
  flushInline(context)
  if (block.trim()) context.blocks.push(block)
  drainHoisted(context)
}

function pushDirective(context: Context, directive: string): void {
  if (context.inlineOnly > 0) {
    context.hoisted.push(directive)
    return
  }
  pushBlock(context, directive)
}

function walkInline(nodes: readonly ChildNode[], context: Context): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      context.inline.push(escapeText(node.data))
      continue
    }
    if (!isElement(node)) continue
    walkElement(node, context)
  }
}

function figureFromImage(
  image: Element,
  caption: string | undefined,
  context: Context,
): string {
  const src = safeUrl(attribute(image, 'src') ?? attribute(image, 'data-src'))
  if (!src)
    throw new EditorialMigrationError(
      'imported image requires a relative or HTTPS src',
    )
  const alt =
    attribute(image, 'alt') ??
    attribute(image, 'title') ??
    caption?.trim() ??
    context.options.imageAltFallback?.trim()
  if (!alt)
    throw new EditorialMigrationError(
      'imported image requires alternative text, a title, or a caption',
    )
  return figureDirective({
    src,
    alt: collapse(alt),
    caption: caption?.trim() || undefined,
    credit: undefined,
  })
}

function findFirst(
  nodes: readonly ChildNode[],
  predicate: (element: Element) => boolean,
): Element | undefined {
  for (const node of nodes) {
    if (!isElement(node)) continue
    if (predicate(node)) return node
    const nested = findFirst(node.children, predicate)
    if (nested) return nested
  }
  return undefined
}

function findAll(
  nodes: readonly ChildNode[],
  predicate: (element: Element) => boolean,
): Element[] {
  const found: Element[] = []
  for (const node of nodes) {
    if (!isElement(node)) continue
    if (predicate(node)) found.push(node)
    found.push(...findAll(node.children, predicate))
  }
  return found
}

function embedDirective(
  url: string,
  quote: string | undefined,
  authorName: string | undefined,
): string {
  const attributes = [`provider="x"`, `url="${directiveValue(url)}"`]
  if (quote) attributes.push(`quote="${directiveValue(quote)}"`)
  if (authorName) attributes.push(`authorName="${directiveValue(authorName)}"`)
  return `:::embed{${attributes.join(' ')}}\n:::`
}

function xPostEmbed(element: Element): string | undefined {
  const isPublisherPost =
    element.name === 'figure' && classes(element).includes('publisher-x-post')
  const isTwitterBlockquote =
    element.name === 'blockquote' && classes(element).includes('twitter-tweet')
  if (!isPublisherPost && !isTwitterBlockquote) return undefined
  const links = findAll(element.children, (node) => node.name === 'a')
  const statusLink = links
    .map((link) => attribute(link, 'href'))
    .find((href): href is string => Boolean(href && STATUS_URL.test(href)))
  if (!statusLink)
    throw new EditorialMigrationError(
      'imported X post embed requires a status URL',
    )
  const quoteSource = isPublisherPost
    ? findFirst(element.children, (node) => node.name === 'blockquote')
    : element
  const quote = quoteSource
    ? plainText(
        quoteSource.children.filter(
          (node) => !isElement(node) || node.name !== 'a',
        ),
      )
    : undefined
  let authorName: string | undefined
  if (isPublisherPost) {
    const caption = findFirst(
      element.children,
      (node) => node.name === 'figcaption',
    )
    authorName = caption
      ? plainText(caption.children).replace(/\s+on X$/i, '')
      : undefined
  } else {
    const match = /—\s*([^(\n]+?)\s*\(@[A-Za-z0-9_]+\)/.exec(
      plainText(element.children),
    )
    authorName = match?.[1]?.trim()
  }
  const trimmedQuote = quote
    ?.replace(/\s*—\s*[^(\n]+?\s*\(@[A-Za-z0-9_]+\)\s*$/, '')
    .trim()
  return embedDirective(
    statusLink,
    trimmedQuote || undefined,
    authorName || undefined,
  )
}

function listMarkdown(list: Element, context: Context): string {
  const ordered = list.name === 'ol'
  const indent = '  '.repeat(context.listDepth)
  const items = list.children.filter(
    (node): node is Element => isElement(node) && node.name === 'li',
  )
  const lines: string[] = []
  items.forEach((item, index) => {
    const nested = item.children.filter(
      (node): node is Element =>
        isElement(node) && (node.name === 'ul' || node.name === 'ol'),
    )
    const own = item.children.filter(
      (node) => !nested.includes(node as Element),
    )
    const text = inlineMarkdown(own, context).replace(/\n+/g, ' ').trim()
    const marker = ordered ? `${index + 1}.` : '-'
    lines.push(`${indent}${marker} ${text || ' '}`)
    context.listDepth += 1
    for (const child of nested) lines.push(listMarkdown(child, context))
    context.listDepth -= 1
  })
  return lines.join('\n')
}

function blockquoteMarkdown(element: Element, context: Context): string {
  const inner = convertBlocks(
    element.children,
    context.options,
    context.hoisted,
  )
  return inner
    .join('\n\n')
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
}

function walkElement(element: Element, context: Context): void {
  const name = element.name.toLowerCase()
  if (DROPPED_ELEMENTS.has(name)) return
  if (name === 'br') {
    context.inline.push('\n')
    return
  }
  const embed = xPostEmbed(element)
  if (embed) {
    pushDirective(context, embed)
    return
  }
  if (EMBED_ELEMENTS.has(name)) {
    const src = safeUrl(attribute(element, 'src') ?? attribute(element, 'data'))
    if (src) pushBlock(context, `[Embedded content](${src})`)
    else if (name === 'video' || name === 'audio' || name === 'object')
      walkInline(element.children, context)
    return
  }
  if (name === 'img') {
    pushDirective(context, figureFromImage(element, undefined, context))
    return
  }
  if (name === 'figure') {
    const image = findFirst(element.children, (node) => node.name === 'img')
    if (image) {
      const captionElement = findFirst(
        element.children,
        (node) => node.name === 'figcaption',
      )
      const caption = captionElement
        ? inlineMarkdown(captionElement.children, context).replace(/\n+/g, ' ')
        : undefined
      pushDirective(context, figureFromImage(image, caption, context))
      return
    }
    flushInline(context)
    walkInline(element.children, context)
    flushInline(context)
    return
  }
  if (name === 'a') {
    const image = findFirst(element.children, (node) => node.name === 'img')
    if (image && !plainText(element.children)) {
      pushDirective(context, figureFromImage(image, undefined, context))
      return
    }
    const href = safeUrl(attribute(element, 'href'))
    const text = inlineMarkdown(element.children, context).replace(/\n+/g, ' ')
    if (!text) return
    context.inline.push(
      href
        ? `[${text}](${href.replace(/[()\s]/g, (match) => encodeURIComponent(match))})`
        : text,
    )
    return
  }
  if (/^h[1-6]$/.test(name)) {
    const level = Number(name.slice(1))
    const text = inlineMarkdown(element.children, context).replace(/\n+/g, ' ')
    if (text) pushBlock(context, `${'#'.repeat(level)} ${text}`)
    return
  }
  if (name === 'ul' || name === 'ol') {
    pushBlock(context, listMarkdown(element, context))
    return
  }
  if (name === 'li') {
    pushBlock(context, inlineMarkdown(element.children, context))
    return
  }
  if (name === 'blockquote') {
    pushBlock(context, blockquoteMarkdown(element, context))
    return
  }
  if (name === 'pre') {
    const code = plainCode(element.children)
    if (code.trim())
      pushBlock(context, `\`\`\`\n${code.replace(/\n+$/, '')}\n\`\`\``)
    return
  }
  if (name === 'hr') {
    pushBlock(context, '---')
    return
  }
  if (name === 'tr') {
    const cells = element.children
      .filter(
        (node): node is Element =>
          isElement(node) && (node.name === 'td' || node.name === 'th'),
      )
      .map((cell) =>
        inlineMarkdown(cell.children, context).replace(/\n+/g, ' '),
      )
      .filter(Boolean)
    if (cells.length) pushBlock(context, cells.join(' | '))
    return
  }
  if (CONTAINER_ELEMENTS.has(name)) {
    flushInline(context)
    walkInline(element.children, context)
    flushInline(context)
    return
  }
  if (name === 'strong' || name === 'b') {
    const text = inlineMarkdown(element.children, context)
    if (text) context.inline.push(`**${text}**`)
    return
  }
  if (name === 'em' || name === 'i') {
    const text = inlineMarkdown(element.children, context)
    if (text) context.inline.push(`*${text}*`)
    return
  }
  if (name === 'code' || name === 'kbd' || name === 'samp') {
    const text = plainText(element.children)
    if (text) context.inline.push(`\`${text.replaceAll('`', '')}\``)
    return
  }
  if (name === 'q') {
    context.inline.push(`“${inlineMarkdown(element.children, context)}”`)
    return
  }
  // Presentational and unknown inline elements are unwrapped; their text is kept.
  walkInline(element.children, context)
}

function plainCode(nodes: readonly ChildNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.data
      if (isElement(node))
        return node.name === 'br' ? '\n' : plainCode(node.children)
      return ''
    })
    .join('')
}

function convertBlocks(
  nodes: readonly ChildNode[],
  options: HtmlBodyImportOptions,
  hoistTo?: string[],
): string[] {
  const context: Context = {
    blocks: [],
    options,
    hoisted: hoistTo ?? [],
    inline: [],
    // A nested block (blockquote) cannot hold directives; hoist to the parent.
    inlineOnly: hoistTo ? 1 : 0,
    listDepth: 0,
  }
  walkInline(nodes, context)
  flushInline(context)
  return context.blocks
}

export function importHtmlBodyToMarkdown(
  html: string,
  options: HtmlBodyImportOptions = {},
): string {
  if (typeof html !== 'string' || !html.trim())
    throw new EditorialMigrationError('HTML body is empty')
  const document = parseDocument(html, { decodeEntities: true })
  const markdown = convertBlocks(document.children, options).join('\n\n').trim()
  if (!markdown)
    throw new EditorialMigrationError('HTML body contains no editorial content')
  try {
    parseEditorialMarkdown(markdown)
  } catch (error) {
    throw new EditorialMigrationError(
      `HTML body could not be expressed as canonical Markdown: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  return markdown
}

/** Retained name from the DATA-002 migration; the importer is now general. */
export const importPreReleaseHtmlToMarkdown = importHtmlBodyToMarkdown

export interface EditorialBodySource {
  readonly bodyMarkdown?: unknown
  readonly bodyHtml?: unknown
  /** Used as the accessible name of pre-release images that have none. */
  readonly title?: unknown
}

export interface EditorialBody {
  readonly bodyMarkdown: string
  readonly bodyHtml: string
}

/**
 * Resolves the canonical Markdown body for any stored post shape. Records that
 * predate the Markdown contract carry only `bodyHtml`; they are imported at
 * every trusted boundary so no operator has to convert content by hand.
 * Public HTML is always rendered from the Markdown, never copied through.
 */
export function resolveEditorialBody(
  source: EditorialBodySource,
  label = 'bodyMarkdown',
): EditorialBody {
  if (typeof source.bodyMarkdown === 'string' && source.bodyMarkdown.trim())
    return {
      bodyMarkdown: source.bodyMarkdown,
      bodyHtml: renderEditorialMarkdown(source.bodyMarkdown),
    }
  if (typeof source.bodyHtml !== 'string' || !source.bodyHtml.trim())
    throw new EditorialMigrationError(`${label} is required`)
  try {
    const bodyMarkdown = importHtmlBodyToMarkdown(source.bodyHtml, {
      imageAltFallback:
        typeof source.title === 'string' ? source.title : undefined,
    })
    return { bodyMarkdown, bodyHtml: renderEditorialMarkdown(bodyMarkdown) }
  } catch (error) {
    if (!(error instanceof EditorialMigrationError)) throw error
    throw new EditorialMigrationError(`${label}: ${error.message}`)
  }
}

export function hasCanonicalBody(source: EditorialBodySource): boolean {
  return (
    typeof source.bodyMarkdown === 'string' && source.bodyMarkdown.trim() !== ''
  )
}

export interface CanonicalBodyOptions {
  /**
   * `strict` (default) throws when a pre-release body cannot be imported, which is
   * right for publication boundaries. `lenient` keeps the record readable for
   * editors by leaving `bodyMarkdown` empty; the strict boundary then reports
   * the exact post that still needs editorial resolution.
   */
  readonly onImportError?: 'strict' | 'lenient'
}

/** Upgrades a stored post-like record so it always carries the canonical body. */
export function withCanonicalBody<T extends EditorialBodySource>(
  record: T,
  label?: string,
  options: CanonicalBodyOptions = {},
): T & EditorialBody {
  if (hasCanonicalBody(record)) {
    const bodyHtml =
      typeof record.bodyHtml === 'string' && record.bodyHtml
        ? record.bodyHtml
        : renderEditorialMarkdown(record.bodyMarkdown as string)
    return { ...record, bodyMarkdown: record.bodyMarkdown as string, bodyHtml }
  }
  try {
    return { ...record, ...resolveEditorialBody(record, label) }
  } catch (error) {
    if (
      options.onImportError !== 'lenient' ||
      !(error instanceof EditorialMigrationError)
    )
      throw error
    return {
      ...record,
      bodyMarkdown: '',
      bodyHtml: typeof record.bodyHtml === 'string' ? record.bodyHtml : '',
    }
  }
}

/** Upgrades every variant of a stored article-like record. */
export function withCanonicalVariants<
  V extends EditorialBodySource,
  T extends { readonly variants: readonly V[] },
>(
  article: T,
  label?: string,
  options: CanonicalBodyOptions = {},
): T & { readonly variants: readonly (V & EditorialBody)[] } {
  return {
    ...article,
    variants: article.variants.map((variant) =>
      withCanonicalBody(variant, label, options),
    ),
  }
}
