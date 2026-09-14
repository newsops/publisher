import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  GET as rawListPosts,
  POST as rawCreatePost,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/posts/route.ts'
import {
  GET as getPost,
  PATCH as updatePost,
  DELETE as deletePost,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/posts/[id]/route.ts'
import { POST as rawPublishPosts } from '../../../apps/admin/app/api/v2/sites/[siteId]/publish/route.ts'

const siteContext = { params: Promise.resolve({ siteId: 'default' }) }
const listPosts = (request) => rawListPosts(request, siteContext)
const createPost = (request) => rawCreatePost(request, siteContext)
const publishPosts = (request) => rawPublishPosts(request, siteContext)

const editorToken = 'editor-automation-secret'
const publisherToken = 'publisher-automation-secret'
const rateToken = 'rate-automation-secret'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const keys = JSON.stringify([
  {
    id: 'editor-test',
    role: 'editor',
    sha256: digest(editorToken),
    sites: ['default'],
  },
  {
    id: 'publisher-test',
    role: 'publisher',
    sha256: digest(publisherToken),
    sites: ['default'],
  },
  {
    id: 'rate-test',
    role: 'editor',
    sha256: digest(rateToken),
    sites: ['default'],
  },
])

let dataDirectory
const previousEnvironment = new Map()

function setEnvironment(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!previousEnvironment.has(key))
      previousEnvironment.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function auth(token) {
  return { authorization: `Bearer ${token}` }
}

function jsonRequest(url, token, method, body, extra = {}) {
  return new Request(url, {
    method,
    headers: {
      ...auth(token),
      'content-type': 'application/json',
      ...extra,
    },
    body: JSON.stringify(body),
  })
}

async function json(response) {
  return response.json()
}

describe('admin automation API contract', () => {
  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'publisher-api-'))
    setEnvironment({
      NODE_ENV: 'test',
      ADMIN_AUTOMATION_KEYS: keys,
      ADMIN_DATA_DIR: dataDirectory,
      PUBLISH_WEBHOOK_URL: undefined,
      PUBLISH_WEBHOOK_SECRET: undefined,
      R2_ENDPOINT: undefined,
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
      R2_BUCKET: undefined,
    })
  })

  afterAll(async () => {
    await rm(dataDirectory, { recursive: true, force: true })
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('rejects missing, malformed, and unknown bearer keys without revealing details', async () => {
    const missing = await listPosts(
      new Request('http://admin.test/api/v2/sites/default/posts'),
    )
    const malformed = await listPosts(
      new Request('http://admin.test/api/v2/sites/default/posts', {
        headers: { authorization: 'Basic secret' },
      }),
    )
    const unknown = await listPosts(
      new Request('http://admin.test/api/v2/sites/default/posts', {
        headers: auth('unknown'),
      }),
    )
    for (const response of [missing, malformed, unknown]) {
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
      const body = await json(response)
      expect(body.error.code).toBe('unauthorized')
      expect(body.error.message).toBe('Authentication required')
      expect(JSON.stringify(body)).not.toContain('unknown')
    }
  })

  it('lists and reads seeded posts with bounded pagination', async () => {
    const response = await listPosts(
      new Request(
        'http://admin.test/api/v2/sites/default/posts?limit=2&offset=1',
        {
          headers: auth(editorToken),
        },
      ),
    )
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.posts).toHaveLength(2)
    expect(body.page).toMatchObject({
      limit: 2,
      offset: 1,
      total: 8,
      hasMore: true,
    })

    const postResponse = await getPost(
      new Request(
        `http://admin.test/api/v2/sites/default/posts/${body.posts[0].id}`,
        {
          headers: auth(editorToken),
        },
      ),
      { params: Promise.resolve({ siteId: 'default', id: body.posts[0].id }) },
    )
    expect(postResponse.status).toBe(200)
    expect((await json(postResponse)).post.id).toBe(body.posts[0].id)
  })

  it('creates and updates validated content with revision protection', async () => {
    const invalidResponse = await createPost(
      jsonRequest(
        'http://admin.test/api/v2/sites/default/posts',
        editorToken,
        'POST',
        {
          slug: 'invalid-content',
          title: '',
        },
      ),
    )
    expect(invalidResponse.status).toBe(400)
    expect((await json(invalidResponse)).error.code).toBe('validation_failed')

    const auditLines = []
    const originalInfo = console.info
    console.info = (...args) => auditLines.push(args.join(' '))
    let createdResponse
    try {
      createdResponse = await createPost(
        jsonRequest(
          'http://admin.test/api/v2/sites/default/posts',
          editorToken,
          'POST',
          {
            slug: 'automation-created-post',
            title: 'Automation-created post',
            excerpt: 'Created through the automation API.',
            bodyHtml: '<script>alert(1)</script><p>Safe body</p>',
            author: 'Example Editor',
            authorSlug: 'example-editor',
            publishedAt: '2026-08-21T00:00:00.000Z',
            categories: ['General'],
          },
        ),
      )
    } finally {
      console.info = originalInfo
    }
    expect(createdResponse.status).toBe(201)
    const created = (await json(createdResponse)).post
    expect(created.bodyHtml).toBe('<p>Safe body</p>')
    expect(created.revision).toBe(1)
    expect(auditLines.join('\n')).toContain('content.site.created')
    expect(auditLines.join('\n')).not.toContain(editorToken)

    const conflictResponse = await updatePost(
      jsonRequest(
        `http://admin.test/api/v2/sites/default/posts/${created.id}`,
        editorToken,
        'PATCH',
        { title: 'Should not overwrite' },
        { 'if-match': '0' },
      ),
      { params: Promise.resolve({ siteId: 'default', id: created.id }) },
    )
    expect(conflictResponse.status).toBe(409)
    const afterConflictResponse = await getPost(
      new Request(
        `http://admin.test/api/v2/sites/default/posts/${created.id}`,
        {
          headers: auth(editorToken),
        },
      ),
      { params: Promise.resolve({ siteId: 'default', id: created.id }) },
    )
    expect((await json(afterConflictResponse)).post.title).toBe(
      'Automation-created post',
    )

    const updateResponse = await updatePost(
      jsonRequest(
        `http://admin.test/api/v2/sites/default/posts/${created.id}`,
        editorToken,
        'PATCH',
        { title: 'Updated by automation' },
        { 'if-match': '1' },
      ),
      { params: Promise.resolve({ siteId: 'default', id: created.id }) },
    )
    expect(updateResponse.status).toBe(200)
    expect((await json(updateResponse)).post).toMatchObject({
      title: 'Updated by automation',
      revision: 2,
    })
  })

  it('enforces editor/publisher roles and deletes with a matching revision', async () => {
    const editorPublish = await publishPosts(
      new Request('http://admin.test/api/v2/sites/default/publish', {
        method: 'POST',
        headers: { ...auth(editorToken), 'idempotency-key': 'editor-attempt' },
      }),
    )
    expect(editorPublish.status).toBe(403)

    const missingKey = await publishPosts(
      new Request('http://admin.test/api/v2/sites/default/publish', {
        method: 'POST',
        headers: auth(publisherToken),
      }),
    )
    expect(missingKey.status).toBe(400)

    const publisherPublish = await publishPosts(
      new Request('http://admin.test/api/v2/sites/default/publish', {
        method: 'POST',
        headers: {
          ...auth(publisherToken),
          'idempotency-key': 'publisher-publish',
        },
      }),
    )
    expect(publisherPublish.status).toBe(202)
    const published = await json(publisherPublish)
    expect(published).toMatchObject({
      snapshotId: expect.stringMatching(/^snapshot-/),
      jobId: expect.any(String),
      jobStatus: 'queued',
    })
    const replay = await publishPosts(
      new Request('http://admin.test/api/v2/sites/default/publish', {
        method: 'POST',
        headers: {
          ...auth(publisherToken),
          'idempotency-key': 'publisher-publish',
        },
      }),
    )
    expect(replay.status).toBe(202)
    expect(await json(replay)).toMatchObject({
      snapshotId: published.snapshotId,
      jobId: published.jobId,
      jobStatus: 'queued',
    })

    const listResponse = await listPosts(
      new Request('http://admin.test/api/v2/sites/default/posts?limit=100', {
        headers: auth(editorToken),
      }),
    )
    const created = (await json(listResponse)).posts.find(
      (post) => post.slug === 'automation-created-post',
    )
    const deleteResponse = await deletePost(
      new Request(
        `http://admin.test/api/v2/sites/default/posts/${created.id}`,
        {
          method: 'DELETE',
          headers: {
            ...auth(editorToken),
            'if-match': String(created.revision),
          },
        },
      ),
      { params: Promise.resolve({ siteId: 'default', id: created.id }) },
    )
    expect(deleteResponse.status).toBe(200)
    expect((await json(deleteResponse)).deleted).toBe(true)

    const missingResponse = await getPost(
      new Request(
        `http://admin.test/api/v2/sites/default/posts/${created.id}`,
        {
          headers: auth(editorToken),
        },
      ),
      { params: Promise.resolve({ siteId: 'default', id: created.id }) },
    )
    expect(missingResponse.status).toBe(404)
  })

  it('rate-limits an automation identity per route', async () => {
    for (let index = 0; index < 60; index += 1) {
      const response = await listPosts(
        new Request(
          `http://admin.test/api/v2/sites/default/posts?rate=${index}`,
          {
            headers: auth(rateToken),
          },
        ),
      )
      expect(response.status).toBe(200)
    }
    const response = await listPosts(
      new Request('http://admin.test/api/v2/sites/default/posts?rate=blocked', {
        headers: auth(rateToken),
      }),
    )
    expect(response.status).toBe(429)
  })

  it('documents all machine endpoints and does not expose raw secrets', async () => {
    const openapi = await readFile(
      path.join(process.cwd(), 'docs/admin-api.openapi.yaml'),
      'utf8',
    )
    const docs = await readFile(
      path.join(process.cwd(), 'docs/admin-api.md'),
      'utf8',
    )
    for (const endpoint of [
      '/api/v2/sites/{siteId}/posts',
      '/api/v2/sites/{siteId}/posts/{id}',
      '/api/v2/sites/{siteId}/settings',
      '/api/v2/sites/{siteId}/authors',
      '/api/v2/sites/{siteId}/authors/{slug}',
      '/api/v2/sites/{siteId}/publish',
    ])
      expect(openapi).toContain(endpoint)
    expect(docs).toContain('Authorization: Bearer')
    expect(docs).toContain('If-Match')
    expect(docs).toContain('Claude')
    expect(openapi).not.toContain(editorToken)
    expect(docs).not.toContain(editorToken)
  })
})
