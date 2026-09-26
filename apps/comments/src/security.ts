export const DEFAULT_BODY_LIMIT = 16 * 1024
export const MAX_AUTHOR_NAME_LENGTH = 80
export const MAX_COMMENT_TEXT_LENGTH = 2_000
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,159}$/

export function sanitizePlainText(value: string, maxLength: number): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export async function readBodyWithLimit(
  request: Request,
  limit: number,
): Promise<string | undefined> {
  const length = request.headers.get('content-length')
  if (length && Number(length) > limit) return undefined
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > limit) return undefined
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function requestIp(request: Request): string | undefined {
  return request.headers.get('x-client-ip')?.trim() || undefined
}
