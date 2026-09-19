import {
  projectPublicPluginSnapshot,
  withCanonicalBody,
} from '@publisher/content'
import {
  PostgresMediaRepository,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import { PostgresArticleRepository } from './postgres-article-repository'
import { PostgresBuildJobRepository } from '@publisher/persistence'
import { PostgresPluginRepository } from './postgres-plugin-repository'
import { deliverSnapshot } from './publisher'
import type { PublishResult } from '../services/repository-contract'
import { initialPayload, type LocalState } from '@publisher/content'
import { makeSnapshot, withDeskGateUpgrade } from '@publisher/content'

export interface StoredPostgresState {
  readonly state: LocalState
  readonly revision: number
}

function freshState(siteId: string): LocalState {
  const payload = initialPayload(siteId)
  return {
    siteId,
    posts: payload.posts,
    tags: payload.tags,
    categories: payload.categories,
    settings: payload.settings,
    authors: payload.authors,
    snapshots: [],
  }
}

export async function seedCheckedInPostgresFixture(
  database: PostgresPool,
  siteId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO publisher_admin.site_states (site_id, state)
     VALUES ($1, $2::jsonb) ON CONFLICT (site_id) DO NOTHING`,
    [siteId, JSON.stringify(freshState(siteId))],
  )
  await new PostgresArticleRepository(siteId, database).seedCheckedInFixture()
}

export async function loadPostgresSiteState(
  database: PostgresQueryable,
  siteId: string,
  lock = false,
): Promise<StoredPostgresState> {
  const result = await database.query<{
    state: LocalState
    revision: string
  }>(
    `SELECT state, revision::text AS revision
     FROM publisher_admin.site_states WHERE site_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [siteId],
  )
  const row = result.rows[0]
  if (!row) throw new Error(`Content state is unavailable: ${siteId}`)
  if (row.state.siteId !== siteId)
    throw new Error('Content repository site mismatch')
  return {
    state: {
      ...row.state,
      categories: row.state.categories ?? row.state.tags,
      posts: row.state.posts.map((post) =>
        withDeskGateUpgrade(
          withCanonicalBody({ ...post, tags: post.tags ?? [] }, post.slug, {
            onImportError: 'lenient',
          }),
        ),
      ),
      authors: row.state.authors.map((author) => ({
        ...author,
        editorialPersona: author.editorialPersona ?? '',
      })),
    },
    revision: Number(row.revision),
  }
}

function snapshotMedia(
  media: Awaited<ReturnType<PostgresMediaRepository['listApprovedUsing']>>,
) {
  return media.flatMap((item) =>
    item.variants.map((variant) => ({
      id: `${item.id}:${variant.sha256}`,
      publicPath: variant.publicPath,
      objectKey: variant.objectKey,
      sha256: variant.sha256,
      mimeType: variant.mimeType,
      byteSize: variant.byteSize,
    })),
  )
}

async function existingPostgresPublication(
  database: PostgresQueryable,
  jobs: PostgresBuildJobRepository,
  state: LocalState,
  siteId: string,
  idempotencyKey: string,
): Promise<PublishResult | undefined> {
  const existing = await jobs.findByIdempotencyKeyUsing(
    database,
    siteId,
    idempotencyKey,
  )
  if (!existing) return undefined
  const record = state.snapshots.find(
    (item) => item.snapshotId === existing.snapshotId,
  )
  if (!record?.snapshot)
    throw new Error('Idempotent publication snapshot is unavailable')
  return {
    snapshot: record.snapshot,
    checksum: record.checksum,
    delivery: record.delivery,
    jobId: existing.jobId,
    jobStatus: existing.status,
  }
}

async function createPostgresSnapshot(
  database: PostgresQueryable,
  pool: PostgresPool,
  state: LocalState,
  siteId: string,
) {
  const articles = new PostgresArticleRepository(siteId, pool)
  const plugins = new PostgresPluginRepository(siteId, pool)
  const media = new PostgresMediaRepository(undefined, pool)
  return makeSnapshot(
    state.posts,
    state.tags,
    state.settings,
    state.authors,
    siteId,
    await articles.listUsing(database),
    projectPublicPluginSnapshot(await plugins.listUsing(database), siteId),
    snapshotMedia(await media.listApprovedUsing(database, siteId)),
    state.categories,
  )
}

async function persistPublishedState(
  database: PostgresQueryable,
  siteId: string,
  stored: StoredPostgresState,
  nextState: LocalState,
): Promise<void> {
  const updated = await database.query(
    `UPDATE publisher_admin.site_states
     SET state = $2::jsonb, revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE site_id = $1 AND revision = $3`,
    [siteId, JSON.stringify(nextState), stored.revision],
  )
  if (updated.rowCount !== 1)
    throw new Error('Content changed during publication')
}

function withSnapshot(
  state: LocalState,
  record: LocalState['snapshots'][number],
): LocalState {
  return { ...state, snapshots: [...state.snapshots, record] }
}

async function publishPostgresUsing(
  client: PostgresQueryable,
  pool: PostgresPool,
  siteId: string,
  idempotencyKey: string,
): Promise<PublishResult> {
  const stored = await loadPostgresSiteState(client, siteId, true)
  const jobs = new PostgresBuildJobRepository(pool)
  const existing = await existingPostgresPublication(
    client,
    jobs,
    stored.state,
    siteId,
    idempotencyKey,
  )
  if (existing) return existing
  const { snapshot, checksum } = await createPostgresSnapshot(
    client,
    pool,
    stored.state,
    siteId,
  )
  const delivery = await deliverSnapshot(snapshot)
  const job = await jobs.enqueueUsing(client, {
    siteId,
    snapshotId: snapshot.snapshotId,
    snapshotChecksum: checksum,
    snapshotKey: delivery.snapshotKey,
    idempotencyKey,
  })
  const nextState = withSnapshot(stored.state, {
    snapshotId: snapshot.snapshotId,
    checksum,
    createdAt: snapshot.generatedAt,
    delivery,
    jobId: job.jobId,
    snapshot,
  })
  await persistPublishedState(client, siteId, stored, nextState)
  return {
    snapshot,
    checksum,
    delivery,
    jobId: job.jobId,
    jobStatus: job.status,
  }
}

export async function publishPostgresContent(
  siteId: string,
  pool: PostgresPool,
  idempotencyKey: string,
): Promise<PublishResult> {
  return runPostgresTransaction(pool, (client) =>
    publishPostgresUsing(client, pool, siteId, idempotencyKey),
  )
}
