import { describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { edit, scenario } from './local-first-sync-fixture.mjs'
import {
  makeCommit,
  makeHead,
} from '../../../packages/operator/src/core/remote-records.ts'
import {
  headKey,
  historyKey,
  jsonBytes,
  objectKey,
} from '../../../packages/operator/src/core/remote-wire.ts'

const namespace = 'a'.repeat(32)

describe('local-first source ancestry and recovery boundaries', () => {
  it('does not append a fresh blank workspace over an existing remote source', async () =>
    scenario(async ({ local, sync, store }) => {
      const original = local('original')
      edit(original, 'source', 'authoritative content')
      expect(
        (await sync(original).push({ operationId: 'original-sync' })).kind,
      ).toBe('synced')
      const fresh = local('fresh')
      const before = store.attempts.length
      expect((await sync(fresh).push({ operationId: 'fresh-sync' })).kind).toBe(
        'conflict',
      )
      expect(store.attempts.length).toBe(before)
      expect(fresh.operation('fresh-sync')).toBe(undefined)
      expect(original.status().syncedRevision).toBe(1)
    }))

  it('preserves stale local edits instead of adopting a newer remote source as their parent', async () =>
    scenario(async ({ local, sync, store, directory }) => {
      const original = local('authoritative')
      await sync(original).push({ operationId: 'baseline-sync' })
      await original.capture({
        destination: path.join(directory, 'stale.sqlite'),
      })
      const stale = local('stale', true)
      edit(original, 'next-source', 'new source on the writer')
      await sync(original).push({ operationId: 'new-source-sync' })
      edit(stale, 'stale-edit', 'preserve this unmerged branch')
      const before = store.attempts.length
      expect((await sync(stale).push({ operationId: 'stale-sync' })).kind).toBe(
        'conflict',
      )
      expect(store.attempts.length).toBe(before)
      expect(stale.read().guidance).toBe('preserve this unmerged branch')
      expect(stale.status().dirty).toBe(true)
    }))

  it('does not recreate a missing remote HEAD when a local confirmed checkpoint exists', async () =>
    scenario(async ({ local, sync, store }) => {
      const workspace = local('missing-head')
      await sync(workspace).push({ operationId: 'first-sync' })
      store.objects.delete(headKey(namespace))
      const before = store.attempts.length
      expect(
        await sync(workspace).push({ operationId: 'after-deletion' }),
      ).toEqual({
        kind: 'conflict',
        operationId: 'after-deletion',
        remoteCommitId: null,
      })
      expect(store.attempts.length).toBe(before)
    }))

  it('blocks a prepared stale send before any effect when an old valid HEAD and ETag are replayed', async () =>
    scenario(async ({ local, sync, store }) => {
      const workspace = local('replayed-parent')
      await sync(workspace).push({ operationId: 'confirmed-base' })
      const base = await store.read(headKey(namespace))
      store.neverStoreHead = true
      expect(
        (await sync(workspace).push({ operationId: 'prepared-a' })).kind,
      ).toBe('reconciling')
      store.neverStoreHead = false
      expect(
        (await sync(workspace).push({ operationId: 'confirmed-b' })).kind,
      ).toBe('synced')
      const confirmed = workspace.remoteCheckpoint(namespace)
      store.objects.set(headKey(namespace), base)
      const before = store.attempts.length
      const result = await sync(workspace)
        .push({ operationId: 'prepared-a' })
        .catch((error) => ({ kind: 'threw', code: error.code }))
      expect(store.attempts.length).toBe(before)
      expect(result).toMatchObject({
        kind: 'conflict',
        remoteCommitId: confirmed.commitId,
      })
      expect(workspace.remoteCheckpoint(namespace)).toEqual(confirmed)
      expect(workspace.operation('prepared-a').kind).toBe('prepared')
    }))

  it('reopens the actual encrypted backup image and reconciles without regenerating or uploading ciphertext', async () =>
    scenario(async ({ local, sync, store, codec, directory }) => {
      const original = local('snapshot-origin')
      edit(original, 'private-edit', 'secret source for restore')
      store.loseHeadResponse = true
      store.negativeHeads = 1
      await sync(original).push({ operationId: 'snapshot-sync' })
      const payload = JSON.parse(original.operation('snapshot-sync').payload)
      const encrypted = Buffer.from(payload.objects[0].body, 'base64')
      const image = await codec.open({
        purpose: 'snapshot',
        objectId: payload.commit.snapshotId,
        ciphertext: encrypted,
      })
      await writeFile(path.join(directory, 'restored.sqlite'), image, {
        mode: 0o600,
        flag: 'wx',
      })
      const restored = local('restored', true)
      expect(restored.operation('snapshot-sync').stage).toBe('intent')
      expect(restored.preparationMayResume()).toBe(false)
      const before = store.attempts.length
      store.negativeHeads = 1
      expect(
        (await sync(restored).push({ operationId: 'snapshot-sync' })).kind,
      ).toBe('reconciling')
      expect(store.attempts.length).toBe(before)
      expect(
        (await sync(restored).push({ operationId: 'snapshot-sync' })).kind,
      ).toBe('synced')
      expect(store.attempts.length).toBe(before)
      expect(restored.read().guidance).toBe('secret source for restore')
      expect(restored.remoteCheckpoint(namespace).commitId).toBe(
        payload.commit.commitId,
      )
    }))

  it('fails explicitly at the authenticated-history proof limit rather than promising a retry that cannot progress', async () =>
    scenario(async ({ local, sync, store, codec }) => {
      const workspace = local('long-history')
      store.loseHeadResponse = true
      store.negativeHeads = 1
      await sync(workspace).push({ operationId: 'pending-ancestor' })
      const plan = JSON.parse(workspace.operation('pending-ancestor').payload)
      let parent = plan.head
      for (let sequence = 2; sequence <= 257; sequence++) {
        const intent = {
          schema: 1,
          kind: 'remote-sync',
          siteId: 'example',
          namespace,
          operationId: `successor-${sequence}`,
          capturedRevision: 0,
          expectedEtag: null,
          parentHead: parent,
          commitId: codec.newId(),
          snapshotId: plan.commit.snapshotId,
          headId: codec.newId(),
        }
        const commit = makeCommit(intent, plan.commit.snapshotDigest)
        const head = makeHead(intent)
        const commitBody = await codec.protect({
          purpose: 'commit',
          objectId: commit.commitId,
          body: jsonBytes(commit),
        })
        const headBody = await codec.protect({
          purpose: 'head',
          objectId: 'head',
          body: jsonBytes(head),
        })
        await store.create(objectKey(namespace, commit.commitId), commitBody)
        await store.create(historyKey(namespace, head.headId), headBody)
        await store.replace(
          headKey(namespace),
          headBody,
          (await store.read(headKey(namespace))).etag,
        )
        parent = head
      }
      await expect(
        sync(workspace).push({ operationId: 'pending-ancestor' }),
      ).rejects.toMatchObject({ code: 'HISTORY_LIMIT' })
      expect(workspace.status().syncedRevision).toBe(null)
    }))
})
