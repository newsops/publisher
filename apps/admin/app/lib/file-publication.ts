import { projectPublicPluginSnapshot } from '@publisher/content'
import type { ArticleRepository } from './article-repository'
import { FileBuildJobRepository } from './build-job-repository'
import { FilePluginRepository } from './plugin-repository'
import { deliverSnapshot } from './publisher'
import type { PublishResult } from './repository-contract'
import type { LocalState } from './repository-seed'
import { makeSnapshot } from './repository-validation'

interface FilePublicationInput {
  readonly state: LocalState
  readonly siteId: string
  readonly directory: string
  readonly articleRepository: ArticleRepository
  readonly idempotencyKey: string
  readonly writeState: (state: LocalState) => Promise<void>
}

async function existingResult(
  jobs: FileBuildJobRepository,
  state: LocalState,
  siteId: string,
  idempotencyKey: string,
): Promise<PublishResult | undefined> {
  const existing = await jobs.findByIdempotencyKey(siteId, idempotencyKey)
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

async function createFileSnapshot(
  state: LocalState,
  siteId: string,
  directory: string,
  articleRepository: ArticleRepository,
) {
  return makeSnapshot(
    state.posts,
    state.tags,
    state.settings,
    state.authors,
    siteId,
    await articleRepository.list(),
    projectPublicPluginSnapshot(
      await new FilePluginRepository(directory, siteId).list(),
      siteId,
    ),
    [],
  )
}

async function appendFileSnapshot(
  state: LocalState,
  record: LocalState['snapshots'][number],
  writeState: (state: LocalState) => Promise<void>,
): Promise<void> {
  await writeState({
    ...state,
    snapshots: [...state.snapshots, record],
  })
}

async function enqueueFilePublication(
  jobs: FileBuildJobRepository,
  snapshot: Parameters<typeof deliverSnapshot>[0],
  checksum: string,
  snapshotKey: string | undefined,
  siteId: string,
  idempotencyKey: string,
) {
  return jobs.enqueue({
    siteId,
    snapshotId: snapshot.snapshotId,
    snapshotChecksum: checksum,
    snapshotKey,
    idempotencyKey,
  })
}

export async function publishFileContent({
  state,
  siteId,
  directory,
  articleRepository,
  idempotencyKey,
  writeState,
}: FilePublicationInput): Promise<PublishResult> {
  const jobs = new FileBuildJobRepository(directory)
  const existing = await existingResult(jobs, state, siteId, idempotencyKey)
  if (existing) return existing
  const { snapshot, checksum } = await createFileSnapshot(
    state,
    siteId,
    directory,
    articleRepository,
  )
  const delivery = await deliverSnapshot(snapshot)
  const job = await enqueueFilePublication(
    jobs,
    snapshot,
    checksum,
    delivery.snapshotKey,
    siteId,
    idempotencyKey,
  )
  await appendFileSnapshot(
    state,
    {
      snapshotId: snapshot.snapshotId,
      checksum,
      createdAt: snapshot.generatedAt,
      delivery,
      jobId: job.jobId,
      snapshot,
    },
    writeState,
  )
  return {
    snapshot,
    checksum,
    delivery,
    jobId: job.jobId,
    jobStatus: job.status,
  }
}
