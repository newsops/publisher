import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PostgresBuildJobRepository } from '../../../apps/admin/app/lib/build-job-repository'
import { PostgresContentRepository } from '../../../apps/admin/app/lib/postgres-content-repository'
import { runNextPublicationJob } from '../../../scripts/deploy/publication-worker-core'
import { reconcileCheckedInFixture } from './reconcile'
import { createLogicalBackup, restoreLogicalBackup } from '../src/recovery'
import { applyMigrations } from '../src/migrations'
import {
  createImageVariants,
  PostgresMediaRepository,
  validateImageUpload,
} from '../src/media'
import { S3CompatibleObjectStore } from '../src/object-storage'
import { createPostgresPool } from '../src/postgres'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const adminUrl = required('DATABASE_URL')
const commentsUrl = required('COMMENTS_DATABASE_URL')
const adminRestoreUrl = required('RESTORE_DATABASE_URL')
const commentsRestoreUrl = required('COMMENTS_RESTORE_DATABASE_URL')
const admin = createPostgresPool(adminUrl, { max: 3 })
const comments = createPostgresPool(commentsUrl, { max: 2 })
const adminRestore = createPostgresPool(adminRestoreUrl, { max: 1 })
const commentsRestore = createPostgresPool(commentsRestoreUrl, { max: 1 })
const store = new S3CompatibleObjectStore({
  endpoint: required('OBJECT_STORAGE_ENDPOINT'),
  region: required('OBJECT_STORAGE_REGION'),
  bucket: required('OBJECT_STORAGE_BUCKET'),
  accessKeyId: required('OBJECT_STORAGE_ACCESS_KEY_ID'),
  secretAccessKey: required('OBJECT_STORAGE_SECRET_ACCESS_KEY'),
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
})

async function uploadFixtureImage(): Promise<void> {
  const body = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  const validated = await validateImageUpload({
    siteId: 'default',
    fileName: 'clean-room.png',
    declaredMimeType: 'image/png',
    body,
  })
  await store.put(validated.metadata.objectKey, {
    body,
    contentType: validated.metadata.mimeType,
    sha256: validated.metadata.sha256,
  })
  const media = await new PostgresMediaRepository(
    undefined,
    admin,
  ).createPending(validated.metadata)
  const variants = await createImageVariants(body, media.siteId, media.sha256)
  for (const variant of variants)
    await store.put(variant.metadata.objectKey, {
      body: variant.body,
      contentType: variant.metadata.mimeType,
      sha256: variant.metadata.sha256,
    })
  await new PostgresMediaRepository(undefined, admin).approve(
    media.id,
    media.siteId,
    variants.map((variant) => variant.metadata),
  )
}

async function verifyRestore(): Promise<{
  readonly adminSha256: string
  readonly commentsSha256: string
}> {
  const adminBackup = await createLogicalBackup(admin, 'admin')
  const commentsBackup = await createLogicalBackup(comments, 'comments')
  await applyMigrations(adminRestoreUrl, 'admin', adminRestore)
  await applyMigrations(commentsRestoreUrl, 'comments', commentsRestore)
  await restoreLogicalBackup(adminRestore, adminBackup)
  await restoreLogicalBackup(commentsRestore, commentsBackup)
  const [restoredAdmin, restoredComments] = await Promise.all([
    createLogicalBackup(adminRestore, 'admin'),
    createLogicalBackup(commentsRestore, 'comments'),
  ])
  if (
    restoredAdmin.dataSha256 !== adminBackup.dataSha256 ||
    restoredComments.dataSha256 !== commentsBackup.dataSha256
  )
    throw new Error('Clean-room restore checksum mismatch')
  return {
    adminSha256: restoredAdmin.dataSha256,
    commentsSha256: restoredComments.dataSha256,
  }
}

async function expectDatabaseIsolation(
  query: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await query()
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : ''
    if (code === '42P01' || code === '42501') return
    throw error
  }
  throw new Error(message)
}

const deployment = await mkdtemp(
  path.join(os.tmpdir(), 'publisher-clean-room-'),
)
try {
  await applyMigrations(adminUrl, 'admin', admin)
  await applyMigrations(commentsUrl, 'comments', comments)
  await Promise.all([
    expectDatabaseIsolation(
      () => admin.query('SELECT * FROM publisher_comments.comments'),
      'Admin database unexpectedly exposed comment tables',
    ),
    expectDatabaseIsolation(
      () => comments.query('SELECT * FROM publisher_admin.site_states'),
      'Comment database unexpectedly exposed admin tables',
    ),
  ])
  const reconciliation = await reconcileCheckedInFixture({
    pool: admin,
    objectStore: store,
  })
  await uploadFixtureImage()
  await comments.query(
    `INSERT INTO publisher_comments.comments
     (id, slug, author_name, body, status, created_at, updated_at)
     VALUES ($1::uuid, 'clean-room', 'Reader', 'Restorable comment',
             'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [randomUUID()],
  )
  const publication = await new PostgresContentRepository(
    'default',
    admin,
  ).publish('clean-room-publish')
  const completed = await runNextPublicationJob({
    jobs: new PostgresBuildJobRepository(admin),
    objectStore: store,
    deploymentRoot: deployment,
  })
  if (completed?.status !== 'published')
    throw new Error('Clean-room publication job did not finish')
  const current = JSON.parse(
    await readFile(path.join(deployment, 'current.json'), 'utf8'),
  ) as { releaseId?: string }
  if (current.releaseId !== publication.snapshot.snapshotId)
    throw new Error('Clean-room static release was not activated')
  const body = new TextEncoder().encode('clean-room-object-contract')
  const sha256 = createHash('sha256').update(body).digest('hex')
  const key = `contract/${sha256}.txt`
  await store.put(key, {
    body,
    contentType: 'text/plain',
    sha256,
  })
  const restored = await store.get(key)
  if (
    createHash('sha256').update(restored).digest('hex') !== sha256 ||
    !(await store.list('contract/')).some((item) => item.key === key)
  )
    throw new Error('S3-compatible clean-room contract failed')
  await store.delete(key)
  if (await store.head(key))
    throw new Error('S3-compatible delete contract failed')
  const restore = await verifyRestore()
  console.log(
    JSON.stringify({
      status: 'passed',
      fixtureSha256: reconciliation.fixtureSha256,
      counts: reconciliation.counts,
      publication: {
        snapshotId: publication.snapshot.snapshotId,
        jobId: completed.jobId,
        status: completed.status,
      },
      restore,
    }),
  )
} finally {
  await rm(deployment, { recursive: true, force: true })
  await Promise.all([
    admin.end(),
    comments.end(),
    adminRestore.end(),
    commentsRestore.end(),
  ])
}
