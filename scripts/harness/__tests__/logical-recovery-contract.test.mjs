import { describe, expect, it } from 'vitest'
import {
  createRecoveryDatabase,
  seedRecoverySites,
  createServerRecoveryDatabase,
} from './helpers/recovery-fixture.mjs'
import {
  createLogicalBackup,
  restoreLogicalBackup,
  verifyLogicalBackup,
} from '../../../packages/persistence/src/index.ts'
import {
  checksum,
  dataChecksum,
} from '../../../packages/persistence/src/recovery-format.ts'
import { PostgresContentRepository } from '../../../apps/admin/app/lib/adapters/postgres-content-repository.ts'
import { PostgresArticleRepository } from '../../../apps/admin/app/lib/adapters/postgres-article-repository.ts'
import { PostgresAdapterRepository } from '../../../apps/admin/app/lib/adapters/postgres-adapter-repository.ts'
import { AccountStore } from '../../../apps/admin/app/lib/adapters/account-store.ts'
import {
  AdminAuthError,
  verifyPassword,
} from '../../../apps/admin/app/lib/http/auth.ts'
import { authorizedSiteId } from '../../../apps/admin/app/lib/http/request-repository.ts'
import { deskApprovalValid } from '../../../packages/content/src/index.ts'
import { PostgresCommentStore } from '../../../apps/comments/src/postgres-db.ts'

async function editorialDomain(pool, siteId) {
  const content = new PostgresContentRepository(siteId, pool)
  return {
    posts: await content.list(),
    settings: await content.getSettings(),
    authors: await content.listAuthors(),
    categories: await content.listCategories(),
    tags: await content.listTags(),
    articles: await new PostgresArticleRepository(siteId, pool).list(),
    adapters: await new PostgresAdapterRepository(siteId, pool).list(),
  }
}

function reseal(value, includeData = true) {
  if (includeData)
    value.dataSha256 = dataChecksum(value.tables, value.rowCounts)
  const { sha256, ...payload } = value
  value.sha256 = checksum(payload)
  return value
}

async function expectEmpty(pool) {
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='publisher_admin' AND tablename <> 'publisher_migrations'`,
  )
  for (const table of tables.rows) {
    const count = await pool.query(
      `SELECT COUNT(*)::integer AS count FROM publisher_admin.${table.tablename}`,
    )
    expect(count.rows[0].count).toBe(0)
  }
}

describe('INFRA-007 complete current-schema recovery', () => {
  it('preserves two sites, private account authority and guidance but invalidates sessions', async () => {
    const source = await createRecoveryDatabase('admin')
    const target = await createRecoveryDatabase('admin')
    try {
      const { verifier } = await seedRecoverySites(source.pool)
      const backup = await createLogicalBackup(source.pool, 'admin')
      expect(backup.schemaVersion).toBe(2)
      expect(backup.rowCounts['publisher_admin.sites']).toBe(2)
      expect(backup.rowCounts['publisher_admin.accounts']).toBe(3)
      expect(backup.rowCounts['publisher_admin.site_administrators']).toBe(4)
      expect(backup.rowCounts['publisher_admin.site_agent_guidance']).toBe(2)
      expect(backup.rowCounts['publisher_admin.account_sessions']).toBe(0)
      expect(backup.securityPolicy.accountVerifiers).toBe(
        'preserved-reusable-authentication',
      )
      expect(
        backup.schema.tables.find(
          (table) => table.name === 'publisher_admin.account_sessions',
        ).policy,
      ).toBe('invalidate-sessions')
      expect(JSON.stringify(backup)).not.toContain('a'.repeat(64))
      expect(backup.schema.migrations).toHaveLength(6)
      expect(backup.tables['publisher_admin.articles']).toHaveLength(2)
      expect(
        backup.tables['publisher_admin.audit_events'][0].details,
      ).toContain('9007199254740993')
      verifyLogicalBackup(backup)
      await target.pool.query('DELETE FROM publisher_admin.sites')
      await restoreLogicalBackup(target.pool, backup)
      const restored = await createLogicalBackup(target.pool, 'admin')
      expect(restored.dataSha256).toBe(backup.dataSha256)
      expect(restored.tables).toEqual(backup.tables)
      expect(restored.tables['publisher_admin.accounts'][0].password_hash).toBe(
        verifier,
      )
      const account = await new AccountStore(target.pool).findCredentialByEmail(
        'editor@example.com',
      )
      expect(
        await verifyPassword('Fixture-password-123!', account.passwordHash),
      ).toBe(true)
      expect(
        await new AccountStore(target.pool).findSessionAccount('a'.repeat(64)),
      ).toBeUndefined()
      for (const siteId of ['default', 'example']) {
        const scopedAccount = await new AccountStore(
          target.pool,
        ).findCredentialByEmail(`${siteId}-editor@example.com`)
        expect(scopedAccount.role).toBe('editor')
        const memberships = await target.pool.query(
          'SELECT site_id FROM publisher_admin.site_administrators WHERE account_id=$1 ORDER BY site_id',
          [scopedAccount.id],
        )
        expect(memberships.rows).toEqual([{ site_id: siteId }])
        const identity = {
          email: scopedAccount.email,
          subject: `account:${scopedAccount.id}`,
          roles: [scopedAccount.role],
        }
        for (const requestedSite of ['default', 'example']) {
          const request = new Request('https://admin.example.com/api/posts', {
            headers: { 'x-admin-site-id': requestedSite },
          })
          expect(() => authorizedSiteId(request, identity)).toThrow(
            AdminAuthError,
          )
          try {
            authorizedSiteId(request, identity)
            throw new Error(
              'The current owner-only browser boundary must reject nonowners',
            )
          } catch (error) {
            expect(error.status).toBe(403)
          }
        }
      }
      for (const siteId of ['default', 'example']) {
        const before = await editorialDomain(source.pool, siteId)
        const after = await editorialDomain(target.pool, siteId)
        expect(after).toEqual(before)
        const published = after.posts.find(
          (post) => post.status === 'published',
        )
        expect(deskApprovalValid(published)).toBe(true)
        expect(
          after.posts.find((post) => post.status === 'review').deskReview
            ?.status,
        ).not.toBe('approved')
        expect(after.authors[0].editorialPersona).toBe(
          'Private reporting persona',
        )
        expect(after.categories[0].slug).toBe(after.tags[0].slug)
        expect(after.categories[0].name).not.toBe(after.tags[0].name)
        expect(
          after.articles[0].variants.map((variant) => variant.locale),
        ).toEqual(['en', 'ko'])
        expect(
          after.articles[0].variants.find((variant) => variant.locale === 'ko')
            .status,
        ).toBe('review')
        const replay = await new PostgresContentRepository(
          siteId,
          target.pool,
        ).publish('publish-one')
        const original = await new PostgresContentRepository(
          siteId,
          source.pool,
        ).publish('publish-one')
        expect(replay.jobId).toBe(original.jobId)
        expect(replay.snapshot).toEqual(original.snapshot)
        expect(replay.checksum).toBe(original.checksum)
      }
      const next = await target.pool.query(
        `INSERT INTO publisher_admin.audit_events(site_id, actor, event) VALUES ('example', 'Editor', 'next') RETURNING id`,
      )
      expect(Number(next.rows[0].id)).toBe(8)
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)

  it('round-trips site-scoped comments, moderation and durable rate limits without bigint precision loss', async () => {
    const source = await createRecoveryDatabase('comments')
    const target = await createRecoveryDatabase('comments')
    try {
      await source.pool
        .query(`INSERT INTO publisher_comments.comments(id,site_id,slug,author_name,body,status,created_at,updated_at) VALUES
        ('00000000-0000-4000-8000-000000000001','default','story','Reader','Approved comment','approved','2026-01-01T00:00:00.123456Z','2026-01-02T00:00:00.654321Z'),
        ('00000000-0000-4000-8000-000000000002','example','story','Reader','Pending comment','pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
        ('00000000-0000-4000-8000-000000000003','example','story','Reader','Rejected comment','rejected',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
        INSERT INTO publisher_comments.rate_limits(bucket_key,count,reset_at) VALUES ('site:example:reader',2,9007199254740993)`)
      const backup = await createLogicalBackup(source.pool, 'comments')
      expect(backup.tables['publisher_comments.rate_limits'][0].reset_at).toBe(
        '9007199254740993',
      )
      await restoreLogicalBackup(target.pool, backup)
      const restored = await createLogicalBackup(target.pool, 'comments')
      expect(restored.tables).toEqual(backup.tables)
      expect(restored.dataSha256).toBe(backup.dataSha256)
      const comments = new PostgresCommentStore(target.url, target.pool)
      expect(
        (await comments.listForModeration('example', 'pending')).map(
          (comment) => comment.body,
        ),
      ).toEqual(['Pending comment'])
      expect(
        (await comments.listForModeration('example', 'rejected')).map(
          (comment) => comment.body,
        ),
      ).toEqual(['Rejected comment'])
      expect(await comments.listApproved('example', 'story')).toEqual([])
      expect(
        (await comments.listApproved('default', 'story')).map(
          (comment) => comment.body,
        ),
      ).toEqual(['Approved comment'])
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)

  it.each([
    ['unknown table', 'CREATE TABLE publisher_admin.unknown_table ()'],
    ['missing table', 'DROP TABLE publisher_admin.archive_restore_operations'],
    [
      'extra column',
      'ALTER TABLE publisher_admin.sites ADD COLUMN unexpected TEXT',
    ],
    ['missing column', 'ALTER TABLE publisher_admin.sites DROP COLUMN name'],
    [
      'wrong type',
      'ALTER TABLE publisher_admin.site_agent_guidance ALTER COLUMN revision TYPE BIGINT',
    ],
    [
      'missing migration',
      `DELETE FROM publisher_admin.publisher_migrations WHERE version='0005_site_agent_guidance.sql'`,
    ],
    [
      'tampered migration',
      `UPDATE publisher_admin.publisher_migrations SET sha256=repeat('0',64) WHERE version='0005_site_agent_guidance.sql'`,
    ],
    [
      'extra migration',
      `INSERT INTO publisher_admin.publisher_migrations(version,sha256) VALUES ('9999_unknown.sql',repeat('0',64))`,
    ],
  ])(
    'fails closed for %s and releases capture connections',
    async (_, sql) => {
      const database = await createRecoveryDatabase('admin')
      try {
        await database.pool.query(sql)
        await expect(
          createLogicalBackup(database.pool, 'admin'),
        ).rejects.toThrow(/Unsupported recovery/)
        expect(database.pool.waitingCount).toBe(0)
        expect(database.pool.idleCount).toBe(database.pool.totalCount)
        expect(
          (await database.pool.query('SELECT 1 AS alive')).rows[0].alive,
        ).toBe(1)
      } finally {
        await database.close()
      }
    },
    30_000,
  )

  it('rejects malformed or tampered input before touching an empty restore target', async () => {
    const source = await createRecoveryDatabase('admin')
    const target = await createRecoveryDatabase('admin')
    try {
      await seedRecoverySites(source.pool)
      const backup = await createLogicalBackup(source.pool, 'admin')
      await target.pool.query('DELETE FROM publisher_admin.sites')
      const mutations = [
        (value) => {
          value.schemaVersion = 1
        },
        (value) => {
          value.scope = 'unknown'
        },
        (value) => {
          value.sha256 = '0'.repeat(64)
        },
        (value) => {
          value.schema.migrations[0].sha256 = '0'.repeat(64)
          reseal(value)
        },
        (value) => {
          value.schema.tables[0].policy = 'discard'
          reseal(value)
        },
        (value) => {
          delete value.securityPolicy.sessions
          reseal(value)
        },
        (value) => {
          value.securityPolicy.extra = 'unknown'
          reseal(value)
        },
        (value) => {
          delete value.tables['publisher_admin.site_agent_guidance']
          reseal(value)
        },
        (value) => {
          value.tables.extra = []
          reseal(value)
        },
        (value) => {
          value.rowCounts['publisher_admin.sites'] = 90
          reseal(value)
        },
        (value) => {
          value.tables['publisher_admin.sites'][0].extra = 'hidden'
          reseal(value)
        },
        (value) => {
          value.tables['publisher_admin.sites'][0].active = 'yes'
          reseal(value)
        },
        (value) => {
          value.tables['publisher_admin.account_sessions'].push({
            id: 'session',
          })
          value.rowCounts['publisher_admin.account_sessions'] = 1
          reseal(value)
        },
        (value) => {
          value.dataSha256 = '0'.repeat(64)
          reseal(value, false)
        },
      ]
      for (const mutate of mutations) {
        const input = structuredClone(backup)
        mutate(input)
        expect(() => verifyLogicalBackup(input)).toThrow()
        await expect(restoreLogicalBackup(target.pool, input)).rejects.toThrow()
        await expectEmpty(target.pool)
      }
      for (const input of [null, [], 'backup', { schemaVersion: 2 }])
        expect(() => verifyLogicalBackup(input)).toThrow()
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)

  it('rejects migration seed/nonempty and drifted targets without mutation', async () => {
    const source = await createRecoveryDatabase('admin')
    const target = await createRecoveryDatabase('admin')
    try {
      await seedRecoverySites(source.pool)
      const backup = await createLogicalBackup(source.pool, 'admin')
      await expect(restoreLogicalBackup(target.pool, backup)).rejects.toThrow(
        'Restore target is not empty',
      )
      expect(
        (await target.pool.query('SELECT name FROM publisher_admin.sites'))
          .rows,
      ).toEqual([{ name: 'Publication' }])
      await target.pool.query(
        'DELETE FROM publisher_admin.sites; ALTER TABLE publisher_admin.sites ADD COLUMN unexpected TEXT',
      )
      await expect(restoreLogicalBackup(target.pool, backup)).rejects.toThrow(
        'Unsupported recovery schema',
      )
      await expectEmpty(target.pool)
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)

  it.each(['insert', 'verification'])(
    'rolls back every inserted row on %s failure and releases its connection',
    async (fault) => {
      const source = await createRecoveryDatabase('admin')
      const target = await createRecoveryDatabase('admin')
      try {
        await seedRecoverySites(source.pool)
        const backup = await createLogicalBackup(source.pool, 'admin')
        await target.pool.query('DELETE FROM publisher_admin.sites')
        const action =
          fault === 'insert'
            ? `RAISE EXCEPTION 'Injected insert failure';`
            : `NEW.instructions := 'Changed by target trigger';`
        await target.pool
          .query(`CREATE FUNCTION publisher_admin.recovery_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${action} RETURN NEW; END $$;
        CREATE TRIGGER recovery_fault BEFORE INSERT ON publisher_admin.site_agent_guidance FOR EACH ROW EXECUTE FUNCTION publisher_admin.recovery_fault()`)
        await expect(restoreLogicalBackup(target.pool, backup)).rejects.toThrow(
          fault === 'insert'
            ? 'Injected insert failure'
            : 'Restored data checksum mismatch',
        )
        await expectEmpty(target.pool)
        expect(target.pool.idleCount).toBe(target.pool.totalCount)
        await target.pool.query(
          'DROP TRIGGER recovery_fault ON publisher_admin.site_agent_guidance; DROP FUNCTION publisher_admin.recovery_fault()',
        )
        await restoreLogicalBackup(target.pool, backup)
        expect(
          (await createLogicalBackup(target.pool, 'admin')).dataSha256,
        ).toBe(backup.dataSha256)
      } finally {
        await source.close()
        await target.close()
      }
    },
    30_000,
  )

  it('rolls back durable rows when identity restart fails after checksum verification', async () => {
    const source = await createRecoveryDatabase('admin')
    const target = await createRecoveryDatabase('admin')
    try {
      await seedRecoverySites(source.pool)
      await source.pool.query(
        `DELETE FROM publisher_admin.audit_events;
         INSERT INTO publisher_admin.audit_events(id,site_id,actor,event)
         OVERRIDING SYSTEM VALUE VALUES (9223372036854775807,'example','Editor','limit')`,
      )
      const backup = await createLogicalBackup(source.pool, 'admin')
      await target.pool.query('DELETE FROM publisher_admin.sites')
      await expect(restoreLogicalBackup(target.pool, backup)).rejects.toThrow()
      await expectEmpty(target.pool)
      expect(target.pool.idleCount).toBe(target.pool.totalCount)
      const next = await target.pool.query(
        `INSERT INTO publisher_admin.audit_events(site_id,actor,event) VALUES ('example','Editor','after-failure') RETURNING id`,
      )
      expect(Number(next.rows[0].id)).toBe(1)
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)

  it('rejects a target trigger that resurrects a session during account restore', async () => {
    const source = await createRecoveryDatabase('admin')
    const target = await createRecoveryDatabase('admin')
    try {
      await seedRecoverySites(source.pool)
      const backup = await createLogicalBackup(source.pool, 'admin')
      await target.pool.query(`DELETE FROM publisher_admin.sites;
        CREATE FUNCTION publisher_admin.resurrect_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          INSERT INTO publisher_admin.account_sessions(id,account_id,token_hash,expires_at)
          VALUES (NEW.id,NEW.id,md5(NEW.id::text)||md5(NEW.id::text),CURRENT_TIMESTAMP+INTERVAL '1 day');
          RETURN NEW; END $$;
        CREATE TRIGGER resurrect_session AFTER INSERT ON publisher_admin.accounts FOR EACH ROW EXECUTE FUNCTION publisher_admin.resurrect_session()`)
      await expect(restoreLogicalBackup(target.pool, backup)).rejects.toThrow(
        'Restored sessions must remain invalidated',
      )
      await expectEmpty(target.pool)
    } finally {
      await source.close()
      await target.close()
    }
  }, 30_000)
})

describe.runIf(process.env.PUBLISHER_RECOVERY_TEST_DATABASE_URL)(
  'INFRA-007 independent PostgreSQL connections',
  () => {
    it('captures related records from one repeatable-read snapshot across a committed concurrent writer', async () => {
      const database = await createServerRecoveryDatabase(
        process.env.PUBLISHER_RECOVERY_TEST_DATABASE_URL,
      )
      let writer
      let client
      let readerPid
      let writerPid
      let observedIsolation
      let observedReadOnly
      let writes = 0
      const commands = []
      try {
        await seedRecoverySites(database.pool)
        writer = await database.pool.connect()
        writerPid = (await writer.query('SELECT pg_backend_pid() AS pid'))
          .rows[0].pid
        const capturePool = {
          async connect() {
            client = await database.pool.connect()
            readerPid = (await client.query('SELECT pg_backend_pid() AS pid'))
              .rows[0].pid
            return {
              async query(sql, values) {
                commands.push(sql)
                const result = await client.query(sql, values)
                if (sql.startsWith('BEGIN')) {
                  observedIsolation = (
                    await client.query('SHOW transaction_isolation')
                  ).rows[0].transaction_isolation
                  observedReadOnly = (
                    await client.query('SHOW transaction_read_only')
                  ).rows[0].transaction_read_only
                }
                if (
                  sql.includes('row_to_json') &&
                  sql.includes('FROM publisher_admin.sites ') &&
                  writes === 0
                ) {
                  await writer.query(`BEGIN;
              UPDATE publisher_admin.sites SET name='Changed concurrently' WHERE site_id='example';
              UPDATE publisher_admin.site_states SET revision=6 WHERE site_id='example';
              COMMIT`)
                  writes++
                }
                return result
              },
              release() {
                client.release()
              },
            }
          },
        }
        const backup = await createLogicalBackup(capturePool, 'admin')
        expect(readerPid).not.toBe(writerPid)
        expect(writes).toBe(1)
        expect(observedIsolation).toBe('repeatable read')
        expect(observedReadOnly).toBe('on')
        expect(
          backup.tables['publisher_admin.sites'].find(
            (row) => row.site_id === 'example',
          ).name,
        ).toBe('Example News')
        expect(
          backup.tables['publisher_admin.site_states'].find(
            (row) => row.site_id === 'example',
          ).revision,
        ).toBe('5')
        expect(
          (
            await writer.query(
              `SELECT revision::text FROM publisher_admin.site_states WHERE site_id='example'`,
            )
          ).rows[0].revision,
        ).toBe('6')
        expect(commands.at(-1)).toBe('COMMIT')
        writer.release()
        writer = undefined
        expect(database.pool.idleCount).toBe(database.pool.totalCount)
      } finally {
        writer?.release()
        await database.close()
      }
    }, 30_000)
  },
)
