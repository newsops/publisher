import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  FileContentRepository,
  shouldUseIsolatedFileRepository,
} from '../../../apps/admin/app/lib/repository.ts'
import {
  GET as rawGetSettings,
  PATCH as rawPatchSettings,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/settings/route.ts'
import {
  GET as rawListAuthors,
  POST as rawCreateAuthor,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/authors/route.ts'
import {
  PATCH as patchAuthor,
  DELETE as deleteAuthor,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/authors/[slug]/route.ts'

const token = 'news-platform-editor-token'
const digest = createHash('sha256').update(token).digest('hex')
let apiDirectory
const previous = new Map()
const siteContext = { params: Promise.resolve({ siteId: 'default' }) }
const getSettings = (request) => rawGetSettings(request, siteContext)
const patchSettings = (request) => rawPatchSettings(request, siteContext)
const listAuthors = (request) => rawListAuthors(request, siteContext)
const createAuthor = (request) => rawCreateAuthor(request, siteContext)

function request(url, method = 'GET', body, revision) {
  return new Request(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(revision === undefined ? {} : { 'if-match': String(revision) }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('configurable news platform contract', () => {
  beforeAll(async () => {
    apiDirectory = await mkdtemp(path.join(os.tmpdir(), 'news-platform-api-'))
    for (const key of ['ADMIN_DATA_DIR', 'ADMIN_AUTOMATION_KEYS', 'NODE_ENV'])
      previous.set(key, process.env[key])
    process.env.ADMIN_DATA_DIR = apiDirectory
    process.env.ADMIN_AUTOMATION_KEYS = JSON.stringify([
      {
        id: 'platform-editor',
        role: 'editor',
        sha256: digest,
        sites: ['default'],
      },
    ])
    process.env.NODE_ENV = 'test'
  })

  afterAll(async () => {
    await rm(apiDirectory, { recursive: true, force: true })
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('prefers an explicit isolated file repository outside production', () => {
    expect(
      shouldUseIsolatedFileRepository({
        NODE_ENV: 'test',
        ADMIN_DATA_DIR: '/tmp/isolated-admin-data',
      }),
    ).toBe(true)
    expect(
      shouldUseIsolatedFileRepository({
        NODE_ENV: 'production',
        ADMIN_DATA_DIR: '/tmp/isolated-admin-data',
      }),
    ).toBe(false)
  })

  it('seeds publication, authors, and compatible author references', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'news-platform-seed-'),
    )
    try {
      const repository = new FileContentRepository(directory)
      const [settings, authors, posts] = await Promise.all([
        repository.getSettings(),
        repository.listAuthors(),
        repository.list(),
      ])
      expect(settings).toMatchObject({
        name: 'Publisher',
        canonicalOrigin: 'https://www.publisher.com',
        language: 'en',
        locale: 'en-US',
      })
      expect(authors).toHaveLength(1)
      expect(authors[0]).toMatchObject({ slug: 'example-editor', active: true })
      expect(posts).toHaveLength(8)
      expect(posts.every((post) => post.authorSlug === 'example-editor')).toBe(
        true,
      )
      expect(posts.every((post) => post.seoTitle && post.seoDescription)).toBe(
        true,
      )
      expect(new Set(posts.map((post) => post.sourceUrl)).size).toBe(8)

      await repository.saveSettings({
        ...settings,
        canonicalOrigin: 'https://news.example.test',
      })
      const migrated = await repository.save(posts[0].id, {
        ...posts[0],
        title: `${posts[0].title} updated`,
      })
      expect(migrated.sourceUrl).toBe(
        `https://news.example.test${new URL(posts[0].sourceUrl).pathname}`,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('emits the complete schema-version 4 publication foundation', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'news-platform-snapshot-'),
    )
    try {
      const repository = new FileContentRepository(directory)
      const published = await repository.publish('foundation-snapshot')
      expect(published.snapshot.schemaVersion).toBe(4)
      expect(published.snapshot.settings.themeId).toBeTruthy()
      expect(published.snapshot.authors).toHaveLength(1)
      expect(published.snapshot.posts).toHaveLength(8)
      expect(published.snapshot.articles).toHaveLength(8)
      expect(published.snapshot.plugins).toMatchObject({ schemaVersion: 1 })
      expect(published.snapshot.media).toEqual([])
      expect(published.jobStatus).toBe('queued')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('manages revision-safe settings and stable-slug authors by machine API', async () => {
    const unauthorized = await getSettings(
      new Request('http://admin.test/api/v2/sites/default/settings'),
    )
    expect(unauthorized.status).toBe(401)
    expect(JSON.stringify(await unauthorized.json())).not.toContain(token)

    const settingsResponse = await getSettings(
      request('http://admin.test/api/v2/sites/default/settings'),
    )
    expect(settingsResponse.status).toBe(200)
    const current = (await settingsResponse.json()).settings

    const missingRevision = await patchSettings(
      request(
        'http://admin.test/api/v2/sites/default/settings',
        'PATCH',
        current,
      ),
    )
    expect(missingRevision.status).toBe(428)

    const settingsInput = {
      name: 'Platform Fixture',
      shortName: 'Fixture',
      description: 'A configurable fixture publication.',
      canonicalOrigin: 'https://news.example.test',
      language: 'en',
      locale: 'en-US',
      publisherName: 'Fixture Media',
    }
    const updatedResponse = await patchSettings(
      request(
        'http://admin.test/api/v2/sites/default/settings',
        'PATCH',
        settingsInput,
        current.revision,
      ),
    )
    expect(updatedResponse.status).toBe(200)
    expect((await updatedResponse.json()).settings).toMatchObject({
      name: 'Platform Fixture',
      revision: current.revision + 1,
    })

    const conflict = await patchSettings(
      request(
        'http://admin.test/api/v2/sites/default/settings',
        'PATCH',
        settingsInput,
        current.revision,
      ),
    )
    expect(conflict.status).toBe(409)

    const unknownField = await createAuthor(
      request('http://admin.test/api/v2/sites/default/authors', 'POST', {
        name: 'Invalid Author',
        bio: 'Invalid because the request contains an unknown field.',
        secret: token,
      }),
    )
    expect(unknownField.status).toBe(400)
    expect(JSON.stringify(await unknownField.json())).not.toContain(token)

    const createdResponse = await createAuthor(
      request('http://admin.test/api/v2/sites/default/authors', 'POST', {
        name: 'Jane Example',
        bio: 'Reporter covering platform engineering.',
      }),
    )
    expect(createdResponse.status).toBe(201)
    const author = (await createdResponse.json()).author
    expect(author.slug).toBe('jane-example')

    const immutableSlug = await patchAuthor(
      request(
        `http://admin.test/api/v2/sites/default/authors/${author.slug}`,
        'PATCH',
        { slug: 'renamed-author' },
        author.revision,
      ),
      { params: Promise.resolve({ siteId: 'default', slug: author.slug }) },
    )
    expect(immutableSlug.status).toBe(400)

    const repository = new FileContentRepository(apiDirectory)
    const [assignedPost] = await repository.list()
    const assigned = await repository.save(assignedPost.id, {
      ...assignedPost,
      author: author.name,
      authorSlug: author.slug,
    })
    const assignedArchive = await deleteAuthor(
      request(
        `http://admin.test/api/v2/sites/default/authors/${author.slug}`,
        'DELETE',
        undefined,
        author.revision,
      ),
      { params: Promise.resolve({ siteId: 'default', slug: author.slug }) },
    )
    expect(assignedArchive.status).toBe(400)
    expect((await assignedArchive.json()).error.code).toBe('validation_failed')
    await repository.save(assignedPost.id, {
      ...assigned,
      author: 'Example Editor',
      authorSlug: 'example-editor',
    })

    const archivedResponse = await deleteAuthor(
      request(
        `http://admin.test/api/v2/sites/default/authors/${author.slug}`,
        'DELETE',
        undefined,
        author.revision,
      ),
      { params: Promise.resolve({ siteId: 'default', slug: author.slug }) },
    )
    expect(archivedResponse.status).toBe(200)
    expect((await archivedResponse.json()).author.active).toBe(false)

    const authorsResponse = await listAuthors(
      request('http://admin.test/api/v2/sites/default/authors'),
    )
    expect(authorsResponse.status).toBe(200)
    expect((await authorsResponse.json()).authors).toHaveLength(2)
  })
})
