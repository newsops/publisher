import { createHash } from 'node:crypto'
import {
  ContentValidationError,
  type ContentSnapshot,
} from '@publisher/content'
import { objectStoreFromEnvironment } from '@publisher/persistence'
import { createSnapshotRelease, type ContentReleaseManifest } from './release'

export interface PublishDelivery {
  readonly snapshotKey?: string
  readonly mode: 'object-storage' | 'local'
  readonly release: ContentReleaseManifest
}

export function publicationIdempotencyKey(request: Request): string {
  const value = request.headers.get('idempotency-key')?.trim() ?? ''
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value))
    throw new ContentValidationError(
      'Idempotency-Key must be 1..200 letters, numbers, dots, colons, underscores, or hyphens',
    )
  return value
}

export async function deliverSnapshot(
  snapshot: ContentSnapshot,
): Promise<PublishDelivery> {
  const body = JSON.stringify(snapshot)
  const checksum = createHash('sha256').update(body).digest('hex')
  const key =
    snapshot.siteId === 'default'
      ? `snapshots/${snapshot.snapshotId}.json`
      : `sites/${snapshot.siteId}/snapshots/${snapshot.snapshotId}.json`
  const store = objectStoreFromEnvironment()
  if (store)
    await store.put(key, {
      body,
      contentType: 'application/json',
      cacheControl: 'private, max-age=31536000, immutable',
      sha256: checksum,
    })

  const hasObjectStorage = Boolean(store)
  if (process.env.NODE_ENV === 'production' && !hasObjectStorage)
    throw new Error('Production publish requires object storage configuration')
  return {
    snapshotKey: hasObjectStorage ? key : undefined,
    mode: hasObjectStorage ? 'object-storage' : 'local',
    release: createSnapshotRelease(
      snapshot.snapshotId,
      hasObjectStorage ? key : undefined,
      checksum,
    ),
  }
}
