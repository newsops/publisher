import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import type { ObjectStorageConfig } from './object-storage-contract'

export interface ConditionalObject {
  readonly body: Uint8Array
  readonly etag: string
}

export type ConditionalWriteResult =
  | { readonly kind: 'stored'; readonly etag: string }
  | { readonly kind: 'precondition-failed' }
  | { readonly kind: 'unknown' }

export interface ConditionalByteStore {
  read(key: string): Promise<ConditionalObject | undefined>
  create(key: string, body: Uint8Array): Promise<ConditionalWriteResult>
  replace(
    key: string,
    body: Uint8Array,
    expectedEtag: string,
  ): Promise<ConditionalWriteResult>
}

type StoreErrorCode =
  | 'ACCESS_DENIED'
  | 'UNSUPPORTED_CONDITIONS'
  | 'REQUEST_REJECTED'
  | 'MISSING_ETAG'
  | 'READ_FAILED'
  | 'OBJECT_TOO_LARGE'
  | 'INVALID_PRECONDITION'

export class ConditionalStoreError extends Error {
  constructor(readonly code: StoreErrorCode) {
    super(`Conditional object storage: ${code}`)
    this.name = 'ConditionalStoreError'
  }
}

const MAX_OBJECT_BYTES = 64 * 1024 * 1024

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error))
    return undefined
  const metadata = error.$metadata
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('httpStatusCode' in metadata)
  )
    return undefined
  return typeof metadata.httpStatusCode === 'number'
    ? metadata.httpStatusCode
    : undefined
}

function rejectKnownFailure(status: number | undefined): void {
  if (status === 401 || status === 403)
    throw new ConditionalStoreError('ACCESS_DENIED')
  if (status === 405 || status === 501)
    throw new ConditionalStoreError('UNSUPPORTED_CONDITIONS')
  if (status !== undefined && status >= 400 && status < 500 && status !== 409)
    throw new ConditionalStoreError('REQUEST_REJECTED')
}

async function readBytes(
  body: GetObjectCommandOutput['Body'],
): Promise<Uint8Array> {
  if (!body) throw new ConditionalStoreError('READ_FAILED')
  const reader = body.transformToWebStream().getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      const value: unknown = next.value
      if (!(value instanceof Uint8Array))
        throw new ConditionalStoreError('READ_FAILED')
      size += value.byteLength
      if (size > MAX_OBJECT_BYTES)
        throw new ConditionalStoreError('OBJECT_TOO_LARGE')
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export class S3ConditionalByteStore implements ConditionalByteStore {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: ObjectStorageConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000 },
    })
  }

  async read(key: string): Promise<ConditionalObject | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!response.ETag) throw new ConditionalStoreError('MISSING_ETAG')
      if ((response.ContentLength ?? 0) > MAX_OBJECT_BYTES)
        throw new ConditionalStoreError('OBJECT_TOO_LARGE')
      return { body: await readBytes(response.Body), etag: response.ETag }
    } catch (error) {
      if (error instanceof ConditionalStoreError) throw error
      const status = statusOf(error)
      if (status === 404) return undefined
      rejectKnownFailure(status)
      throw new ConditionalStoreError('READ_FAILED')
    }
  }

  create(key: string, body: Uint8Array): Promise<ConditionalWriteResult> {
    return this.write(key, body, { IfNoneMatch: '*' })
  }

  replace(
    key: string,
    body: Uint8Array,
    expectedEtag: string,
  ): Promise<ConditionalWriteResult> {
    if (!expectedEtag || expectedEtag === '*')
      throw new ConditionalStoreError('INVALID_PRECONDITION')
    return this.write(key, body, { IfMatch: expectedEtag })
  }

  private async write(
    key: string,
    body: Uint8Array,
    condition: { readonly IfNoneMatch: '*' } | { readonly IfMatch: string },
  ): Promise<ConditionalWriteResult> {
    if (body.byteLength > MAX_OBJECT_BYTES)
      throw new ConditionalStoreError('OBJECT_TOO_LARGE')
    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/octet-stream',
          CacheControl: 'private, no-store',
          ...condition,
        }),
      )
      return response.ETag
        ? { kind: 'stored', etag: response.ETag }
        : { kind: 'unknown' }
    } catch (error) {
      const status = statusOf(error)
      if (status === 412) return { kind: 'precondition-failed' }
      rejectKnownFailure(status)
      return { kind: 'unknown' }
    }
  }

  close(): void {
    this.client.destroy()
  }
}
