import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'
import { deliverSnapshot } from '../../../apps/admin/app/lib/adapters/publisher.ts'

async function withEnvironment(values, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const snapshotFixture = {
  schemaVersion: 4,
  snapshotId: 'snapshot-fixture',
  generatedAt: '2026-08-20T00:00:00.000Z',
  settings: {
    name: 'Fixture',
    shortName: 'Fixture',
    description: 'Fixture publication',
    canonicalOrigin: 'https://fixture.example',
    language: 'en',
    locale: 'en-US',
    publisherName: 'Fixture',
  },
  authors: [],
  tags: [],
  posts: [],
  articles: [],
  plugins: { schemaVersion: 1, installations: [] },
  media: [],
}

describe('publish workflow contract', () => {
  it('creates an immutable local snapshot record from validated content', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-admin-'))
    try {
      const repository = new FileContentRepository(directory)
      const posts = await repository.list()
      const result = await withEnvironment(
        {
          NODE_ENV: 'test',
          OBJECT_STORAGE_ENDPOINT: undefined,
          OBJECT_STORAGE_REGION: undefined,
          OBJECT_STORAGE_ACCESS_KEY_ID: undefined,
          OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined,
          OBJECT_STORAGE_BUCKET: undefined,
        },
        () => repository.publish(),
      )

      expect(posts).toHaveLength(8)
      expect(result.snapshot.schemaVersion).toBe(4)
      expect(result.snapshot.settings.name).toBe('Publisher')
      expect(result.snapshot.authors).toHaveLength(1)
      expect(result.snapshot.posts).toHaveLength(8)
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/)
      expect(result.delivery.mode).toBe('local')
      expect(result.delivery.release.status).toBe('Snapshot created')
      expect(result.delivery.release.snapshotId).toBe(
        result.snapshot.snapshotId,
      )
      expect(result.delivery.release.checksum).toBe(result.checksum)

      const state = JSON.parse(
        await readFile(path.join(directory, 'content.json'), 'utf8'),
      )
      expect(state.snapshots).toHaveLength(1)
      expect(state.snapshots[0].snapshotId).toBe(result.snapshot.snapshotId)
      expect(state.snapshots[0].checksum).toBe(result.checksum)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('fails closed when production object storage is not configured', async () => {
    const originalFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), init })
      return new Response(null, { status: 204 })
    }
    try {
      await expect(
        withEnvironment(
          {
            NODE_ENV: 'production',
            OBJECT_STORAGE_ENDPOINT: undefined,
            OBJECT_STORAGE_REGION: undefined,
            OBJECT_STORAGE_ACCESS_KEY_ID: undefined,
            OBJECT_STORAGE_SECRET_ACCESS_KEY: undefined,
            OBJECT_STORAGE_BUCKET: undefined,
          },
          () => deliverSnapshot(snapshotFixture),
        ),
      ).rejects.toThrow('requires object storage')
      expect(calls).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
