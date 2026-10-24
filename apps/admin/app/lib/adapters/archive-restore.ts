import { createHash, randomUUID } from 'node:crypto'
import {
  archiveCanonicalJson,
  articleFromPost,
  ContentValidationError,
  type EditorialArchive,
  type LocalState,
} from '@publisher/content'
import {
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import { assertSiteId } from './site-registry'
import { loadPostgresSiteState } from './postgres-publication'
import {
  assertUntouchedStarterFixture,
  assertUntouchedStarterArticles,
  prepareArchiveState,
} from './archive-restore-state'

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

interface RestoreContext {
  readonly siteId: string
  readonly input: ArchiveRestoreInput
  readonly pool: PostgresPool
  readonly digest: string
}

function assertRestoreInput(input: ArchiveRestoreInput): void {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new Error('A valid expected revision is required')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(input.idempotencyKey))
    throw new Error('A valid idempotency key is required')
  for (const post of input.archive.posts) {
    if (post.status !== undefined && post.status !== 'draft')
      throw new ContentValidationError(
        'Archive draft import requires status "draft"; choose draft before importing',
      )
  }
}

async function writeArticles(
  client: PostgresQueryable,
  state: LocalState,
): Promise<void> {
  await client.query(
    'DELETE FROM publisher_admin.articles WHERE site_id = $1',
    [state.siteId],
  )
  for (const post of state.posts) {
    const article = articleFromPost(post, state.settings.locale, post.status)
    await client.query(
      `INSERT INTO publisher_admin.articles (site_id, id, payload, revision, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        state.siteId,
        article.id,
        JSON.stringify({ ...article, revision: 1, createdAt: post.createdAt }),
        1,
        new Date().toISOString(),
      ],
    )
  }
}

async function writeRestore(
  client: PostgresQueryable,
  context: RestoreContext,
  state: LocalState,
  result: ArchiveRestoreResult,
): Promise<void> {
  const { siteId, input, digest } = context
  const updated = await client.query(
    `UPDATE publisher_admin.site_states
     SET state = $2::jsonb, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
     WHERE site_id = $1 AND revision = $3`,
    [siteId, JSON.stringify(state), result.revision - 1],
  )
  if (updated.rowCount !== 1) throw new Error('Content revision conflict')
  await writeArticles(client, state)
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
}

async function restoreUsing(
  client: PostgresQueryable,
  context: RestoreContext,
): Promise<ArchiveRestoreResult> {
  const { siteId, input, pool, digest } = context
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
  await assertUntouchedStarterArticles(client, siteId)
  const state = await prepareArchiveState(client, pool, siteId, input)
  const result: ArchiveRestoreResult = {
    operationId: randomUUID(),
    siteId,
    archiveDigest: digest,
    revision: stored.revision + 1,
    counts: {
      authors: state.authors.length,
      tags: state.tags.length,
      posts: state.posts.length,
      media: input.archive.media.length,
    },
  }
  await writeRestore(client, context, state, result)
  return result
}

/** Imports draft-only interchange into an untouched starter; never full recovery. */
export async function restoreArchive(
  siteId: string,
  input: ArchiveRestoreInput,
  pool: PostgresPool,
): Promise<ArchiveRestoreResult> {
  assertSiteId(siteId)
  assertRestoreInput(input)
  const digest = createHash('sha256')
    .update(archiveCanonicalJson(input.archive))
    .digest('hex')
  return runPostgresTransaction(pool, (client) =>
    restoreUsing(client, { siteId, input, pool, digest }),
  )
}

export interface ArchiveRestoreOperation {
  readonly result: Record<string, unknown>
  readonly createdAt: string
}

/** A completed restore operation by id, for the operations surface. */
export async function findArchiveRestoreOperation(
  siteId: string,
  operationId: string,
  pool: PostgresPool,
): Promise<ArchiveRestoreOperation | undefined> {
  const result = await pool.query<{
    result: Record<string, unknown>
    created_at: Date
  }>(
    `SELECT result, created_at FROM publisher_admin.archive_restore_operations
     WHERE site_id = $1 AND operation_id = $2::uuid`,
    [siteId, operationId],
  )
  const row = result.rows[0]
  return row
    ? { result: row.result, createdAt: row.created_at.toISOString() }
    : undefined
}
