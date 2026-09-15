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

  const listSites = () => request('/api/v2/sites')

  /** @param {{ siteId: string, name: string, canonicalOrigin: string, themeId?: string }} input */
  const createSite = (input) =>
    request('/api/v2/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId */
  const bootstrapSite = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/bootstrap`, {
      method: 'POST',
    })

  /** @param {string} siteId @param {{ name: string, canonicalOrigin: string, themeId?: string }} input */
  const updateSite = (siteId, input) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId */
  const archiveSite = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' })

  /** @param {string} siteId */
  const getSettings = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/settings`)

  /** @param {string} siteId @param {unknown} input @param {number} revision */
  const updateSettings = (siteId, input, revision) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'if-match': `"${revision}"`,
      },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId */
  const getAgentGuidance = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/agent-guidance`)

  /** @param {string} siteId @param {string} instructions @param {number} revision */
  const updateAgentGuidance = (siteId, instructions, revision) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/agent-guidance`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'if-match': `"${revision}"`,
      },
      body: JSON.stringify({ instructions }),
    })

  /** @param {string} siteId */
  const listPosts = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/posts`)

  /** @param {string} siteId @param {string} url */
  const resolveXPostEmbed = (siteId, url) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/embeds/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })

  /** @param {string} siteId @param {unknown} input */
  const createPost = (siteId, input) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId @param {string} postId @param {unknown} input @param {number} revision */
  const updatePost = (siteId, postId, input, revision) =>
    request(
      `/api/v2/sites/${encodeURIComponent(siteId)}/posts/${encodeURIComponent(postId)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': `"${revision}"`,
        },
        body: JSON.stringify(input),
      },
    )

  /** @param {string} siteId @param {string} postId @param {number} revision */
  const deletePost = (siteId, postId, revision) =>
    request(
      `/api/v2/sites/${encodeURIComponent(siteId)}/posts/${encodeURIComponent(postId)}`,
      {
        method: 'DELETE',
        headers: { 'if-match': `"${revision}"` },
      },
    )

  /** @param {string} siteId */
  const listAuthors = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/authors`)

  /** @param {string} siteId @param {unknown} input */
  const createAuthor = (siteId, input) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/authors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId */
  const listTags = (siteId) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/tags`)

  /** @param {string} siteId @param {unknown} input */
  const createTag = (siteId, input) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/tags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })

  /** @param {string} siteId @param {string} id */
  const getOperation = (siteId, id) =>
    request(
      `/api/v2/sites/${encodeURIComponent(siteId)}/operations/${encodeURIComponent(id)}`,
    )

  /** @param {string} siteId @param {string} idempotencyKey */
  const publish = (siteId, idempotencyKey) =>
    request(`/api/v2/sites/${encodeURIComponent(siteId)}/publish`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    })

  /** @param {string} id */
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
    listSites,
    createSite,
    bootstrapSite,
    updateSite,
    archiveSite,
    getSettings,
    updateSettings,
    getAgentGuidance,
    updateAgentGuidance,
    listPosts,
    resolveXPostEmbed,
    createPost,
    updatePost,
    deletePost,
    listAuthors,
    createAuthor,
    listTags,
    createTag,
    getOperation,
    publish,
    uploadMedia,
    approveMedia,
    restoreContent,
  })
}
