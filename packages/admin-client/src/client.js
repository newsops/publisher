/**
 * @typedef {{ origin: string, token: string, fetch?: typeof globalThis.fetch }} PublisherAdminClientOptions
 */

/**
 * A stable, secret-safe description of a failed Admin API call.
 */
export class PublisherApiError extends Error {
  /**
   * @param {'REMOTE_ERROR' | 'MALFORMED_RESPONSE'} code
   * @param {number | undefined} [status]
   */
  constructor(code, status) {
    super(code)
    this.name = 'PublisherApiError'
    this.code = code
    this.status = status
  }

  toJSON() {
    return this.status === undefined
      ? { code: this.code }
      : { code: this.code, status: this.status }
  }
}

/**
 * @param {PublisherAdminClientOptions} options
 */
export function createPublisherAdminClient(options) {
  const origin = options.origin.replace(/\/$/, '')
  const transport = options.fetch ?? globalThis.fetch

  if (!origin || !options.token || typeof transport !== 'function') {
    throw new TypeError(
      'Publisher Admin client requires origin, token, and fetch transport',
    )
  }

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  async function request(path, init = {}) {
    const response = await transport(`${origin}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new PublisherApiError('REMOTE_ERROR', response.status)
    }

    try {
      return { status: response.status, data: await response.json() }
    } catch {
      throw new PublisherApiError('MALFORMED_RESPONSE', response.status)
    }
  }

  const getStatus = () => request('/api/v1/posts?limit=1')

  /** @param {string} id */
  const getOperation = (id) =>
    request(`/api/v1/operations/${encodeURIComponent(id)}`)

  /** @param {string} idempotencyKey */
  const publish = (idempotencyKey) =>
    request('/api/v1/publish', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    })

  /**
   * @param {string} siteId
   * @param {{ fileName: string, mimeType: string, sha256: string, body: Uint8Array }} input
   */
  const uploadMedia = (siteId, input) => {
    const form = new FormData()
    form.set(
      'file',
      new Blob([new Uint8Array(input.body)], { type: input.mimeType }),
      input.fileName,
    )
    form.set('sha256', input.sha256)
    return request(`/api/v2/sites/${encodeURIComponent(siteId)}/media`, {
      method: 'POST',
      body: form,
    })
  }

  /** @param {string} siteId @param {string} mediaId */
  const approveMedia = (siteId, mediaId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/media`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mediaId }),
    })

  /** @param {string} siteId @param {unknown} input @param {string} idempotencyKey */
  const restoreContent = (siteId, input, idempotencyKey) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/content-restore`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(input),
    })

  return Object.freeze({
    getStatus,
    getOperation,
    publish,
    uploadMedia,
    approveMedia,
    restoreContent,
  })
}
