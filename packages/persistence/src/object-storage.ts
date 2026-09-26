import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  objectStorageConfigFromEnvironment,
  type MultipartUpload,
  type ObjectHead,
  type ObjectStorageConfig,
  type ObjectStore,
  type PutObjectInput,
} from './object-storage-contract'

export {
  objectStorageConfigFromEnvironment,
  type MultipartUpload,
  type ObjectHead,
  type ObjectStorageConfig,
  type ObjectStore,
  type PutObjectInput,
} from './object-storage-contract'

export class S3CompatibleObjectStore implements ObjectStore {
  readonly bucket: string
  private readonly client: S3Client
  private readonly baseUrl?: string

  constructor(config: ObjectStorageConfig) {
    this.bucket = config.bucket
    this.baseUrl = config.publicBaseUrl
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async put(key: string, input: PutObjectInput): Promise<ObjectHead> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        Metadata: {
          ...input.metadata,
          ...(input.sha256 ? { sha256: input.sha256 } : {}),
        },
      }),
    )
    const stored = await this.head(key)
    if (!stored) throw new Error(`Object was not stored: ${key}`)
    return stored
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    if (!response.Body) throw new Error(`Object has no body: ${key}`)
    return response.Body.transformToByteArray()
  }

  async head(key: string): Promise<ObjectHead | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return {
        key,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
        etag: response.ETag,
        sha256: response.Metadata?.sha256,
        metadata: response.Metadata ?? {},
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode
      if (status === 404) return undefined
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
  }

  async list(prefix: string): Promise<readonly ObjectHead[]> {
    const objects: ObjectHead[] = []
    let continuationToken: string | undefined
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      )
      for (const item of response.Contents ?? []) {
        if (!item.Key) continue
        objects.push({
          key: item.Key,
          size: item.Size ?? 0,
          etag: item.ETag,
          metadata: {},
        })
      }
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined
    } while (continuationToken)
    return objects
  }

  async createMultipart(
    key: string,
    contentType: string,
    metadata: Readonly<Record<string, string>> = {},
  ): Promise<MultipartUpload> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
      }),
    )
    if (!response.UploadId)
      throw new Error(`Object store did not return a multipart upload ID`)
    return { key, uploadId: response.UploadId }
  }

  async uploadPart(
    upload: MultipartUpload,
    partNumber: number,
    body: Uint8Array,
  ): Promise<CompletedPart> {
    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    )
    if (!response.ETag) throw new Error('Multipart upload part has no ETag')
    return { ETag: response.ETag, PartNumber: partNumber }
  }

  async completeMultipart(
    upload: MultipartUpload,
    parts: readonly CompletedPart[],
  ): Promise<ObjectHead> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
        MultipartUpload: { Parts: [...parts] },
      }),
    )
    const stored = await this.head(upload.key)
    if (!stored)
      throw new Error(`Multipart object was not stored: ${upload.key}`)
    return stored
  }

  async abortMultipart(upload: MultipartUpload): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: upload.key,
        UploadId: upload.uploadId,
      }),
    )
  }

  signPut(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    )
  }

  signGet(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    )
  }

  publicUrl(key: string): string | undefined {
    return this.baseUrl
      ? `${this.baseUrl}/${key
          .split('/')
          .map((part) => encodeURIComponent(part))
          .join('/')}`
      : undefined
  }
}

export function objectStoreFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): S3CompatibleObjectStore | undefined {
  const config = objectStorageConfigFromEnvironment(environment)
  return config ? new S3CompatibleObjectStore(config) : undefined
}
