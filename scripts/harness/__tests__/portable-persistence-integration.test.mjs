import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import S3rver from 's3rver'
import {
  S3CompatibleObjectStore,
  PostgresMediaRepository,
  applyMigrations,
  createLogicalBackup,
  closePostgresPools,
  createPostgresPool,
  restoreLogicalBackup,
  validateImageUpload,
} from '../../../packages/persistence/src/index.ts'
import {
  approveImage,
  readApprovedMediaPreview,
  uploadImage,
} from '../../../apps/admin/app/lib/media-service.ts'
import { PostgresContentRepository } from '../../../apps/admin/app/lib/postgres-content-repository.ts'
import { PostgresArticleRepository } from '../../../apps/admin/app/lib/postgres-article-repository.ts'
import { seedCheckedInPostgresFixture } from '../../../apps/admin/app/lib/postgres-publication.ts'
import { PostgresBuildJobRepository } from '../../../apps/admin/app/lib/build-job-repository.ts'
import { InMemoryBuildJobRepository } from '../../../packages/publication/src/index.ts'
import { reconcileCheckedInFixture } from '../../../packages/persistence/scripts/reconcile.ts'
import {
  PostgresCommentStore,
  PostgresRateLimiter,
} from '../../../apps/comments/src/postgres-db.ts'
import { runNextPublicationJob } from '../../../scripts/deploy/publication-worker.ts'
import { restoreArchive } from '../../../apps/admin/app/lib/archive-restore.ts'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function postgresFixture() {
  const database = await PGlite.create()
  const port = await freePort()
  const server = new PGLiteSocketServer({
    db: database,
    host: '127.0.0.1',
    port,
    maxConnections: 12,
  })
  await server.start()
  const pool = createPostgresPool(
    `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    { max: 4 },
  )
  return {
    pool,
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    async close() {
      await pool.end()
      await new Promise((resolve) => setImmediate(resolve))
      await server.stop()
      await database.close()
    },
  }
}

function createWorkerSnapshot(snapshotId = 'worker-fixture') {
  return {
    schemaVersion: 4,
    siteId: 'default',
    snapshotId,
    generatedAt: '2026-09-11T00:00:00.000Z',
    settings: {
      name: 'Worker News',
      shortName: 'Worker',
      description: 'Fixture publication',
      canonicalOrigin: 'https://worker.example.test',
      language: 'en',
      locale: 'en-US',
      publisherName: 'Worker News',
      themeId: 'editorial',
    },
    authors: [
      {
        slug: 'editor',
        name: 'Editor',
        bio: 'Fixture editor',
        active: true,
      },
    ],
    tags: [{ slug: 'Technology', name: 'Technology', active: true }],
    posts: [
      {
        sourceId: 'worker-1',
        sourceUrl: 'https://worker.example.test/2026/09/worker-story.html',
        slug: 'worker-story',
        title: 'Worker story',
        excerpt: 'A static worker fixture.',
        bodyHtml:
          '<h2 style="color:red" onclick="alert(1)">Static section</h2><script>alert(1)</script><p>Readable without services.</p>',
        author: 'Editor',
        authorSlug: 'editor',
        seoTitle: 'Worker story',
        seoDescription: 'A static worker fixture.',
        publishedAt: '2026-09-11T00:00:00.000Z',
        updatedAt: '2026-09-11T00:00:00.000Z',
        categories: ['Technology'],
        featured: true,
        featuredRank: 1,
      },
    ],
    articles: [],
    plugins: { schemaVersion: 1, installations: [] },
    media: [],
  }
}

describe('INFRA-005 PostgreSQL integration', () => {
  it('keeps empty PostgreSQL empty until fixture reconciliation is explicit', async () => {
    const database = await postgresFixture()
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      await expect(
        new PostgresContentRepository('default', database.pool).list(),
      ).rejects.toThrow('Content state is unavailable')
      await expect(
        new PostgresArticleRepository('default', database.pool).list(),
      ).resolves.toEqual([])
      expect(
        await database.pool.query(
          'SELECT site_id FROM publisher_admin.site_states',
        ),
      ).toMatchObject({ rowCount: 0 })
    } finally {
      await database.close()
    }
  }, 30_000)

  it('resolves direct concurrent build-job enqueue calls idempotently', async () => {
    const database = await postgresFixture()
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      const jobs = new PostgresBuildJobRepository(database.pool)
      const input = {
        siteId: 'default',
        snapshotId: 'snapshot-direct-concurrency',
        snapshotChecksum: 'a'.repeat(64),
        snapshotKey: 'sites/default/snapshots/direct.json',
        idempotencyKey: 'direct-concurrent-request',
      }
      const [first, replay] = await Promise.all([
        jobs.enqueue(input),
        jobs.enqueue(input),
      ])
      expect(replay.jobId).toBe(first.jobId)
      await expect(
        jobs.enqueue({ ...input, snapshotId: 'different-snapshot' }),
      ).rejects.toThrow('different build')
    } finally {
      await database.close()
    }
  }, 30_000)

  it('serializes concurrent publishes with the same idempotency key', async () => {
    const database = await postgresFixture()
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      await seedCheckedInPostgresFixture(database.pool, 'default')
      const repository = new PostgresContentRepository('default', database.pool)
      const [first, replay] = await Promise.all([
        repository.publish('concurrent-request'),
        repository.publish('concurrent-request'),
      ])
      expect(replay.jobId).toBe(first.jobId)
      expect(replay.snapshot.snapshotId).toBe(first.snapshot.snapshotId)
      const jobs = await database.pool.query(
        'SELECT job_id FROM publisher_admin.build_jobs',
      )
      const state = await database.pool.query(
        'SELECT state FROM publisher_admin.site_states WHERE site_id = $1',
        ['default'],
      )
      expect(jobs.rowCount).toBe(1)
      expect(state.rows[0].state.snapshots).toHaveLength(1)
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
      await database.close()
    }
  }, 30_000)

  it('restores an archive exactly once from the untouched starter fixture', async () => {
    const database = await postgresFixture()
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      await seedCheckedInPostgresFixture(database.pool, 'default')
      const archive = {
        schemaVersion: 1,
        settings: {
          name: 'Restored News',
          shortName: 'Restored',
          description: 'Generic archive restore fixture.',
          canonicalOrigin: 'https://restore.example.test',
          language: 'en',
          locale: 'en-US',
          publisherName: 'Restored News',
          themeId: 'editorial',
        },
        authors: [{ slug: 'editor', name: 'Editor', bio: 'Archive editor.' }],
        tags: [{ slug: 'General', name: 'General' }],
        media: [],
        posts: [
          {
            sourceId: 'restore-1',
            slug: 'restore-story',
            title: 'Restore story',
            excerpt: 'A generic restored article.',
            bodyHtml: '<p>Restored through the API contract.</p>',
            author: 'Editor',
            authorSlug: 'editor',
            seoTitle: 'R'.repeat(71),
            seoDescription: 'A generic restored article.',
            publishedAt: '2026-09-13T00:00:00.000Z',
            categories: ['General'],
          },
        ],
      }
      const input = {
        archive,
        expectedRevision: 1,
        idempotencyKey: 'restore-fixture-001',
        media: {},
      }
      const first = await restoreArchive('default', input, database.pool)
      const replay = await restoreArchive('default', input, database.pool)
      expect(replay).toEqual(first)
      expect(first.counts).toEqual({ authors: 1, tags: 1, posts: 1, media: 0 })
      const state = await database.pool.query(
        'SELECT state, revision FROM publisher_admin.site_states WHERE site_id = $1',
        ['default'],
      )
      expect(state.rows[0].revision).toBe('2')
      expect(state.rows[0].state.posts).toHaveLength(1)
      expect(archive.posts[0].seoTitle).toHaveLength(71)
      expect(state.rows[0].state.posts[0].seoTitle).toHaveLength(70)
      expect(state.rows[0].state.snapshots).toEqual([])
      expect(
        await database.pool.query(
          'SELECT id FROM publisher_admin.articles WHERE site_id = $1',
          ['default'],
        ),
      ).toMatchObject({ rowCount: 1 })
      const beforeRejectedRestore = await database.pool.query(
        'SELECT state, revision FROM publisher_admin.site_states WHERE site_id = $1',
        ['default'],
      )
      await expect(
        restoreArchive(
          'default',
          {
            ...input,
            expectedRevision: 2,
            idempotencyKey: 'restore-fixture-002',
          },
          database.pool,
        ),
      ).rejects.toThrow('untouched starter fixture')
      await expect(
        restoreArchive(
          'default',
          {
            ...input,
            archive: {
              ...archive,
              settings: { ...archive.settings, name: 'Different' },
            },
          },
          database.pool,
        ),
      ).rejects.toThrow('different archive content')
      const afterRejectedRestore = await database.pool.query(
        'SELECT state, revision FROM publisher_admin.site_states WHERE site_id = $1',
        ['default'],
      )
      expect(afterRejectedRestore.rows[0]).toEqual(
        beforeRejectedRestore.rows[0],
      )
    } finally {
      await database.close()
    }
  }, 30_000)

  it('migrates, publishes idempotently, and restores admin data by checksum', async () => {
    const source = await postgresFixture()
    const target = await postgresFixture()
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      expect(await applyMigrations(source.url, 'admin', source.pool)).toEqual([
        '0001_initial.sql',
        '0002_local_accounts.sql',
        '0003_archive_restore_operations.sql',
        '0004_site_registry.sql',
        '0005_site_agent_guidance.sql',
      ])
      expect(await applyMigrations(source.url, 'admin', source.pool)).toEqual(
        [],
      )
      await seedCheckedInPostgresFixture(source.pool, 'default')
      const repository = new PostgresContentRepository('default', source.pool)
      const first = await repository.publish('same-request')
      const replay = await repository.publish('same-request')
      expect(first.jobId).toBe(replay.jobId)
      expect(first.snapshot.snapshotId).toBe(replay.snapshot.snapshotId)
      expect(first.checksum).toBe(replay.checksum)
      expect(first.jobStatus).toBe('queued')
      await source.pool.query(
        `INSERT INTO publisher_admin.audit_events
         (site_id, actor, event, details)
         VALUES ($1, $2, $3, $4::jsonb)`,
        ['default', 'test@example.com', 'fixture.published', '{}'],
      )
      const mediaRepository = new PostgresMediaRepository(
        undefined,
        source.pool,
      )
      const media = await mediaRepository.createPending({
        siteId: 'default',
        objectKey: `sites/default/media/${'a'.repeat(64)}/original.png`,
        sha256: 'a'.repeat(64),
        mimeType: 'image/png',
        byteSize: 68,
        width: 1,
        height: 1,
      })
      await mediaRepository.approve(media.id, 'default', [
        {
          publicPath: `/media/${'b'.repeat(64)}.webp`,
          objectKey: `sites/default/media/${'a'.repeat(64)}/variants/${'b'.repeat(64)}.webp`,
          sha256: 'b'.repeat(64),
          mimeType: 'image/webp',
          byteSize: 44,
          width: 1,
          height: 1,
        },
      ])

      const backup = await createLogicalBackup(source.pool, 'admin')
      expect(backup.rowCounts['publisher_admin.site_states']).toBe(1)
      expect(backup.rowCounts['publisher_admin.build_jobs']).toBe(1)
      expect(backup.rowCounts['publisher_admin.audit_events']).toBe(1)
      expect(backup.rowCounts['publisher_admin.media']).toBe(1)
      await applyMigrations(target.url, 'admin', target.pool)
      await restoreLogicalBackup(target.pool, backup)
      const restored = await createLogicalBackup(target.pool, 'admin')
      expect(restored.dataSha256).toBe(backup.dataSha256)
      expect(restored.rowCounts).toEqual(backup.rowCounts)
      const restoredMedia = await target.pool.query(
        'SELECT variants FROM publisher_admin.media',
      )
      expect(restoredMedia.rows[0].variants).toHaveLength(1)
      const nextAudit = await target.pool.query(
        `INSERT INTO publisher_admin.audit_events
         (site_id, actor, event, details)
         VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
        ['default', 'test@example.com', 'fixture.restored', '{}'],
      )
      expect(Number(nextAudit.rows[0].id)).toBe(2)
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
      await source.close()
      await target.close()
    }
  }, 30_000)

  it('keeps comment data in a separate database and enforces atomic limits', async () => {
    const admin = await postgresFixture()
    const comments = await postgresFixture()
    try {
      await applyMigrations(admin.url, 'admin', admin.pool)
      await applyMigrations(comments.url, 'comments', comments.pool)
      const store = new PostgresCommentStore(comments.url, comments.pool)
      const limiter = new PostgresRateLimiter(comments.url, comments.pool)
      const createdAt = '2026-09-11T00:00:00.000Z'
      await store.createPending({
        id: 'a72f8263-a084-48d4-996c-f6785d6f9b6e',
        siteId: 'default',
        slug: 'portable-postgres',
        authorName: 'Reader',
        body: 'Pending until reviewed.',
        createdAt,
      })
      expect(await store.listApproved('default', 'portable-postgres')).toEqual(
        [],
      )
      await store.setStatus(
        'default',
        'a72f8263-a084-48d4-996c-f6785d6f9b6e',
        'approved',
      )
      expect(
        await store.listApproved('default', 'portable-postgres'),
      ).toHaveLength(1)
      expect(await limiter.consume('ip:fixture', 1, 60)).toBe(true)
      expect(await limiter.consume('ip:fixture', 1, 60)).toBe(false)

      await expect(
        admin.pool.query('SELECT * FROM publisher_comments.comments'),
      ).rejects.toThrow()
      await expect(
        comments.pool.query('SELECT * FROM publisher_admin.site_states'),
      ).rejects.toThrow()
    } finally {
      await admin.close()
      await comments.close()
    }
  }, 30_000)
})

describe('INFRA-005 S3-compatible and image integration', () => {
  let directory
  let server
  let store
  let endpoint

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-s3-'))
    const port = await freePort()
    server = new S3rver({
      address: '127.0.0.1',
      port,
      silent: true,
      directory,
      configureBuckets: [{ name: 'publisher-fixture' }],
    })
    await server.run()
    endpoint = `http://127.0.0.1:${port}`
    store = new S3CompatibleObjectStore({
      endpoint,
      region: 'us-east-1',
      bucket: 'publisher-fixture',
      accessKeyId: 'S3RVER',
      secretAccessKey: 'S3RVER',
      forcePathStyle: true,
      publicBaseUrl: 'https://media.example.test',
    })
  })

  afterAll(async () => {
    if (server) await server.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('imports and reconciles only the checked-in fixture into empty portable stores', async () => {
    const database = await postgresFixture()
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      const imported = await reconcileCheckedInFixture({
        pool: database.pool,
        objectStore: store,
      })
      const verified = await reconcileCheckedInFixture({
        pool: database.pool,
        objectStore: store,
      })
      expect(imported).toMatchObject({
        source: 'checked-in-fixture',
        importedIntoEmptySite: true,
        counts: { posts: 8, tags: 1, authors: 1, media: 0 },
      })
      expect(imported.media).toEqual([])
      const mediaRows = await database.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM publisher_admin.media
         WHERE site_id = 'default' AND state = 'approved'`,
      )
      expect(mediaRows.rows[0].count).toBe(0)
      expect(verified.importedIntoEmptySite).toBe(false)
      expect(verified.fixtureSha256).toBe(imported.fixtureSha256)
    } finally {
      await database.close()
    }
  }, 30_000)

  it('passes put/get/head/list/delete/multipart and signed URL operations', async () => {
    const body = new TextEncoder().encode('portable object')
    await store.put('contract/one.txt', {
      body,
      contentType: 'text/plain',
      sha256: '1'.repeat(64),
    })
    expect(new TextDecoder().decode(await store.get('contract/one.txt'))).toBe(
      'portable object',
    )
    expect(await store.head('contract/one.txt')).toMatchObject({
      key: 'contract/one.txt',
      sha256: '1'.repeat(64),
    })
    expect((await store.list('contract/')).map((item) => item.key)).toContain(
      'contract/one.txt',
    )

    const upload = await store.createMultipart(
      'contract/multipart.bin',
      'application/octet-stream',
    )
    const part = await store.uploadPart(
      upload,
      1,
      new Uint8Array(5 * 1024 * 1024 + 1),
    )
    await store.completeMultipart(upload, [part])
    expect((await store.head('contract/multipart.bin'))?.size).toBe(
      5 * 1024 * 1024 + 1,
    )

    const signedPut = await store.signPut(
      'contract/signed.txt',
      'text/plain',
      60,
    )
    expect(
      (
        await fetch(signedPut, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: 'signed',
        })
      ).ok,
    ).toBe(true)
    const signedGet = await store.signGet('contract/signed.txt', 60)
    expect(await (await fetch(signedGet)).text()).toBe('signed')
    expect(store.publicUrl('a folder/image.webp')).toBe(
      'https://media.example.test/a%20folder/image.webp',
    )
    await store.delete('contract/one.txt')
    expect(await store.head('contract/one.txt')).toBeUndefined()
  }, 30_000)

  it('fully decodes images and rejects size, MIME, extension, checksum, and corruption', async () => {
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    const valid = await validateImageUpload({
      siteId: 'default',
      fileName: 'pixel.png',
      declaredMimeType: 'image/png',
      body: png,
    })
    expect(valid.metadata.objectKey).toMatch(
      /^sites\/default\/media\/[a-f0-9]{64}\/original\.png$/,
    )
    expect(valid.metadata).toMatchObject({ width: 1, height: 1 })
    await expect(
      validateImageUpload({
        siteId: 'default',
        fileName: 'pixel.jpg',
        declaredMimeType: 'image/png',
        body: png,
      }),
    ).rejects.toThrow('extension')
    await expect(
      validateImageUpload({
        siteId: 'default',
        fileName: 'pixel.png',
        declaredMimeType: 'image/jpeg',
        body: png,
      }),
    ).rejects.toThrow('extension')
    await expect(
      validateImageUpload({
        siteId: 'default',
        fileName: 'pixel.png',
        declaredMimeType: 'image/png',
        declaredSha256: '0'.repeat(64),
        body: png,
      }),
    ).rejects.toThrow('checksum')
    await expect(
      validateImageUpload({
        siteId: 'default',
        fileName: 'broken.png',
        declaredMimeType: 'image/png',
        body: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow()
    await expect(
      validateImageUpload({
        siteId: 'default',
        fileName: 'pixel.png',
        declaredMimeType: 'image/png',
        body: png,
        maximumBytes: 1,
      }),
    ).rejects.toThrow('size')
  })

  it('keeps the human media workflow on the portable server-side storage contract', async () => {
    const database = await postgresFixture()
    const previous = {
      databaseUrl: process.env.DATABASE_URL,
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      region: process.env.OBJECT_STORAGE_REGION,
      bucket: process.env.OBJECT_STORAGE_BUCKET,
      accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE,
    }
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    process.env.DATABASE_URL = database.url
    process.env.OBJECT_STORAGE_ENDPOINT = endpoint
    process.env.OBJECT_STORAGE_REGION = 'us-east-1'
    process.env.OBJECT_STORAGE_BUCKET = 'publisher-fixture'
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = 'S3RVER'
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = 'S3RVER'
    process.env.OBJECT_STORAGE_FORCE_PATH_STYLE = 'true'
    try {
      await applyMigrations(database.url, 'admin', database.pool)
      const pending = await uploadImage({
        siteId: 'default',
        fileName: 'pixel.png',
        mimeType: 'image/png',
        body: png,
      })
      expect(pending.state).toBe('pending')
      await expect(
        readApprovedMediaPreview(pending.id, 'default', 'a'.repeat(64)),
      ).resolves.toBeUndefined()

      const approved = await approveImage(pending.id, 'default')
      expect(approved.state).toBe('approved')
      expect(approved.variants).toHaveLength(2)
      const first = approved.variants[0]
      expect(first).toBeDefined()
      const preview = await readApprovedMediaPreview(
        pending.id,
        'default',
        first.sha256,
      )
      expect(preview).toMatchObject({ mimeType: first.mimeType })
      expect(preview?.body.byteLength).toBeGreaterThan(0)
      expect(createHash('sha256').update(preview.body).digest('hex')).toBe(
        first.sha256,
      )

      await seedCheckedInPostgresFixture(database.pool, 'default')
      await restoreArchive(
        'default',
        {
          archive: {
            schemaVersion: 1,
            settings: {
              name: 'Media Restore',
              shortName: 'Media',
              description: 'Generic media restore fixture.',
              canonicalOrigin: 'https://media-restore.example.test',
              language: 'en',
              locale: 'en-US',
              publisherName: 'Media Restore',
              themeId: 'editorial',
            },
            authors: [
              { slug: 'editor', name: 'Editor', bio: 'Fixture editor.' },
            ],
            tags: [{ slug: 'General', name: 'General' }],
            media: [
              {
                assetPath: 'media/pixel.png',
                sha256: pending.sha256,
                mimeType: 'image/png',
                byteSize: png.byteLength,
              },
            ],
            posts: [
              {
                sourceId: 'media-restore-1',
                slug: 'media-restore-story',
                title: 'Media restore story',
                excerpt: 'A generic media restore fixture.',
                bodyHtml:
                  '<p>Media restore fixture.</p><img src="/media/pixel.png" alt="Fixture pixel">',
                author: 'Editor',
                authorSlug: 'editor',
                seoTitle: 'Media restore story',
                seoDescription: 'A generic media restore fixture.',
                publishedAt: '2026-09-13T00:00:00.000Z',
                categories: ['General'],
                imageAsset: 'media/pixel.png',
                bodyMediaAssets: {
                  '/media/pixel.png': 'media/pixel.png',
                },
              },
            ],
          },
          expectedRevision: 1,
          idempotencyKey: 'media-restore-fixture-001',
          media: {
            'media/pixel.png': {
              mediaId: approved.id,
              variantSha256: first.sha256,
            },
          },
        },
        database.pool,
      )
      const restoredState = await database.pool.query(
        'SELECT state FROM publisher_admin.site_states WHERE site_id = $1',
        ['default'],
      )
      expect(restoredState.rows[0].state.posts[0].bodyHtml).toContain(
        first.publicPath,
      )
      expect(restoredState.rows[0].state.posts[0].bodyHtml).not.toContain(
        '/media/pixel.png',
      )
      const published = await new PostgresContentRepository(
        'default',
        database.pool,
      ).publish('media-restore-publication-001')
      expect(published.snapshot.media).toContainEqual(
        expect.objectContaining({
          sha256: first.sha256,
          publicPath: first.publicPath,
        }),
      )
    } finally {
      await closePostgresPools()
      for (const [key, value] of Object.entries(previous)) {
        const name =
          key === 'databaseUrl'
            ? 'DATABASE_URL'
            : key === 'accessKey'
              ? 'OBJECT_STORAGE_ACCESS_KEY_ID'
              : key === 'secretKey'
                ? 'OBJECT_STORAGE_SECRET_ACCESS_KEY'
                : key === 'forcePathStyle'
                  ? 'OBJECT_STORAGE_FORCE_PATH_STYLE'
                  : `OBJECT_STORAGE_${key.toUpperCase()}`
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      await database.close()
    }
  }, 30_000)

  it('runs the publication worker and stores checksummed HTML before static activation', async () => {
    const deployment = await mkdtemp(path.join(os.tmpdir(), 'worker-output-'))
    const snapshot = createWorkerSnapshot()
    try {
      const snapshotBody = JSON.stringify(snapshot)
      const snapshotKey = 'snapshots/worker-fixture.json'
      await store.put(snapshotKey, {
        body: snapshotBody,
        contentType: 'application/json',
      })
      const jobs = new InMemoryBuildJobRepository()
      const queued = await jobs.enqueue({
        siteId: 'default',
        snapshotId: snapshot.snapshotId,
        snapshotChecksum: createHash('sha256')
          .update(snapshotBody)
          .digest('hex'),
        snapshotKey,
        idempotencyKey: 'worker-fixture-request',
      })
      const result = await runNextPublicationJob({
        jobs,
        objectStore: store,
        deploymentRoot: deployment,
        candidateSmoke: async ({ directory, manifest }) => {
          expect(directory).toContain('/releases/worker-fixture')
          expect(manifest.releaseId).toBe('worker-fixture')
          await expect(
            readFile(path.join(deployment, 'current.json')),
          ).rejects.toThrow()
        },
      })
      expect(result).toMatchObject({
        jobId: queued.jobId,
        status: 'published',
        attempts: 1,
      })
      const objects = await store.list('artifacts/sha256/')
      expect(objects.some((object) => object.key.endsWith('.html'))).toBe(true)
      expect(
        await store.head('manifests/default/worker-fixture.json'),
      ).toBeDefined()
      const html = await readFile(
        path.join(
          deployment,
          'releases/worker-fixture/2026/09/worker-story.html',
        ),
        'utf8',
      )
      expect(html).toContain('<h1>Worker story</h1>')
      expect(html).toContain('NewsArticle')
      expect(html).not.toContain('onclick=')
      expect(html).not.toContain('style=')
      expect(html).not.toContain('<script>alert(1)</script>')
      expect(
        JSON.parse(
          await readFile(path.join(deployment, 'current.json'), 'utf8'),
        ),
      ).toEqual({ releaseId: 'worker-fixture' })
    } finally {
      await rm(deployment, { recursive: true, force: true })
    }
  }, 30_000)

  it('keeps a failed candidate smoke test inactive and permits a safe retry', async () => {
    const deployment = await mkdtemp(path.join(os.tmpdir(), 'worker-smoke-'))
    const snapshot = createWorkerSnapshot('worker-smoke-failure')
    const snapshotBody = JSON.stringify(snapshot)
    const snapshotKey = 'snapshots/worker-smoke-failure.json'
    const jobs = new InMemoryBuildJobRepository()
    try {
      await store.put(snapshotKey, {
        body: snapshotBody,
        contentType: 'application/json',
      })
      const queued = await jobs.enqueue({
        siteId: 'default',
        snapshotId: snapshot.snapshotId,
        snapshotChecksum: createHash('sha256')
          .update(snapshotBody)
          .digest('hex'),
        snapshotKey,
        idempotencyKey: 'worker-smoke-failure-request',
      })
      await expect(
        runNextPublicationJob({
          jobs,
          objectStore: store,
          deploymentRoot: deployment,
          candidateSmoke: async () => {
            throw new Error('candidate smoke failed')
          },
        }),
      ).rejects.toThrow('candidate smoke failed')
      expect(await jobs.get(queued.jobId)).toMatchObject({ status: 'failed' })
      await expect(
        readFile(path.join(deployment, 'current.json')),
      ).rejects.toThrow()

      await jobs.retry(queued.jobId)
      await expect(
        runNextPublicationJob({
          jobs,
          objectStore: store,
          deploymentRoot: deployment,
        }),
      ).resolves.toMatchObject({ status: 'published', attempts: 2 })
      expect(
        JSON.parse(
          await readFile(path.join(deployment, 'current.json'), 'utf8'),
        ),
      ).toEqual({ releaseId: snapshot.snapshotId })
    } finally {
      await rm(deployment, { recursive: true, force: true })
    }
  }, 30_000)

  it('marks a corrupted queued snapshot failed without changing the active release', async () => {
    const deployment = await mkdtemp(path.join(os.tmpdir(), 'worker-failed-'))
    const jobs = new InMemoryBuildJobRepository()
    const snapshotKey = 'snapshots/corrupted.json'
    try {
      await store.put(snapshotKey, {
        body: JSON.stringify({ schemaVersion: 4 }),
        contentType: 'application/json',
      })
      const queued = await jobs.enqueue({
        siteId: 'default',
        snapshotId: 'corrupted',
        snapshotChecksum: '0'.repeat(64),
        snapshotKey,
        idempotencyKey: 'corrupted-request',
      })
      await expect(
        runNextPublicationJob({
          jobs,
          objectStore: store,
          deploymentRoot: deployment,
        }),
      ).rejects.toThrow('checksum mismatch')
      expect(await jobs.get(queued.jobId)).toMatchObject({ status: 'failed' })
      await expect(
        readFile(path.join(deployment, 'current.json')),
      ).rejects.toThrow()
    } finally {
      await rm(deployment, { recursive: true, force: true })
    }
  })
})
