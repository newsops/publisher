export type PublisherFetch = typeof fetch

export interface PublisherAdminClientOptions {
  origin: string
  token: string
  fetch?: PublisherFetch
}

export interface PublisherApiReply<T> {
  status: number
  data: T
}

export class PublisherApiError extends Error {
  readonly code: 'REMOTE_ERROR' | 'MALFORMED_RESPONSE'
  readonly status?: number
  toJSON(): { code: string; status?: number }
}

export interface PublisherAdminClient {
  listSites(): Promise<PublisherApiReply<unknown>>
  createSite(input: {
    siteId: string
    name: string
    canonicalOrigin: string
    themeId?: string
  }): Promise<PublisherApiReply<unknown>>
  bootstrapSite(siteId: string): Promise<PublisherApiReply<unknown>>
  updateSite(
    siteId: string,
    input: { name: string; canonicalOrigin: string; themeId?: string },
  ): Promise<PublisherApiReply<unknown>>
  archiveSite(siteId: string): Promise<PublisherApiReply<unknown>>
  getSettings(siteId: string): Promise<PublisherApiReply<unknown>>
  updateSettings(
    siteId: string,
    input: unknown,
    revision: number,
  ): Promise<PublisherApiReply<unknown>>
  getAgentGuidance(siteId: string): Promise<PublisherApiReply<unknown>>
  updateAgentGuidance(
    siteId: string,
    instructions: string,
    revision: number,
  ): Promise<PublisherApiReply<unknown>>
  listPosts(siteId: string): Promise<PublisherApiReply<unknown>>
  createPost(
    siteId: string,
    input: unknown,
  ): Promise<PublisherApiReply<unknown>>
  updatePost(
    siteId: string,
    postId: string,
    input: unknown,
    revision: number,
  ): Promise<PublisherApiReply<unknown>>
  deletePost(
    siteId: string,
    postId: string,
    revision: number,
  ): Promise<PublisherApiReply<unknown>>
  listAuthors(siteId: string): Promise<PublisherApiReply<unknown>>
  createAuthor(
    siteId: string,
    input: unknown,
  ): Promise<PublisherApiReply<unknown>>
  listTags(siteId: string): Promise<PublisherApiReply<unknown>>
  createTag(siteId: string, input: unknown): Promise<PublisherApiReply<unknown>>
  getOperation(siteId: string, id: string): Promise<PublisherApiReply<unknown>>
  publish(
    siteId: string,
    idempotencyKey: string,
  ): Promise<PublisherApiReply<unknown>>
  uploadMedia(
    siteId: string,
    input: {
      fileName: string
      mimeType: string
      sha256: string
      body: Uint8Array
    },
  ): Promise<PublisherApiReply<unknown>>
  approveMedia(
    siteId: string,
    mediaId: string,
  ): Promise<PublisherApiReply<unknown>>
  restoreContent(
    siteId: string,
    input: unknown,
    idempotencyKey: string,
  ): Promise<PublisherApiReply<unknown>>
}

export function createPublisherAdminClient(
  options: PublisherAdminClientOptions,
): PublisherAdminClient
