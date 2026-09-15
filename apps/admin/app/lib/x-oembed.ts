import { ApiRequestError } from './api-error'

const xStatusUrl =
  /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15})\/status\/([0-9]+)(?:[/?#].*)?$/
const timeoutMilliseconds = 5_000

export interface ResolvedXPostEmbed {
  readonly url: string
  readonly authorName: string
  readonly authorUrl: string
  readonly quote: string
  readonly html: string
}

interface OEmbedResponse {
  readonly html?: unknown
  readonly author_name?: unknown
  readonly author_url?: unknown
}

export interface ResolveXPostOptions {
  readonly fetch?: typeof globalThis.fetch
  readonly timeoutMilliseconds?: number
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, encoded: string) => {
      const code = encoded.toLowerCase().startsWith('x')
        ? Number.parseInt(encoded.slice(1), 16)
        : Number.parseInt(encoded, 10)
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : ''
    })
    .replace(
      /&(amp|lt|gt|quot|apos);/gi,
      (_, name: string) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[
          name.toLowerCase()
        ] ?? '',
    )
}

function textFromProviderHtml(value: string): string {
  if (/<\s*(?:script|iframe)\b/i.test(value))
    throw new ApiRequestError(
      'x_oembed_unsafe_response',
      'X oEmbed returned unsafe markup',
      502,
    )
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(value)?.[1]
  const quote = decodeEntities((paragraph ?? value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (!quote)
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed did not return post text',
      502,
    )
  return quote
}

export function parseCanonicalXStatusUrl(value: string): {
  readonly url: string
  readonly handle: string
  readonly statusId: string
} {
  const match = xStatusUrl.exec(value.trim())
  if (!match)
    throw new ApiRequestError(
      'x_oembed_invalid_url',
      'URL must be a canonical https://x.com/<handle>/status/<numeric-id> URL',
      400,
    )
  const [, handle, statusId] = match
  return { url: `https://x.com/${handle}/status/${statusId}`, handle, statusId }
}

export async function resolveXPostOEmbed(
  input: string,
  options: ResolveXPostOptions = {},
): Promise<ResolvedXPostEmbed> {
  const canonical = parseCanonicalXStatusUrl(input)
  const fetcher = options.fetch ?? globalThis.fetch
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMilliseconds ?? timeoutMilliseconds,
  )
  let response: Response
  try {
    response = await fetcher(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonical.url)}&dnt=true&omit_script=true`,
      { signal: controller.signal },
    )
  } catch {
    throw new ApiRequestError(
      'x_oembed_unavailable',
      'X oEmbed is unavailable; try again later',
      503,
    )
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok)
    throw new ApiRequestError(
      'x_oembed_unavailable',
      'X oEmbed is unavailable; try again later',
      503,
    )
  let payload: OEmbedResponse
  try {
    payload = (await response.json()) as OEmbedResponse
  } catch {
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed returned invalid JSON',
      502,
    )
  }
  if (
    typeof payload.html !== 'string' ||
    typeof payload.author_name !== 'string' ||
    typeof payload.author_url !== 'string'
  )
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed response is incomplete',
      502,
    )
  let authorUrl: URL
  try {
    authorUrl = new URL(payload.author_url)
  } catch {
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed returned an invalid author URL',
      502,
    )
  }
  if (authorUrl.protocol !== 'https:' || authorUrl.hostname !== 'x.com')
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed returned an invalid author URL',
      502,
    )
  const quote = textFromProviderHtml(payload.html)
  const authorName = payload.author_name.trim()
  if (!authorName)
    throw new ApiRequestError(
      'x_oembed_malformed_response',
      'X oEmbed did not return an author',
      502,
    )
  const html = `<figure class="publisher-x-post" data-publisher-x-post="true"><blockquote><p>${escapeHtml(quote)}</p></blockquote><figcaption><a href="${escapeHtml(canonical.url)}">${escapeHtml(authorName)} on X</a></figcaption></figure>`
  return {
    url: canonical.url,
    authorName,
    authorUrl: authorUrl.toString(),
    quote,
    html,
  }
}
