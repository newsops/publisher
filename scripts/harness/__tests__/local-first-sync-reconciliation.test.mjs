import { describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { createRemoteSynchronizer } from '../../../packages/operator/src/core/remote-sync.ts'
import { edit, scenario } from './local-first-sync-fixture.mjs'

describe('local-first encrypted source reconciliation', () => {
  it('keeps exact retry bytes after a lost successful write, repeated 412 and delayed negative GETs', async () =>
    scenario(async ({ local, sync, store }) => {
      const workspace = local('writer')
      edit(workspace, 'edit-one', 'PRIVATE SOURCE ARTICLE')
      store.loseHeadResponse = true
      store.negativeHeads = 2
      expect(await sync(workspace).push({ operationId: 'sync-one' })).toEqual({
        kind: 'reconciling',
        operationId: 'sync-one',
      })
      const payload = workspace.operation('sync-one').payload
      expect(await sync(workspace).push({ operationId: 'sync-one' })).toEqual({
        kind: 'reconciling',
        operationId: 'sync-one',
      })
      const result = await sync(workspace).push({ operationId: 'sync-one' })
      expect(result.kind).toBe('synced')
      expect(workspace.operation('sync-one').kind).toBe('confirmed')
      const heads = store.attempts.filter(({ key }) => key.endsWith('/HEAD'))
      expect(heads.length).toBe(3)
      expect(new Set(heads.map(({ body }) => body)).size).toBe(1)
      for (const { body } of store.objects.values())
        expect(
          Buffer.from(body).includes(Buffer.from('PRIVATE SOURCE ARTICLE')),
        ).toBe(false)
      expect(
        [...store.objects.keys()].every(
          (key) => !key.includes('example') && !key.includes('ARTICLE'),
        ),
      ).toBe(true)
    }))

  it('reopens a real SQLite journal and does not mark later edits synchronized', async () =>
    scenario(async ({ local, sync, store }) => {
      let workspace = local('restart')
      edit(workspace, 'edit-before', 'before capture')
      store.loseHeadResponse = true
      store.negativeHeads = 1
      await sync(workspace).push({ operationId: 'sync-restart' })
      const prepared = workspace.operation('sync-restart').payload
      edit(workspace, 'edit-after', 'after capture')
      workspace.close()
      workspace = local('restart', true)
      expect(
        (await sync(workspace).push({ operationId: 'sync-restart' })).kind,
      ).toBe('synced')
      expect(workspace.operation('sync-restart').kind).toBe('confirmed')
      expect(typeof prepared).toBe('string')
      expect(workspace.status()).toMatchObject({
        currentRevision: 2,
        syncedRevision: 1,
        dirty: true,
      })
    }))

  it('does not mistake an orphan immutable history for activation of the source HEAD', async () =>
    scenario(async ({ local, sync, store }) => {
      const workspace = local('orphan')
      store.neverStoreHead = true
      expect(
        (await sync(workspace).push({ operationId: 'sync-orphan' })).kind,
      ).toBe('reconciling')
      expect(store.objects.size).toBe(3)
      expect(workspace.status().syncedRevision).toBe(null)
      expect(
        (await sync(workspace).push({ operationId: 'sync-orphan' })).kind,
      ).toBe('reconciling')
    }))

  it('permits at most one concurrent initial CAS and preserves the losing source', async () =>
    scenario(async ({ local, sync }) => {
      const first = local('first')
      const second = local('second')
      edit(first, 'first-edit', 'first branch')
      edit(second, 'second-edit', 'second branch')
      const results = await Promise.all([
        sync(first).push({ operationId: 'first-sync' }),
        sync(second).push({ operationId: 'second-sync' }),
      ])
      expect(results.map(({ kind }) => kind).sort()).toEqual([
        'conflict',
        'synced',
      ])
      const losing = results[0].kind === 'conflict' ? first : second
      expect(losing.status()).toMatchObject({
        currentRevision: 1,
        syncedRevision: null,
        dirty: true,
      })
      expect(losing.read().guidance).toContain('branch')
    }))

  it('recognizes a successful operation through an authenticated successor of a genuinely derived workspace', async () =>
    scenario(async ({ local, sync, store, directory }) => {
      const first = local('ancestor')
      store.loseHeadResponse = true
      store.negativeHeads = 1
      expect(
        (await sync(first).push({ operationId: 'ancestor-sync' })).kind,
      ).toBe('reconciling')
      await first.capture({
        destination: path.join(directory, 'successor.sqlite'),
      })
      const successor = local('successor', true)
      expect(
        (await sync(successor).push({ operationId: 'ancestor-sync' })).kind,
      ).toBe('synced')
      expect(
        (await sync(successor).push({ operationId: 'successor-sync' })).kind,
      ).toBe('synced')
      expect(
        (await sync(first).push({ operationId: 'ancestor-sync' })).kind,
      ).toBe('synced')
    }))

  it('refuses to invent new ciphertext when payload metadata exists but its original spool is unavailable', async () =>
    scenario(async ({ local, sync, store, directory }) => {
      const workspace = local('lost-spool')
      store.neverStoreHead = true
      await sync(workspace).push({ operationId: 'lost-operation' })
      const id = createHash('sha256').update('lost-operation').digest('hex')
      await rm(
        path.join(directory, 'lost-spool.sqlite.operations', `${id}.prepared`),
      )
      expect(workspace.operation('lost-operation').stage).toBe('unavailable')
      const attempted = store.attempts.length
      expect(
        (await sync(workspace).push({ operationId: 'lost-operation' })).kind,
      ).toBe('reconciling')
      expect(store.attempts.length).toBe(attempted)
    }))

  it('retries a pre-effect preparation crash at its pinned revision but rejects changed source', async () =>
    scenario(async ({ local, sync, store }) => {
      const first = local('prepare-resume')
      const originalCapture = first.capture.bind(first)
      first.capture = async () => {
        throw new Error('process stopped before capture')
      }
      await expect(
        sync(first).push({ operationId: 'resume-preparing' }),
      ).rejects.toThrow('process stopped')
      expect(first.operation('resume-preparing').stage).toBe('intent')
      expect(store.attempts.length).toBe(0)
      first.capture = originalCapture
      expect(
        (await sync(first).push({ operationId: 'resume-preparing' })).kind,
      ).toBe('synced')
    }))

  it('does not replace a pinned pre-effect source revision with newer edits', async () =>
    scenario(async ({ local, sync, store }) => {
      const second = local('prepare-conflict')
      second.capture = async () => {
        throw new Error('process stopped')
      }
      await expect(
        sync(second).push({ operationId: 'changed-preparing' }),
      ).rejects.toThrow()
      edit(second, 'later-source', 'newer source must not be substituted')
      const attempts = store.attempts.length
      expect(
        await sync(second).push({ operationId: 'changed-preparing' }),
      ).toEqual({
        kind: 'preparation-failed',
        operationId: 'changed-preparing',
        reason: 'source-changed',
      })
      expect(store.attempts.length).toBe(attempts)
    }))

  it('reconciles a missing durable spool from authenticated source history without resending invented bytes', async () =>
    scenario(async ({ local, sync, store, directory }) => {
      const workspace = local('spool-recovery')
      store.loseHeadResponse = true
      store.negativeHeads = 1
      await sync(workspace).push({ operationId: 'recover-spool' })
      const id = createHash('sha256').update('recover-spool').digest('hex')
      await rm(
        path.join(
          directory,
          'spool-recovery.sqlite.operations',
          `${id}.prepared`,
        ),
      )
      const attempts = store.attempts.length
      expect(
        (await sync(workspace).push({ operationId: 'recover-spool' })).kind,
      ).toBe('synced')
      expect(store.attempts.length).toBe(attempts)
    }))

  it('does not accept a confirmed operation as a receipt for another storage namespace', async () =>
    scenario(async ({ local, sync, store, codec, directory }) => {
      const workspace = local('scope')
      const result = await sync(workspace).push({ operationId: 'scoped-sync' })
      expect(result.kind).toBe('synced')
      const other = createRemoteSynchronizer({
        workspace,
        store,
        codec,
        namespace: 'b'.repeat(32),
        captureDestination: path.join(directory, 'other'),
      })
      await expect(other.push({ operationId: 'scoped-sync' })).rejects.toThrow(
        /scope/i,
      )
    }))
})
