import { createHash, randomUUID } from 'node:crypto'
import {
  archiveCanonicalJson,
  articleFromPost,
  type EditorialArchive,
  type ManagedAuthorProfile,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
} from '@publisher/content'
import {
  PostgresMediaRepository,
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import { assertKnownSite } from './site-catalog'
import { loadPostgresSiteState } from './postgres-publication'
import { initialPayload, type LocalState } from './repository-seed'
import {
  assertUniqueFeaturedRanks,
  validatedAuthor,
  validatedPost,
  validatedSettings,
  validatedTag,
} from './repository-validation'

export interface ArchiveRestoreMediaBinding {
  readonly mediaId: string
  readonly variantSha256: string
}

export interface ArchiveRestoreResult {
  readonly operationId: string
  readonly siteId: string
  readonly archiveDigest: string
  readonly revision: number
  readonly counts: {
    readonly authors: number
    readonly tags: number
    readonly posts: number
    readonly media: number
  }
}

export interface ArchiveRestoreInput {
  readonly archive: EditorialArchive
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly media: Readonly<Record<string, ArchiveRestoreMediaBinding>>
}

function archiveDigest(archive: EditorialArchive): string {
  return createHash('sha256')
    .update(archiveCanonicalJson(archive))
    .digest('hex')
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(value))
    throw new Error('A valid idempotency key is required')
}

function starterFingerprint(state: LocalState): string {
  const { posts, tags, authors, settings, snapshots } = state
  return canonicalJson({
    posts: posts.map(({ id, revision, createdAt, ...post }) => post),
    tags: tags.map(({ revision, createdAt, updatedAt, ...tag }) => tag),
    authors: authors.map(
      ({ revision, createdAt, updatedAt, ...author }) => author,
    ),
    settings: (() => {
      const { revision, updatedAt, ...settingsWithoutMetadata } = settings
      return settingsWithoutMetadata
    })(),
    snapshots,
  })
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function assertUntouchedStarterFixture(
  siteId: string,
  state: LocalState,
): void {
  if (starterFingerprint(state) !== starterFingerprint(initialPayload(siteId)))
    throw new Error('Archive restore requires an untouched starter fixture')
}

function managedSettings(
  archive: EditorialArchive,
): ManagedPublicationSettings {
  return validatedSettings(archive.settings, {
    ...initialPayload().settings,
    revision: 0,
  })
}

function managedAuthors(
  archive: EditorialArchive,
  mediaPaths: ReadonlyMap<string, string>,
): ManagedAuthorProfile[] {
  return archive.authors.map((author) =>
    validatedAuthor(
      author.slug,
      {
        ...author,
        avatarUrl: author.avatarAsset
          ? mediaPaths.get(author.avatarAsset)
          : undefined,
      },
      undefined,
    ),
  )
}

function managedTags(archive: EditorialArchive): ManagedTaxonomyTerm[] {
  return archive.tags.map((tag) =>
    validatedTag(tag.slug, { ...tag, active: true }, undefined),
  )
}

function managedPosts(
  archive: EditorialArchive,
  settings: ManagedPublicationSettings,
  tags: readonly ManagedTaxonomyTerm[],
  authors: readonly ManagedAuthorProfile[],
  mediaPaths: ReadonlyMap<string, string>,
): ManagedPost[] {
  const posts = archive.posts.map((post) =>
    validatedPost(
      undefined,
      undefined,
      {
        ...post,
        seoTitle: normalizedArchiveSeoTitle(post.seoTitle),
        imageUrl: post.imageAsset ? mediaPaths.get(post.imageAsset) : undefined,
        bodyHtml: rewriteBodyMediaReferences(post, mediaPaths),
      },
      tags.map((tag) => tag.slug),
      authors.map((author) => author.slug),
      settings.canonicalOrigin,
    ),
  )
  assertUniqueFeaturedRanks(posts)
  return posts
}

function rewriteBodyMediaReferences(
  post: EditorialArchive['posts'][number],
  mediaPaths: ReadonlyMap<string, string>,
): string {
  let bodyHtml = post.bodyHtml
  for (const [reference, assetPath] of Object.entries(
    post.bodyMediaAssets ?? {},
  )) {
    const publicPath = mediaPaths.get(assetPath)
    if (!publicPath)
      throw new Error(`Approved media is unavailable: ${assetPath}`)
    bodyHtml = bodyHtml.split(reference).join(publicPath)
  }
  return bodyHtml
}

function normalizedArchiveSeoTitle(
  value: string | undefined,
): string | undefined {
  if (!value?.trim()) return value
  const title = value.trim()
  let normalized = ''
  for (const codePoint of title) {
    if (normalized.length + codePoint.length > 70) break
    normalized += codePoint
  }
  return normalized
}

async function approvedMediaPaths(
  database: PostgresQueryable,
  pool: PostgresPool,
  siteId: string,
  archive: EditorialArchive,
  bindings: Readonly<Record<string, ArchiveRestoreMediaBinding>>,
) {
  const mediaRepository = new PostgresMediaRepository(undefined, pool)
  const paths = new Map<string, string>()
  for (const entry of archive.media) {
    const binding = bindings[entry.assetPath]
    if (!binding)
      throw new Error(`Approved media binding is required: ${entry.assetPath}`)
    const media = await mediaRepository.getUsing(
      database,
      binding.mediaId,
      siteId,
    )
    if (!media || media.state !== 'approved' || media.sha256 !== entry.sha256)
      throw new Error(`Approved media is unavailable: ${entry.assetPath}`)
    const variant = media.variants.find(
      (candidate) => candidate.sha256 === binding.variantSha256,
    )
    if (!variant)
      throw new Error(
        `Approved media variant is unavailable: ${entry.assetPath}`,
      )
    paths.set(entry.assetPath, variant.publicPath)
  }
  return paths
}

/**
 * Replaces only a pristine checked-in starter state. It is intentionally not a
 * general bulk importer: ordinary content changes use the regular API.
 */
export async function restoreArchive(
  siteId: string,
  input: ArchiveRestoreInput,
  pool: PostgresPool = postgresPool(process.env.DATABASE_URL ?? ''),
): Promise<ArchiveRestoreResult> {
  assertKnownSite(siteId)
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error('A valid expected revision is required')
  assertIdempotencyKey(input.idempotencyKey)
  const digest = archiveDigest(input.archive)

  return runPostgresTransaction(pool, async (client) => {
    const stored = await loadPostgresSiteState(client, siteId, true)
    const existing = await client.query<{
      archive_digest: string
      result: ArchiveRestoreResult
    }>(
      `SELECT archive_digest, result FROM publisher_admin.archive_restore_operations
       WHERE site_id = $1 AND idempotency_key = $2`,
      [siteId, input.idempotencyKey],
    )
    if (existing.rows[0]) {
      if (existing.rows[0].archive_digest !== digest)
        throw new Error(
          'Idempotency key is already bound to different archive content',
        )
      return existing.rows[0].result
    }
    if (stored.revision !== input.expectedRevision)
      throw new Error('Content revision conflict')
    assertUntouchedStarterFixture(siteId, stored.state)

    // Metadata is fetched before any editorial state changes. A rejected
    // binding rolls the transaction back without creating a release.
    const mediaPaths = await approvedMediaPaths(
      client,
      pool,
      siteId,
      input.archive,
      input.media,
    )
    const settings = managedSettings(input.archive)
    const authors = managedAuthors(input.archive, mediaPaths)
    const tags = managedTags(input.archive)
    const posts = managedPosts(
      input.archive,
      settings,
      tags,
      authors,
      mediaPaths,
    )
    const nextState: LocalState = {
      siteId,
      settings,
      authors,
      tags,
      posts,
      snapshots: [],
    }
    const nextRevision = stored.revision + 1
    const result: ArchiveRestoreResult = {
      operationId: randomUUID(),
      siteId,
      archiveDigest: digest,
      revision: nextRevision,
      counts: {
        authors: authors.length,
        tags: tags.length,
        posts: posts.length,
        media: input.archive.media.length,
      },
    }
    const updated = await client.query(
      `UPDATE publisher_admin.site_states
       SET state = $2::jsonb, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE site_id = $1 AND revision = $3`,
      [siteId, JSON.stringify(nextState), stored.revision],
    )
    if (updated.rowCount !== 1) throw new Error('Content revision conflict')
    await client.query(
      'DELETE FROM publisher_admin.articles WHERE site_id = $1',
      [siteId],
    )
    for (const post of posts) {
      const article = articleFromPost(post, settings.locale, post.status)
      await client.query(
        `INSERT INTO publisher_admin.articles (site_id, id, payload, revision, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [
          siteId,
          article.id,
          JSON.stringify({
            ...article,
            revision: 1,
            createdAt: post.createdAt,
          }),
          1,
          new Date().toISOString(),
        ],
      )
    }
    await client.query(
      `INSERT INTO publisher_admin.archive_restore_operations
       (operation_id, site_id, idempotency_key, archive_digest, result)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
      [
        result.operationId,
        siteId,
        input.idempotencyKey,
        digest,
        JSON.stringify(result),
      ],
    )
    return result
  })
}
