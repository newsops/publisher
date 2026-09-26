import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type {
  ArtifactStore,
  ReadableArtifactStore,
  ReleaseManifest,
} from '../../packages/publication/src/index'
import type { ObjectStore } from '../../packages/persistence/src/index'

export function sha256Bytes(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex')
}

export class ObjectArtifactStore
  implements ArtifactStore, ReadableArtifactStore
{
  constructor(private readonly store: ObjectStore) {}

  async has(key: string): Promise<boolean> {
    return Boolean(await this.store.head(key))
  }

  async put(
    key: string,
    body: Uint8Array,
    metadata: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.store.put(key, {
      body,
      contentType: metadata.contentType ?? 'application/octet-stream',
      cacheControl:
        metadata.cacheClass === 'immutable'
          ? 'public, max-age=31536000, immutable'
          : 'private, no-cache',
      sha256: metadata.sha256,
      metadata,
    })
  }

  get(key: string): Promise<Uint8Array> {
    return this.store.get(key)
  }
}

export async function persistReleaseManifest(
  objectStore: ObjectStore,
  manifest: ReleaseManifest,
  output?: string,
): Promise<void> {
  const body = new TextEncoder().encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  await objectStore.put(
    `manifests/${manifest.siteId}/${manifest.releaseId}.json`,
    {
      body,
      contentType: 'application/json',
      cacheControl: 'private, max-age=31536000, immutable',
      sha256: sha256Bytes(body),
    },
  )
  if (output) await writeFile(output, body, { flag: 'wx', mode: 0o600 })
}
