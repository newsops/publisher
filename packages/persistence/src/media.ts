import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from './postgres'

async function imageProcessor() {
  const { default: sharp } = await import('sharp')
  return sharp
}

const allowedTypes = new Map([
  ['image/jpeg', { extension: '.jpg', formats: new Set(['jpeg']) }],
  ['image/png', { extension: '.png', formats: new Set(['png']) }],
  ['image/webp', { extension: '.webp', formats: new Set(['webp']) }],
  ['image/avif', { extension: '.avif', formats: new Set(['heif', 'avif']) }],
])

export interface MediaMetadata {
  readonly id: string
  readonly siteId: string
  readonly objectKey: string
  readonly sha256: string
  readonly mimeType: string
  readonly byteSize: number
  readonly width: number
  readonly height: number
  readonly state: 'pending' | 'approved' | 'rejected'
  readonly variants: readonly MediaVariant[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MediaVariant {
  readonly publicPath: string
  readonly objectKey: string
  readonly sha256: string
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'
  readonly byteSize: number
  readonly width: number
  readonly height: number
}

export interface ValidatedImageUpload {
  readonly body: Uint8Array
  readonly metadata: Omit<
    MediaMetadata,
    'id' | 'state' | 'variants' | 'createdAt' | 'updatedAt'
  >
}

interface MediaRow {
  readonly id: string
  readonly site_id: string
  readonly object_key: string
  readonly sha256: string
  readonly mime_type: string
  readonly byte_size: string | number
  readonly width: number
  readonly height: number
  readonly state: MediaMetadata['state']
  readonly variants: MediaVariant[]
  readonly created_at: Date | string
  readonly updated_at: Date | string
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function mapMedia(row: MediaRow): MediaMetadata {
  return {
    id: row.id,
    siteId: row.site_id,
    objectKey: row.object_key,
    sha256: row.sha256,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    width: row.width,
    height: row.height,
    state: row.state,
    variants: row.variants ?? [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function checksumAddressedMediaKey(
  siteId: string,
  sha256: string,
  extension: string,
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId))
    throw new Error('Invalid site ID')
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid SHA-256')
  return `sites/${siteId}/media/${sha256}/original${extension}`
}

function assertImageFileName(
  fileName: string,
  expectedExtension: string,
): void {
  const extension = path.extname(fileName).toLowerCase()
  if (
    extension !== expectedExtension &&
    !(extension === '.jpeg' && expectedExtension === '.jpg')
  )
    throw new Error('Image extension does not match its declared MIME type')
}

export async function validateImageUpload({
  siteId,
  fileName,
  declaredMimeType,
  declaredSha256,
  body,
  maximumBytes = 10 * 1024 * 1024,
  maximumPixels = 40_000_000,
}: {
  readonly siteId: string
  readonly fileName: string
  readonly declaredMimeType: string
  readonly declaredSha256?: string
  readonly body: Uint8Array
  readonly maximumBytes?: number
  readonly maximumPixels?: number
}): Promise<ValidatedImageUpload> {
  if (body.byteLength === 0 || body.byteLength > maximumBytes)
    throw new Error(`Image size must be between 1 and ${maximumBytes} bytes`)
  const allowed = allowedTypes.get(declaredMimeType.toLowerCase())
  if (!allowed) throw new Error('Unsupported image MIME type')
  assertImageFileName(fileName, allowed.extension)
  const sha256 = createHash('sha256').update(body).digest('hex')
  if (declaredSha256 && declaredSha256.toLowerCase() !== sha256)
    throw new Error('Image checksum does not match the uploaded bytes')
  const sharp = await imageProcessor()
  const image = sharp(body, {
    failOn: 'error',
    limitInputPixels: maximumPixels,
  })
  const header = await image.metadata()
  if (!header.format || !allowed.formats.has(header.format))
    throw new Error('Detected image format does not match its MIME type')
  if (!header.width || !header.height)
    throw new Error('Image dimensions are unavailable')
  await image.clone().rotate().raw().toBuffer()
  return {
    body,
    metadata: {
      siteId,
      objectKey: checksumAddressedMediaKey(siteId, sha256, allowed.extension),
      sha256,
      mimeType: declaredMimeType.toLowerCase(),
      byteSize: body.byteLength,
      width: header.width,
      height: header.height,
    },
  }
}

export async function createImageVariants(
  body: Uint8Array,
  siteId: string,
  originalSha256: string,
): Promise<readonly { body: Uint8Array; metadata: MediaVariant }[]> {
  const sharp = await imageProcessor()
  const specifications = [
    { format: 'webp' as const, mimeType: 'image/webp' as const, width: 1600 },
    { format: 'avif' as const, mimeType: 'image/avif' as const, width: 1200 },
  ]
  const variants = []
  for (const specification of specifications) {
    const output = await sharp(body, { failOn: 'error' })
      .rotate()
      .resize({ width: specification.width, withoutEnlargement: true })
      [specification.format]({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    const sha256 = createHash('sha256').update(output.data).digest('hex')
    variants.push({
      body: new Uint8Array(output.data),
      metadata: {
        publicPath: `/media/${sha256}.${specification.format}`,
        objectKey: `sites/${siteId}/media/${originalSha256}/variants/${sha256}.${specification.format}`,
        sha256,
        mimeType: specification.mimeType,
        byteSize: output.data.byteLength,
        width: output.info.width,
        height: output.info.height,
      },
    })
  }
  return variants
}

export class PostgresMediaRepository {
  constructor(
    connectionString = process.env.DATABASE_URL ?? '',
    private readonly pool: PostgresPool = postgresPool(connectionString),
  ) {}

  async createPending(
    input: ValidatedImageUpload['metadata'],
  ): Promise<MediaMetadata> {
    const now = new Date().toISOString()
    const result = await this.pool.query<MediaRow>(
      `INSERT INTO publisher_admin.media
       (id, site_id, object_key, sha256, mime_type, byte_size, width, height,
        state, variants, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8,
               'pending', '[]'::jsonb, $9, $9)
       ON CONFLICT (site_id, sha256) DO UPDATE
       SET object_key = EXCLUDED.object_key
       RETURNING *`,
      [
        randomUUID(),
        input.siteId,
        input.objectKey,
        input.sha256,
        input.mimeType,
        input.byteSize,
        input.width,
        input.height,
        now,
      ],
    )
    if (!result.rows[0]) throw new Error('Media metadata was not stored')
    return mapMedia(result.rows[0])
  }

  async get(id: string, siteId: string): Promise<MediaMetadata | undefined> {
    return this.getUsing(this.pool, id, siteId)
  }

  async getUsing(
    database: PostgresQueryable,
    id: string,
    siteId: string,
  ): Promise<MediaMetadata | undefined> {
    const result = await database.query<MediaRow>(
      'SELECT * FROM publisher_admin.media WHERE id = $1::uuid AND site_id = $2',
      [id, siteId],
    )
    return result.rows[0] ? mapMedia(result.rows[0]) : undefined
  }

  async approve(
    id: string,
    siteId: string,
    variants: readonly MediaVariant[],
  ): Promise<MediaMetadata> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<MediaRow>(
        `UPDATE publisher_admin.media
         SET state = 'approved', variants = $3::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid AND site_id = $2
         RETURNING *`,
        [id, siteId, JSON.stringify(variants)],
      )
      if (!result.rows[0]) throw new Error('Media not found')
      return mapMedia(result.rows[0])
    })
  }

  async listApproved(siteId: string): Promise<readonly MediaMetadata[]> {
    return this.listApprovedUsing(this.pool, siteId)
  }

  async list(siteId: string): Promise<readonly MediaMetadata[]> {
    const result = await this.pool.query<MediaRow>(
      `SELECT * FROM publisher_admin.media
       WHERE site_id = $1
       ORDER BY updated_at DESC`,
      [siteId],
    )
    return result.rows.map(mapMedia)
  }

  async listApprovedUsing(
    database: PostgresQueryable,
    siteId: string,
  ): Promise<readonly MediaMetadata[]> {
    const result = await database.query<MediaRow>(
      `SELECT * FROM publisher_admin.media
       WHERE site_id = $1 AND state = 'approved'
       ORDER BY updated_at DESC`,
      [siteId],
    )
    return result.rows.map(mapMedia)
  }
}

/**
 * Pixel facts for editorial checks (EDIT-001): the average channel standard
 * deviation flags near-blank pictures, and a 32×32 greyscale difference
 * against a second image flags a repeated picture.
 */
export async function analyseImagePixels(
  body: Uint8Array,
  compareWith?: Uint8Array,
): Promise<{
  readonly channelDeviation: number
  readonly duplicatesCompared?: boolean
}> {
  const sharp = await imageProcessor()
  const stats = await sharp(body).stats()
  const channelDeviation =
    stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) /
    stats.channels.length
  if (!compareWith) return { channelDeviation }
  const thumb = (source: Uint8Array) =>
    sharp(source).resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer()
  const [left, right] = await Promise.all([thumb(body), thumb(compareWith)])
  let difference = 0
  for (let index = 0; index < left.length; index += 1)
    difference += Math.abs(left[index]! - right[index]!)
  return {
    channelDeviation,
    duplicatesCompared: difference / left.length < 8,
  }
}
