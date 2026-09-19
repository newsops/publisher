import { parseEditorialMarkdown } from '@publisher/content'
import {
  analyseImagePixels,
  createImageVariants,
  objectStoreFromEnvironment,
  PostgresMediaRepository,
  validateImageUpload,
  type MediaMetadata,
} from '@publisher/persistence'
import type { DeskImageFactsResolver } from '../services/desk-review'

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

export async function listMedia(
  siteId: string,
): Promise<readonly MediaMetadata[]> {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required for media metadata')
  return new PostgresMediaRepository(process.env.DATABASE_URL).list(siteId)
}

export async function readApprovedMediaPreview(
  id: string,
  siteId: string,
  variantSha256: string,
): Promise<
  { readonly body: Uint8Array; readonly mimeType: string } | undefined
> {
  const { store, repository } = dependencies()
  const media = await repository.get(id, siteId)
  if (!media || media.state !== 'approved') return undefined
  const variant = media.variants.find(
    (candidate) => candidate.sha256 === variantSha256,
  )
  if (!variant) return undefined
  return {
    body: await store.get(variant.objectKey),
    mimeType: variant.mimeType,
  }
}

function firstFigureSource(bodyMarkdown: string): string | undefined {
  try {
    const document = parseEditorialMarkdown(bodyMarkdown)
    const first = document.nodes[0]
    return first?.type === 'figure' ? document.figures[0]?.src : undefined
  } catch {
    return undefined
  }
}

function mediaByPublicPath(
  media: readonly MediaMetadata[],
  publicPath: string,
): MediaMetadata | undefined {
  return media.find(
    (item) =>
      item.state === 'approved' &&
      item.variants.some((variant) => variant.publicPath === publicPath),
  )
}

/** Media-library backed facts; without a library the facts are unverified. */
export const mediaLibraryImageFacts: DeskImageFactsResolver = async (
  siteId,
  post,
) => {
  if (!post.imageUrl) return undefined
  const databaseUrl = process.env.DATABASE_URL
  const store = objectStoreFromEnvironment()
  if (!databaseUrl || !store)
    return { found: true, verified: false, analysed: false }
  const media = await new PostgresMediaRepository(databaseUrl).list(siteId)
  const hero = mediaByPublicPath(media, post.imageUrl)
  if (!hero) return { found: false, analysed: false }
  try {
    const heroBody = await store.get(hero.objectKey)
    const figureSource = firstFigureSource(post.bodyMarkdown)
    const figure = figureSource
      ? mediaByPublicPath(media, figureSource)
      : undefined
    const figureBody =
      figure && figure.id !== hero.id
        ? await store.get(figure.objectKey)
        : undefined
    const analysis = await analyseImagePixels(heroBody, figureBody)
    return {
      found: true,
      width: hero.width,
      height: hero.height,
      channelDeviation: analysis.channelDeviation,
      duplicatesFirstFigure:
        figure && figure.id === hero.id
          ? true
          : (analysis.duplicatesCompared ?? false),
      analysed: true,
    }
  } catch {
    return {
      found: true,
      width: hero.width,
      height: hero.height,
      analysed: false,
    }
  }
}
