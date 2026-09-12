import {
  createImageVariants,
  objectStoreFromEnvironment,
  PostgresMediaRepository,
  validateImageUpload,
  type MediaMetadata,
} from '@publisher/persistence'

function dependencies() {
  const store = objectStoreFromEnvironment()
  if (!store) throw new Error('Object storage is not configured')
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required for media metadata')
  return {
    store,
    repository: new PostgresMediaRepository(process.env.DATABASE_URL),
  }
}

export async function uploadImage({
  siteId,
  fileName,
  mimeType,
  sha256,
  body,
}: {
  readonly siteId: string
  readonly fileName: string
  readonly mimeType: string
  readonly sha256?: string
  readonly body: Uint8Array
}): Promise<MediaMetadata> {
  const { store, repository } = dependencies()
  const validated = await validateImageUpload({
    siteId,
    fileName,
    declaredMimeType: mimeType,
    declaredSha256: sha256,
    body,
  })
  await store.put(validated.metadata.objectKey, {
    body: validated.body,
    contentType: validated.metadata.mimeType,
    cacheControl: 'private, max-age=31536000, immutable',
    sha256: validated.metadata.sha256,
    metadata: { site: siteId, state: 'pending' },
  })
  return repository.createPending(validated.metadata)
}

export async function approveImage(
  id: string,
  siteId: string,
): Promise<MediaMetadata> {
  const { store, repository } = dependencies()
  const media = await repository.get(id, siteId)
  if (!media) throw new Error('Media not found')
  const original = await store.get(media.objectKey)
  const variants = await createImageVariants(
    original,
    media.siteId,
    media.sha256,
  )
  for (const variant of variants) {
    await store.put(variant.metadata.objectKey, {
      body: variant.body,
      contentType: variant.metadata.mimeType,
      cacheControl: 'private, max-age=31536000, immutable',
      sha256: variant.metadata.sha256,
      metadata: { site: siteId, source: media.sha256 },
    })
  }
  return repository.approve(
    id,
    siteId,
    variants.map((variant) => variant.metadata),
  )
}
