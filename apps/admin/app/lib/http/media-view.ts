import type { MediaMetadata } from '@publisher/persistence'

export interface BrowserMediaVariant {
  readonly publicPath: string
  readonly sha256: string
  readonly mimeType: string
  readonly byteSize: number
  readonly width: number
  readonly height: number
}

export interface BrowserMedia {
  readonly id: string
  readonly siteId: string
  readonly sha256: string
  readonly mimeType: string
  readonly byteSize: number
  readonly width: number
  readonly height: number
  readonly state: 'pending' | 'approved' | 'rejected'
  readonly variants: readonly BrowserMediaVariant[]
}

export function browserMediaView(media: MediaMetadata): BrowserMedia {
  return {
    id: media.id,
    siteId: media.siteId,
    sha256: media.sha256,
    mimeType: media.mimeType,
    byteSize: media.byteSize,
    width: media.width,
    height: media.height,
    state: media.state,
    variants:
      media.state === 'approved'
        ? media.variants.map(({ objectKey: _objectKey, ...variant }) => variant)
        : [],
  }
}
