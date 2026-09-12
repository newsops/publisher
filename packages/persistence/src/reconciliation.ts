export interface FixtureReconciliation {
  readonly schemaVersion: 1
  readonly source: 'checked-in-fixture'
  readonly siteId: string
  readonly importedIntoEmptySite: boolean
  readonly counts: {
    readonly posts: number
    readonly tags: number
    readonly authors: number
    readonly media: number
  }
  readonly media: readonly {
    readonly path: string
    readonly byteSize: number
    readonly sha256: string
    readonly objectKey: string
  }[]
  readonly fixtureSha256: string
  readonly recordedAt: string
}
