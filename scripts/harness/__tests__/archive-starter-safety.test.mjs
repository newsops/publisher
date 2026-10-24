import { describe, expect, it } from 'vitest'
import { validateEditorialArchive } from '../../../packages/content/src/index.ts'
import { PostgresContentRepository } from '../../../apps/admin/app/lib/adapters/postgres-content-repository.ts'
import { PostgresArticleRepository } from '../../../apps/admin/app/lib/adapters/postgres-article-repository.ts'
import { seedCheckedInPostgresFixture } from '../../../apps/admin/app/lib/adapters/postgres-publication.ts'
import { restoreArchive } from '../../../apps/admin/app/lib/adapters/archive-restore.ts'
import {
  createRecoveryDatabase,
  createServerRecoveryDatabase,
} from './helpers/recovery-fixture.mjs'

function archive() {
  return validateEditorialArchive({
    schemaVersion: 1,
    settings: {
      name: 'Example News',
      shortName: 'Example',
      description: 'Draft interchange.',
      canonicalOrigin: 'https://example.com',
      language: 'en',
      locale: 'en-US',
      publisherName: 'Example News',
      themeId: 'editorial',
    },
    authors: [{ slug: 'editor', name: 'Editor', bio: 'Example editor.' }],
    tags: [{ slug: 'General', name: 'General' }],
    media: [],
    posts: [
      {
        sourceId: 'imported',
        slug: 'imported',
        title: 'Imported draft',
        excerpt: 'A draft.',
        bodyMarkdown: 'Draft source.',
        author: 'Editor',
        authorSlug: 'editor',
        seoTitle: 'Imported draft',
        seoDescription: 'A draft.',
        publishedAt: '2026-01-01T00:00:00.000Z',
        categories: ['General'],
      },
    ],
  })
}

async function state(pool) {
  return {
    sites: (
      await pool.query(
        'SELECT * FROM publisher_admin.site_states ORDER BY site_id',
      )
    ).rows,
    articles: (
      await pool.query(
        'SELECT * FROM publisher_admin.articles ORDER BY site_id,id',
      )
    ).rows,
    operations: (
      await pool.query(
        'SELECT * FROM publisher_admin.archive_restore_operations ORDER BY operation_id',
      )
    ).rows,
  }
}

async function input(pool) {
  const current = await pool.query(
    `SELECT revision::text AS revision FROM publisher_admin.site_states WHERE site_id='default'`,
  )
  return {
    archive: archive(),
    expectedRevision: Number(current.rows[0].revision),
    idempotencyKey: 'starter-safety-001',
    media: {},
  }
}

async function unchangedRejection(pool) {
  const before = await state(pool)
  const observedInput = await input(pool)
  await expect(restoreArchive('default', observedInput, pool)).rejects.toThrow(
    'untouched starter fixture',
  )
  expect(await state(pool)).toEqual(before)
}

describe('INFRA-007 untouched starter preservation', () => {
  it.each(['new category', 'existing category resave'])(
    'rejects a real category-only %s using the current observed revision',
    async (change) => {
      const database = await createRecoveryDatabase('admin')
      try {
        await seedCheckedInPostgresFixture(database.pool, 'default')
        const content = new PostgresContentRepository('default', database.pool)
        if (change === 'new category') {
          await content.saveCategory(undefined, {
            slug: 'new-category',
            name: 'New category',
          })
        } else {
          const current = (await content.listCategories())[0]
          await content.saveCategory(current.slug, current)
        }
        expect((await input(database.pool)).expectedRevision).toBe(2)
        await unchangedRejection(database.pool)
      } finally {
        await database.close()
      }
    },
  )

  it.each(['save variant', 'remove variant'])(
    'rejects independent article %s without relying on site revision changes',
    async (operation) => {
      const database = await createRecoveryDatabase('admin')
      try {
        await seedCheckedInPostgresFixture(database.pool, 'default')
        const repository = new PostgresArticleRepository(
          'default',
          database.pool,
        )
        const article = (await repository.list())[0]
        const translated = await repository.saveVariant(
          article.id,
          {
            ...article.variants[0],
            locale: 'ko',
            slug: 'translated',
            title: 'Translated draft',
            status: 'draft',
          },
          article.revision,
        )
        if (operation === 'remove variant')
          await repository.removeVariant(article.id, 'ko', translated.revision)
        expect((await input(database.pool)).expectedRevision).toBe(1)
        await unchangedRejection(database.pool)
      } finally {
        await database.close()
      }
    },
  )

  it.each(['removed', 'extra', 'mutated', 'sql revision', 'payload revision'])(
    'rejects %s independent article inventory and preserves every record',
    async (change) => {
      const database = await createRecoveryDatabase('admin')
      try {
        await seedCheckedInPostgresFixture(database.pool, 'default')
        const row = (
          await database.pool.query(
            `SELECT * FROM publisher_admin.articles WHERE site_id='default' ORDER BY id LIMIT 1`,
          )
        ).rows[0]
        if (change === 'removed')
          await database.pool.query(
            `DELETE FROM publisher_admin.articles WHERE site_id='default' AND id=$1`,
            [row.id],
          )
        if (change === 'extra')
          await database.pool.query(
            `INSERT INTO publisher_admin.articles(site_id,id,payload,revision) VALUES ('default','extra',$1::jsonb,1)`,
            [JSON.stringify({ ...row.payload, id: 'extra' })],
          )
        if (change === 'mutated')
          await database.pool.query(
            `UPDATE publisher_admin.articles SET payload=jsonb_set(payload,'{variants,0,title}','"Changed title"') WHERE site_id='default' AND id=$1`,
            [row.id],
          )
        if (change === 'sql revision')
          await database.pool.query(
            `UPDATE publisher_admin.articles SET revision=2 WHERE site_id='default' AND id=$1`,
            [row.id],
          )
        if (change === 'payload revision')
          await database.pool.query(
            `UPDATE publisher_admin.articles SET payload=jsonb_set(payload,'{revision}','2') WHERE site_id='default' AND id=$1`,
            [row.id],
          )
        await unchangedRejection(database.pool)
      } finally {
        await database.close()
      }
    },
  )

  it('accepts an untouched inventory and replays its completed operation', async () => {
    const database = await createRecoveryDatabase('admin')
    try {
      await seedCheckedInPostgresFixture(database.pool, 'default')
      const request = await input(database.pool)
      const result = await restoreArchive('default', request, database.pool)
      expect(await restoreArchive('default', request, database.pool)).toEqual(
        result,
      )
      expect((await state(database.pool)).articles).toHaveLength(1)
    } finally {
      await database.close()
    }
  })
})

function interceptDeletion(pool, beforeDelete) {
  return {
    async connect() {
      const client = await pool.connect()
      return {
        async query(sql, values) {
          if (sql.startsWith('DELETE FROM publisher_admin.articles'))
            await beforeDelete(client)
          return client.query(sql, values)
        },
        release() {
          client.release()
        },
      }
    },
  }
}

async function writeDisposition(pool, writerPid, readerPid, writing) {
  let finished = false
  writing.then(
    () => {
      finished = true
    },
    () => {
      finished = true
    },
  )
  for (let attempt = 0; attempt < 300; attempt++) {
    const blocking = await pool.query(
      'SELECT pg_blocking_pids($1) AS blockers',
      [writerPid],
    )
    if (blocking.rows[0].blockers.includes(readerPid)) return 'blocked'
    if (finished) return 'completed'
  }
  throw new Error('Concurrent writer neither completed nor waited for restore')
}

describe.runIf(process.env.PUBLISHER_RECOVERY_TEST_DATABASE_URL)(
  'INFRA-007 serialized starter replacement',
  () => {
    it.each(['insert', 'save variant'])(
      'does not silently erase a concurrent article %s after its inventory check',
      async (operation) => {
        const database = await createServerRecoveryDatabase(
          process.env.PUBLISHER_RECOVERY_TEST_DATABASE_URL,
        )
        let writer
        let writerReleased = false
        let writing
        let disposition
        try {
          await seedCheckedInPostgresFixture(database.pool, 'default')
          const request = await input(database.pool)
          const article = (
            await new PostgresArticleRepository('default', database.pool).list()
          )[0]
          writer = await database.pool.connect()
          const writerPid = (
            await writer.query('SELECT pg_backend_pid() AS pid')
          ).rows[0].pid
          const restoring = interceptDeletion(database.pool, async (reader) => {
            const readerPid = (
              await reader.query('SELECT pg_backend_pid() AS pid')
            ).rows[0].pid
            expect(writerPid).not.toBe(readerPid)
            if (operation === 'insert') {
              writing = writer
                .query(
                  `INSERT INTO publisher_admin.articles(site_id,id,payload,revision) VALUES ('default','concurrent-article',$1::jsonb,1)`,
                  [JSON.stringify({ ...article, id: 'concurrent-article' })],
                )
                .then(() => ({ success: true }))
            } else {
              const writerPool = {
                async connect() {
                  return {
                    query: writer.query.bind(writer),
                    release() {
                      writerReleased = true
                      writer.release()
                    },
                  }
                },
              }
              writing = new PostgresArticleRepository('default', writerPool)
                .saveVariant(
                  article.id,
                  {
                    ...article.variants[0],
                    title: 'Concurrent edit',
                    status: 'draft',
                  },
                  article.revision,
                )
                .then(
                  () => ({ success: true }),
                  (error) => ({ error: error.message }),
                )
            }
            disposition = await writeDisposition(
              database.pool,
              writerPid,
              readerPid,
              writing,
            )
          })
          const result = await restoreArchive('default', request, restoring)
          const outcome = await writing
          const after = await state(database.pool)
          expect(after.operations).toHaveLength(1)
          expect(Number(after.sites[0].revision)).toBe(result.revision)
          if (operation === 'insert') {
            expect(outcome).toEqual({ success: true })
            expect(after.articles.map((row) => row.id)).toContain(
              'concurrent-article',
            )
          } else {
            expect(outcome).toEqual({ error: 'Article not found' })
            expect(after.articles).toHaveLength(1)
          }
          expect(disposition).toBe('blocked')
        } finally {
          try {
            await writing
          } finally {
            if (writer && !writerReleased) writer.release()
            await database.close()
          }
        }
      },
      30_000,
    )
  },
)
