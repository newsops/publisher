import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  publicArchiveMonthPath,
  publicAuthorPath,
  publicCategoryPath,
  publicPostPath,
  sanitizeBodyHtml,
  getTheme,
  type ContentSnapshot,
} from '../../packages/content/src/index'
import {
  FileSystemStaticDeployment,
  PUBLICATION_BASELINE_VERSION,
  PUBLICATION_RUNTIME_VERSION,
  PUBLICATION_SEMANTIC_VERSION,
  buildIncrementalRelease,
  createPublicationRecipes,
  type BuildJob,
  type BuildJobRepository,
  type BuildJobStatus,
  type PublicationInputs,
  type ReadableArtifactStore,
  type ReleaseManifest,
  verifyPublicationCandidate,
} from '../../packages/publication/src/index'
import type { ObjectStore } from '../../packages/persistence/src/index'
import {
  ObjectArtifactStore,
  persistReleaseManifest,
  sha256Bytes,
} from './publication-worker-artifacts'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

export function snapshotFromBytes(bytes: Uint8Array): ContentSnapshot {
  const snapshot = JSON.parse(
    new TextDecoder().decode(bytes),
  ) as ContentSnapshot
  if (
    snapshot.schemaVersion !== 4 ||
    !snapshot.snapshotId ||
    !snapshot.siteId ||
    !Array.isArray(snapshot.posts) ||
    !Array.isArray(snapshot.media)
  )
    throw new Error('Publication worker requires a schemaVersion 4 snapshot')
  return snapshot
}

async function selectedTheme(snapshot: ContentSnapshot) {
  const theme = getTheme(snapshot.settings.themeId)
  if (theme.id !== snapshot.settings.themeId)
    throw new Error(`Unknown theme: ${snapshot.settings.themeId}`)
  return theme
}

async function materializedMedia(
  snapshot: ContentSnapshot,
  store: ObjectStore,
) {
  return Promise.all(
    snapshot.media.map(async (item) => {
      const body = await store.get(item.objectKey)
      if (
        body.byteLength !== item.byteSize ||
        sha256Bytes(body) !== item.sha256
      )
        throw new Error(`Snapshot media verification failed: ${item.id}`)
      return { ...item, body }
    }),
  )
}

function articleInputs(snapshot: ContentSnapshot) {
  const authors = new Map(
    snapshot.authors.map((author) => [author.slug, author]),
  )
  return [...snapshot.posts]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .map((post) => ({
      id: post.sourceId,
      slug: post.slug,
      path: publicPostPath(post),
      title: post.title,
      seoTitle: post.seoTitle,
      description: post.seoDescription,
      bodyHtml: sanitizeBodyHtml(post.bodyHtml),
      authorName: authors.get(post.authorSlug)?.name ?? post.author,
      authorPath: publicAuthorPath(post.authorSlug),
      category: post.categories[0] ?? 'News',
      categoryPath: publicCategoryPath(post.categories[0] ?? 'News'),
      archivePath: publicArchiveMonthPath(post.publishedAt),
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      imageUrl: post.imageUrl,
      imageAlt: post.title,
    }))
}

export async function publicationInputs(
  snapshot: ContentSnapshot,
  store: ObjectStore,
): Promise<PublicationInputs> {
  const articles = articleInputs(snapshot)
  const commentOrigin = process.env.COMMENTS_PUBLIC_ORIGIN?.trim()
  const commentSubmissionEnabled =
    process.env.COMMENTS_SUBMISSION_ENABLED === 'true'
  const humanVerificationSiteKey =
    process.env.HUMAN_VERIFICATION_SITE_KEY?.trim()
  const humanVerificationScriptUrl =
    process.env.HUMAN_VERIFICATION_SCRIPT_URL?.trim()
  const humanVerificationGlobal = process.env.HUMAN_VERIFICATION_GLOBAL?.trim()
  if (
    commentSubmissionEnabled &&
    (!commentOrigin ||
      !humanVerificationSiteKey ||
      !humanVerificationScriptUrl ||
      !humanVerificationGlobal)
  )
    throw new Error(
      'COMMENTS_SUBMISSION_ENABLED requires COMMENTS_PUBLIC_ORIGIN and human-verification public configuration',
    )
  return {
    siteId: snapshot.siteId,
    origin: snapshot.settings.canonicalOrigin,
    publicationName: snapshot.settings.name,
    language: snapshot.settings.language,
    semanticVersion: PUBLICATION_SEMANTIC_VERSION,
    runtimeVersion: PUBLICATION_RUNTIME_VERSION,
    baselineVersion: PUBLICATION_BASELINE_VERSION,
    articles,
    recent: {
      generatedAt: snapshot.generatedAt,
      slugs: articles.slice(0, 10).map((article) => article.slug),
    },
    theme: await selectedTheme(snapshot),
    media: await materializedMedia(snapshot, store),
    ...(commentOrigin
      ? {
          commentRuntime: {
            origin: commentOrigin.replace(/\/$/, ''),
            siteId: snapshot.siteId,
            submissionEnabled: commentSubmissionEnabled,
            ...(humanVerificationSiteKey &&
            humanVerificationScriptUrl &&
            humanVerificationGlobal
              ? {
                  humanVerification: {
                    siteKey: humanVerificationSiteKey,
                    scriptUrl: humanVerificationScriptUrl,
                    globalName: humanVerificationGlobal,
                  },
                }
              : {}),
          },
        }
      : {}),
  }
}

async function failJob(
  jobs: BuildJobRepository,
  job: BuildJob,
  status: BuildJobStatus,
  error: unknown,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error)
  try {
    await jobs.transition(job.jobId, status, 'failed', message.slice(0, 2_000))
  } catch (transitionError) {
    throw new AggregateError(
      [error, transitionError],
      `Publication failed and job ${job.jobId} could not be marked failed`,
    )
  }
  throw error
}

interface CandidateSmoke {
  (candidate: {
    readonly directory: string
    readonly manifest: ReleaseManifest
  }): Promise<void>
}

async function processClaimedJob({
  job,
  jobs,
  objectStore,
  deploymentRoot,
  progress,
  candidateSmoke,
}: {
  readonly job: BuildJob
  readonly jobs: BuildJobRepository
  readonly objectStore: ObjectStore
  readonly deploymentRoot: string
  readonly progress: { status: BuildJobStatus }
  readonly candidateSmoke?: CandidateSmoke
}): Promise<void> {
  if (!job.snapshotKey)
    throw new Error('Queued publication has no immutable snapshot key')
  const snapshotBytes = await objectStore.get(job.snapshotKey)
  if (sha256Bytes(snapshotBytes) !== job.snapshotChecksum)
    throw new Error('Queued publication snapshot checksum mismatch')
  const snapshot = snapshotFromBytes(snapshotBytes)
  if (snapshot.siteId !== job.siteId || snapshot.snapshotId !== job.snapshotId)
    throw new Error('Queued publication snapshot identity mismatch')

  const deployment = new FileSystemStaticDeployment(deploymentRoot)
  const expectedReleaseId = await deployment.currentReleaseId()
  const current = expectedReleaseId
    ? await deployment.readReleaseManifest(expectedReleaseId)
    : undefined
  const result = await runPublicationWorker({ objectStore, snapshot, current })
  await jobs.transition(job.jobId, progress.status, 'verifying')
  progress.status = 'verifying'
  if (result.changed) {
    const directory = await deployment.materializeCandidate(
      result.manifest,
      new ObjectArtifactStore(objectStore),
    )
    await deployment.verifyRelease(result.manifest.releaseId)
    await candidateSmoke?.({ directory, manifest: result.manifest })
  }
  await jobs.transition(job.jobId, progress.status, 'ready')
  progress.status = 'ready'
  if (result.changed)
    await deployment.activate(expectedReleaseId, result.manifest.releaseId)
}

export async function runNextPublicationJob({
  jobs,
  objectStore,
  deploymentRoot,
  siteId,
  candidateSmoke,
}: {
  readonly jobs: BuildJobRepository
  readonly objectStore: ObjectStore
  readonly deploymentRoot: string
  readonly siteId?: string
  readonly candidateSmoke?: CandidateSmoke
}): Promise<BuildJob | undefined> {
  const job = await jobs.claimNext(siteId)
  if (!job) return undefined
  const progress: { status: BuildJobStatus } = { status: 'running' }
  try {
    await processClaimedJob({
      job,
      jobs,
      objectStore,
      deploymentRoot,
      progress,
      candidateSmoke,
    })
    const published = await jobs.transition(
      job.jobId,
      progress.status,
      'published',
    )
    return published
  } catch (error) {
    return failJob(jobs, job, progress.status, error)
  }
}

async function optionallyMaterialize({
  deploymentRoot,
  activate,
  result,
  store,
}: {
  readonly deploymentRoot?: string
  readonly activate: boolean
  readonly result: Awaited<ReturnType<typeof buildIncrementalRelease>>
  readonly store: ReadableArtifactStore
}): Promise<void> {
  if (!deploymentRoot || !result.changed) return
  const deployment = new FileSystemStaticDeployment(deploymentRoot)
  await deployment.materializeCandidate(result.manifest, store)
  if (activate)
    await deployment.activate(
      result.manifest.parentReleaseId,
      result.manifest.releaseId,
    )
}

export async function runPublicationWorker({
  objectStore,
  snapshot,
  current,
  deploymentRoot,
  activate = false,
  manifestOutput,
}: {
  readonly objectStore: ObjectStore
  readonly snapshot: ContentSnapshot
  readonly current?: ReleaseManifest
  readonly deploymentRoot?: string
  readonly activate?: boolean
  readonly manifestOutput?: string
}) {
  const inputs = await publicationInputs(snapshot, objectStore)
  const graph = createPublicationRecipes(inputs)
  const artifactStore = new ObjectArtifactStore(objectStore)
  const result = await buildIncrementalRelease({
    siteId: snapshot.siteId,
    releaseId: snapshot.snapshotId,
    dependencies: graph.dependencies,
    recipes: graph.recipes,
    store: artifactStore,
    current,
    generatedAt: snapshot.generatedAt,
  })
  await verifyPublicationCandidate(result.manifest, artifactStore, current)
  await persistReleaseManifest(objectStore, result.manifest, manifestOutput)
  await optionallyMaterialize({
    deploymentRoot,
    activate,
    result,
    store: artifactStore,
  })

  return result
}
