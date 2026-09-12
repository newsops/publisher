import type { CompletedPart } from '@aws-sdk/client-s3'

export interface ObjectStorageConfig {
  readonly endpoint?: string
  readonly region: string
  readonly bucket: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly publicBaseUrl?: string
  readonly forcePathStyle: boolean
}

export interface PutObjectInput {
  readonly body: Uint8Array | string
  readonly contentType: string
  readonly cacheControl?: string
  readonly sha256?: string
  readonly metadata?: Readonly<Record<string, string>>
}

export interface ObjectHead {
  readonly key: string
  readonly size: number
  readonly contentType?: string
  readonly etag?: string
  readonly sha256?: string
  readonly metadata: Readonly<Record<string, string>>
}

export interface MultipartUpload {
  readonly key: string
  readonly uploadId: string
}

export interface ObjectStore {
  put(key: string, input: PutObjectInput): Promise<ObjectHead>
  get(key: string): Promise<Uint8Array>
  head(key: string): Promise<ObjectHead | undefined>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<readonly ObjectHead[]>
  createMultipart(
    key: string,
    contentType: string,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<MultipartUpload>
  uploadPart(
    upload: MultipartUpload,
    partNumber: number,
    body: Uint8Array,
  ): Promise<CompletedPart>
  completeMultipart(
    upload: MultipartUpload,
    parts: readonly CompletedPart[],
  ): Promise<ObjectHead>
  abortMultipart(upload: MultipartUpload): Promise<void>
  signPut(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<string>
  signGet(key: string, expiresInSeconds?: number): Promise<string>
  publicUrl(key: string): string | undefined
}

function required(
  environment: NodeJS.ProcessEnv,
  name: keyof NodeJS.ProcessEnv,
): string {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`Missing object-storage configuration: ${name}`)
  return value
}

export function objectStorageConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfig | undefined {
  const configured = [
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  ].some((name) => Boolean(environment[name]))
  if (!configured) return undefined
  return {
    endpoint: environment.OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
    region: required(environment, 'OBJECT_STORAGE_REGION'),
    bucket: required(environment, 'OBJECT_STORAGE_BUCKET'),
    accessKeyId: required(environment, 'OBJECT_STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required(environment, 'OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    publicBaseUrl:
      environment.OBJECT_STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
      undefined,
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
  }
}
