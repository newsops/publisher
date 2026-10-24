import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  applyMigrations,
  createPostgresPool,
} from '../../../../packages/persistence/src/index.ts'
import {
  articleFromPost,
  assertValidArticleVariant,
  deskFixtureApproval,
  figureDirective,
} from '../../../../packages/content/src/index.ts'
import { emptyPayload } from '../../../../packages/content/src/managed-seed.ts'
import { PostgresContentRepository } from '../../../../apps/admin/app/lib/adapters/postgres-content-repository.ts'
import { PostgresArticleRepository } from '../../../../apps/admin/app/lib/adapters/postgres-article-repository.ts'
import { PostgresAdapterRepository } from '../../../../apps/admin/app/lib/adapters/postgres-adapter-repository.ts'
import { hashPassword } from '../../../../apps/admin/app/lib/http/auth.ts'
import { AccountStore } from '../../../../apps/admin/app/lib/adapters/account-store.ts'

export async function createRecoveryDatabase(scope) {
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const db = await PGlite.create()
  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port,
    maxConnections: 8,
  })
  await server.start()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  const pool = createPostgresPool(url, { max: 1 })
  await applyMigrations(url, scope, pool)
  return {
    pool,
    url,
    async close() {
      await pool.end()
      await new Promise((resolve) => setImmediate(resolve))
      await server.stop()
      await db.close()
    },
  }
}

export async function seedRecoverySites(pool) {
  const verifier = await hashPassword('Fixture-password-123!')
  await pool.query(`UPDATE publisher_admin.sites SET canonical_origin = 'https://news.example.com' WHERE site_id = 'default';
    INSERT INTO publisher_admin.sites(site_id,name,canonical_origin) VALUES ('example','Example News','https://example.com');
    INSERT INTO publisher_admin.accounts(id,email,password_hash,role) VALUES ('00000000-0000-4000-8000-000000000001','editor@example.com','private-verifier-fixture','owner');
    INSERT INTO publisher_admin.site_administrators(site_id,account_id) SELECT site_id,'00000000-0000-4000-8000-000000000001'::uuid FROM publisher_admin.sites;
    INSERT INTO publisher_admin.account_sessions(id,account_id,token_hash,expires_at) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',repeat('a',64),CURRENT_TIMESTAMP + INTERVAL '1 day');
    INSERT INTO publisher_admin.site_agent_guidance(site_id,instructions,revision) SELECT site_id,'Private editorial instructions',3 FROM publisher_admin.sites;
    INSERT INTO publisher_admin.archive_restore_operations(operation_id,site_id,idempotency_key,archive_digest,result) VALUES ('00000000-0000-4000-8000-000000000003','example','restore-one',repeat('b',64),'{"revision":5}');
    INSERT INTO publisher_admin.audit_events(id,site_id,actor,event,details) OVERRIDING SYSTEM VALUE VALUES (7,'example','Editor','published','{"sourceRevision":8,"exactInteger":9007199254740993}');`)
  await pool.query('UPDATE publisher_admin.accounts SET password_hash=$1', [
    verifier,
  ])
  const accounts = new AccountStore(pool)
  await accounts.insertAccount(
    '00000000-0000-4000-8000-000000000010',
    'default-editor@example.com',
    verifier,
    'editor',
  )
  await accounts.insertAccount(
    '00000000-0000-4000-8000-000000000011',
    'example-editor@example.com',
    verifier,
    'editor',
  )
  await pool.query(`INSERT INTO publisher_admin.site_administrators(site_id,account_id)
    VALUES ('default','00000000-0000-4000-8000-000000000010'),
    ('example','00000000-0000-4000-8000-000000000011')`)
  for (const [siteId, origin] of [
    ['default', 'https://news.example.com'],
    ['example', 'https://example.com'],
  ]) {
    await seedEditorialSite(pool, siteId, origin)
  }
  await pool.query('UPDATE publisher_admin.site_states SET revision=5')
  return { verifier }
}

async function seedEditorialSite(pool, siteId, origin) {
  const state = emptyPayload(siteId, {
    name: 'Example News',
    canonicalOrigin: origin,
    themeId: 'editorial',
  })
  await pool.query(
    'INSERT INTO publisher_admin.site_states(site_id,state) VALUES ($1,$2::jsonb)',
    [siteId, JSON.stringify(state)],
  )
  const repository = new PostgresContentRepository(siteId, pool)
  await repository.saveCategory(undefined, {
    slug: 'technology',
    name: 'Technology',
  })
  await repository.saveTag(undefined, {
    slug: 'technology',
    name: 'Technology tag',
  })
  await repository.saveAuthor(undefined, {
    slug: 'editor',
    name: 'Editor',
    bio: 'Example editor.',
    editorialPersona: 'Private reporting persona',
  })
  const draft = await repository.save(undefined, {
    sourceId: 'source-one',
    sourceUrl: `${origin}/2026/01/story.html`,
    slug: 'story',
    title: 'Example story',
    excerpt: 'A preserved example story.',
    bodyMarkdown:
      '## Source report\n\nReported **source**.\n\n' +
      figureDirective({
        src: `/media/${'e'.repeat(64)}.webp`,
        alt: 'Official illustration',
        caption: 'Official press image',
        credit: { url: 'https://example.com/press', name: 'Example press' },
      }),
    author: 'Editor',
    authorSlug: 'editor',
    status: 'review',
    publishedAt: '2026-01-01T00:00:00.000Z',
    categories: ['technology'],
    tags: ['technology'],
  })
  const approved = await repository.reviewPost(
    draft.id,
    deskFixtureApproval(draft),
  )
  const post = await repository.save(draft.id, {
    ...approved,
    status: 'published',
  })
  await repository.save(undefined, {
    ...post,
    sourceId: 'source-two',
    slug: 'awaiting-review',
    sourceUrl: `${origin}/2026/01/awaiting-review.html`,
    status: 'review',
    title: 'Pending story',
  })
  const article = {
    ...articleFromPost(post, 'en'),
    revision: 7,
    createdAt: post.createdAt,
  }
  await pool.query(
    'INSERT INTO publisher_admin.articles(site_id,id,payload,revision) VALUES ($1,$2,$3::jsonb,$4)',
    [siteId, article.id, JSON.stringify(article), article.revision],
  )
  await new PostgresArticleRepository(siteId, pool).saveVariant(
    article.id,
    assertValidArticleVariant({
      ...article.variants[0],
      locale: 'ko',
      slug: 'translated-story',
      title: 'Translated example story',
      bodyMarkdown: 'Translated **source**.',
      status: 'review',
      revision: 2,
    }),
    7,
  )
  const adapters = new PostgresAdapterRepository(siteId, pool)
  const installed = await adapters.configure('google.analytics', {
    measurementId: 'G-FIXTURE01',
    consent: 'denied',
  })
  await adapters.setState('google.analytics', 'enabled', installed.revision)
  const publication = await repository.publish('publish-one')
  await pool.query(
    `INSERT INTO publisher_admin.release_records(release_id,site_id,snapshot_id,checksum,status,payload,created_at,updated_at)
    VALUES($1,$2,$3,$4,'ready',$5::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    [
      publication.snapshot.snapshotId,
      siteId,
      publication.snapshot.snapshotId,
      publication.checksum,
      JSON.stringify(publication.delivery.release),
    ],
  )
  const variant = {
    publicPath: `/media/${'e'.repeat(64)}.webp`,
    objectKey: `sites/${siteId}/variant.webp`,
    sha256: 'e'.repeat(64),
    mimeType: 'image/webp',
    byteSize: 50,
    width: 10,
    height: 10,
  }
  await pool.query(
    `INSERT INTO publisher_admin.media(id,site_id,object_key,sha256,mime_type,byte_size,width,height,state,variants,created_at,updated_at)
    VALUES($1,$2,$3,$4,'image/png',100,10,10,'approved',$5::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    [
      randomUUID(),
      siteId,
      `sites/${siteId}/original.png`,
      'c'.repeat(64),
      JSON.stringify([variant]),
    ],
  )
}

export async function createServerRecoveryDatabase(connectionString) {
  const origin = new URL(connectionString)
  if (!['127.0.0.1', 'localhost'].includes(origin.hostname))
    throw new Error(
      'Recovery concurrency fixtures require disposable localhost PostgreSQL',
    )
  const control = createPostgresPool(origin.href, { max: 1 })
  const name = `recovery_${randomUUID().replaceAll('-', '')}`
  await control.query(`CREATE DATABASE ${name}`)
  origin.pathname = `/${name}`
  const pool = createPostgresPool(origin.href, { max: 4 })
  await applyMigrations(origin.href, 'admin', pool)
  return {
    pool,
    async close() {
      await pool.end()
      await control.query(`DROP DATABASE ${name}`)
      await control.end()
    },
  }
}
