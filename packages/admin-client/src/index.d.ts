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
  getStatus(): Promise<PublisherApiReply<unknown>>
  getOperation(id: string): Promise<PublisherApiReply<unknown>>
  publish(idempotencyKey: string): Promise<PublisherApiReply<unknown>>
}

export function createPublisherAdminClient(
  options: PublisherAdminClientOptions,
): PublisherAdminClient
