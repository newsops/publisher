export type ContentReleaseStatus =
  | 'Snapshot created'
  | 'Waiting for deployment'
  | 'Deploying'
  | 'Purge pending'
  | 'Published'
  | 'Failed'

export interface ContentReleaseManifest {
  readonly releaseId: string
  readonly snapshotId: string
  readonly status: ContentReleaseStatus
  readonly snapshotKey?: string
  readonly checksum?: string
  readonly createdAt: string
}

export function createSnapshotRelease(
  snapshotId: string,
  snapshotKey: string | undefined,
  checksum?: string,
  createdAt = new Date().toISOString(),
): ContentReleaseManifest {
  return {
    releaseId: snapshotId,
    snapshotId,
    status: 'Snapshot created',
    snapshotKey,
    checksum,
    createdAt,
  }
}

/** What the admin recorded after handing a snapshot to the publication path. */
export interface PublishDelivery {
  readonly snapshotKey?: string
  readonly mode: 'object-storage' | 'local'
  readonly release: ContentReleaseManifest
}
