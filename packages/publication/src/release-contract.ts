import { createHash } from 'node:crypto'

export type ArtifactKind =
  | 'article-html'
  | 'index-html'
  | 'projection'
  | 'theme'
  | 'runtime'
  | 'metadata'
  | 'media'

export type ArtifactCacheClass = 'html' | 'immutable' | 'runtime-pointer'

export interface ArtifactEntry {
  readonly path: string
  readonly kind: ArtifactKind
  readonly sha256: string
  readonly dependencySha256: string
  readonly contentType: string
  readonly cacheClass: ArtifactCacheClass
  readonly objectKey: string
  readonly sourceReleaseId: string
  readonly localReferences: readonly string[]
}

export interface ReleaseManifest {
  readonly schemaVersion: 1
  readonly siteId: string
  readonly releaseId: string
  readonly parentReleaseId?: string
  readonly generatedAt: string
  readonly entries: readonly ArtifactEntry[]
  readonly sha256: string
}

export interface ArtifactRecipe {
  readonly path: string
  readonly kind: ArtifactKind
  readonly contentType: string
  readonly cacheClass: ArtifactCacheClass
  readonly dependencyKeys: readonly string[]
  readonly render: (
    readDependency: (key: string) => string,
  ) => string | Uint8Array | Promise<string | Uint8Array>
}

export interface ArtifactStore {
  has(objectKey: string): Promise<boolean>
  put(
    objectKey: string,
    body: Uint8Array,
    metadata: Readonly<Record<string, string>>,
  ): Promise<void>
}

export interface BuildMetrics {
  readonly rendered: number
  readonly uploaded: number
  readonly reused: number
  readonly removed: number
  readonly renderedByKind: Readonly<Record<ArtifactKind, number>>
  readonly uploadedByKind: Readonly<Record<ArtifactKind, number>>
}

export interface BuildResult {
  readonly manifest: ReleaseManifest
  readonly metrics: BuildMetrics
  readonly changed: boolean
}

export function manifestChecksum(
  manifest: Omit<ReleaseManifest, 'sha256'>,
): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
}
