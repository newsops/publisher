import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  GET as rawListTags,
  POST as rawCreateTag,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/tags/route.ts'
import {
  PATCH as renameTag,
  DELETE as archiveTag,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/tags/[slug]/route.ts'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'
import { POST as rawCreatePost } from '../../../apps/admin/app/api/v2/sites/[siteId]/posts/route.ts'

const siteContext = { params: Promise.resolve({ siteId: 'default' }) }
const listTags = (request) => rawListTags(request, siteContext)
const createTag = (request) => rawCreateTag(request, siteContext)
const createPost = (request) => rawCreatePost(request, siteContext)

const token = 'taxonomy-editor-secret'
const keys = JSON.stringify([
  {
    id: 'taxonomy-editor',
    role: 'editor',
    sha256: createHash('sha256').update(token).digest('hex'),
    sites: ['default'],
  },
])
let dataDirectory

function auth(extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra }
}

describe('admin taxonomy contract', () => {
  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'publisher-taxonomy-'))
    process.env.NODE_ENV = 'test'
    process.env.ADMIN_AUTOMATION_KEYS = keys
    process.env.ADMIN_DATA_DIR = dataDirectory
  })

  afterAll(async () => {
    await rm(dataDirectory, { recursive: true, force: true })
    delete process.env.ADMIN_AUTOMATION_KEYS
    delete process.env.ADMIN_DATA_DIR
  })

  it('seeds terms and preserves post assignments in a publish snapshot', async () => {
    const repository = new FileContentRepository(dataDirectory)
    const posts = await repository.list()
    const tags = await repository.listTags()
    expect(tags.map((tag) => tag.slug)).toEqual(['General'])
    expect(posts.some((post) => post.categories.includes('General'))).toBe(true)
    const result = await repository.publish()
    expect(result.snapshot.tags).toHaveLength(1)
    expect(result.snapshot.posts).toHaveLength(8)
  })

  it('supports authenticated create, rename, archive, and revision conflicts', async () => {
    const createdResponse = await createTag(
      new Request('http://admin.test/api/v2/sites/default/tags', {
        method: 'POST',
        headers: { ...auth(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Spatial Audio' }),
      }),
    )
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()).tag
    expect(created.slug).toBe('spatial-audio')

    const conflict = await renameTag(
      new Request('http://admin.test/api/v2/sites/default/tags/spatial-audio', {
        method: 'PATCH',
        headers: {
          ...auth(),
          'if-match': '99',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Audio' }),
      }),
      { params: Promise.resolve({ siteId: 'default', slug: 'spatial-audio' }) },
    )
    expect(conflict.status).toBe(409)

    const renamedResponse = await renameTag(
      new Request('http://admin.test/api/v2/sites/default/tags/spatial-audio', {
        method: 'PATCH',
        headers: {
          ...auth(),
          'if-match': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Spatial Audio' }),
      }),
      { params: Promise.resolve({ siteId: 'default', slug: 'spatial-audio' }) },
    )
    expect(renamedResponse.status).toBe(200)
    const renamed = (await renamedResponse.json()).tag
    expect(renamed.revision).toBe(2)

    const archivedResponse = await archiveTag(
      new Request('http://admin.test/api/v2/sites/default/tags/spatial-audio', {
        method: 'DELETE',
        headers: { ...auth(), 'if-match': '2' },
      }),
      { params: Promise.resolve({ siteId: 'default', slug: 'spatial-audio' }) },
    )
    expect(archivedResponse.status).toBe(200)
    expect((await archivedResponse.json()).tag.active).toBe(false)

    const tagsResponse = await listTags(
      new Request('http://admin.test/api/v2/sites/default/tags', {
        headers: auth(),
      }),
    )
    expect(tagsResponse.status).toBe(200)
    expect(
      (await tagsResponse.json()).tags.find(
        (tag) => tag.slug === 'spatial-audio',
      ).active,
    ).toBe(false)
  })

  it('returns the selected private author context only to the automation caller', async () => {
    const repository = new FileContentRepository(dataDirectory)
    const author = await repository.getAuthor('example-editor')
    await repository.saveAuthor('example-editor', {
      name: author.name,
      bio: author.bio,
      avatarUrl: author.avatarUrl,
      active: true,
      editorialPersona: 'Use a factual reporting voice.',
    })
    const response = await createPost(
      new Request('http://admin.test/api/v2/sites/default/posts', {
        method: 'POST',
        headers: { ...auth(), 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'author-context',
          sourceUrl: 'https://www.publisher.com/author-context',
          slug: 'author-context',
          title: 'Author context',
          excerpt: 'A test post.',
          bodyHtml: '<p>A test post.</p>',
          author: author.name,
          authorSlug: author.slug,
          seoTitle: 'Author context',
          seoDescription: 'A test post.',
          status: 'draft',
          publishedAt: '2026-09-15T00:00:00.000Z',
          categories: ['General'],
          tags: ['General'],
        }),
      }),
    )
    expect(response.status).toBe(201)
    expect((await response.json()).authorContext).toEqual({
      authorSlug: 'example-editor',
      displayName: author.name,
      editorialPersona: 'Use a factual reporting voice.',
    })
  })
})
