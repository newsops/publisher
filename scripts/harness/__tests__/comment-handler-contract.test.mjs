import { describe, expect, it } from 'vitest'
import {
  createCommentHandler,
  READ_CACHE_CONTROL,
} from '../../../apps/comments/src/app.ts'
import {
  MemoryCommentStore,
  MemoryRateLimiter,
} from '../../../apps/comments/src/db.ts'
import { createHumanVerifier } from '../../../apps/comments/src/human-verification.ts'
import { requestIp } from '../../../apps/comments/src/security.ts'

function request(path, init = {}) {
  return new Request(`https://comments.test${path}`, init)
}

function dependencies(overrides = {}) {
  return {
    store: new MemoryCommentStore(),
    limiter: new MemoryRateLimiter(),
    verifier: { verify: async (token) => token === 'valid-token' },
    moderationToken: 'moderation-secret',
    ...overrides,
  }
}

function comment(id, status = 'pending') {
  return {
    id,
    slug: 'article-slug',
    authorName: 'Reader',
    body: 'A useful comment.',
    createdAt: '2026-08-22T00:00:00.000Z',
    ...(status === 'pending' ? {} : { status }),
  }
}

describe('COMMENT-001 handler behavior', () => {
  it('ignores provider and client forwarding headers at the application boundary', () => {
    expect(
      requestIp(
        request('/v1/threads/article-slug', {
          headers: {
            'cf-connecting-ip': '203.0.113.20',
            'x-forwarded-for': '203.0.113.21',
          },
        }),
      ),
    ).toBeUndefined()
    expect(
      requestIp(
        request('/v1/threads/article-slug', {
          headers: { 'x-client-ip': '203.0.113.22' },
        }),
      ),
    ).toBe('203.0.113.22')
  })

  it('returns approved comments and uses a path-only cache key', async () => {
    const store = new MemoryCommentStore()
    await store.createPending(comment('approved-id'))
    await store.setStatus('approved-id', 'approved')
    await store.createPending({ ...comment('pending-id'), body: 'Hidden.' })
    const keys = []
    const values = new Map()
    const cache = {
      async match(key) {
        keys.push(key.url)
        return values.get(key.url)?.clone()
      },
      async put(key, response) {
        values.set(key.url, response.clone())
      },
    }
    const handler = createCommentHandler(dependencies({ store, cache }))

    const first = await handler(request('/v1/threads/article-slug?viewer=one'))
    const second = await handler(request('/v1/threads/article-slug?viewer=two'))
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe(READ_CACHE_CONTROL)
    expect(await first.json()).toMatchObject({
      comments: [{ id: 'approved-id', body: 'A useful comment.' }],
    })
    expect(await second.json()).toMatchObject({
      comments: [{ id: 'approved-id' }],
    })
    expect(keys).toEqual([
      'https://comments.test/v1/threads/article-slug',
      'https://comments.test/v1/threads/article-slug',
    ])
  })

  it('validates the configured human-verification contract before accepting a write', async () => {
    const store = new MemoryCommentStore()
    const handler = createCommentHandler(dependencies({ store }))
    const base = {
      authorName: 'Reader',
      body: 'Submitted text',
    }
    const missing = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        body: JSON.stringify(base),
        headers: { 'content-type': 'application/json' },
      }),
    )
    const invalid = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        body: JSON.stringify({ ...base, verificationToken: 'wrong' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(missing.status).toBe(403)
    expect(invalid.status).toBe(403)
    expect(await store.listForModeration()).toHaveLength(0)
  })

  it('uses an exact public origin and rejects cross-origin browser writes', async () => {
    const store = new MemoryCommentStore()
    const handler = createCommentHandler(
      dependencies({ store, publicOrigin: 'https://publication.test' }),
    )
    const read = await handler(request('/v1/threads/article-slug'))
    expect(read.headers.get('access-control-allow-origin')).toBe(
      'https://publication.test',
    )
    expect(read.headers.get('access-control-allow-origin')).not.toBe('*')
    const write = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          authorName: 'Reader',
          body: 'Cross-origin submission',
          verificationToken: 'valid-token',
        }),
      }),
    )
    expect(write.status).toBe(403)
    expect(await store.listForModeration()).toEqual([])
  })

  it('calls the configured verification endpoint and stores accepted text as pending', async () => {
    const verifyCalls = []
    const verifier = createHumanVerifier(
      'https://verification.example.test/siteverify',
      'test-secret',
      async (input, init) => {
        verifyCalls.push({
          input: String(input),
          body: String(init?.body),
        })
        return Response.json({ success: true })
      },
    )
    const store = new MemoryCommentStore()
    const handler = createCommentHandler(dependencies({ store, verifier }))
    const response = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-ip': '203.0.113.9',
        },
        body: JSON.stringify({
          authorName: '<b>Reader</b>',
          body: '<script>alert(1)</script> Helpful text',
          verificationToken: 'valid-token',
        }),
      }),
    )
    expect(response.status).toBe(202)
    expect(verifyCalls).toHaveLength(1)
    expect(verifyCalls[0].input).toBe(
      'https://verification.example.test/siteverify',
    )
    expect(verifyCalls[0].body).toContain('secret=test-secret')
    expect(verifyCalls[0].body).toContain('response=valid-token')
    expect(await store.listForModeration('pending')).toMatchObject([
      {
        authorName: 'Reader',
        body: 'alert(1) Helpful text',
        status: 'pending',
      },
    ])
  })

  it('rejects an oversized body and returns 429 after the configured limit', async () => {
    const store = new MemoryCommentStore()
    const handler = createCommentHandler(
      dependencies({
        store,
        bodyLimit: 80,
        rateLimitPerIp: 1,
        rateLimitPerThread: 1,
      }),
    )
    const oversized = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        body: JSON.stringify({
          authorName: 'Reader',
          body: 'x'.repeat(200),
          verificationToken: 'valid-token',
        }),
      }),
    )
    expect(oversized.status).toBe(413)

    const body = JSON.stringify({
      authorName: 'Reader',
      body: 'First',
      verificationToken: 'valid-token',
    })
    const first = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: { 'x-client-ip': '203.0.113.10' },
        body,
      }),
    )
    const second = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: { 'x-client-ip': '203.0.113.10' },
        body,
      }),
    )
    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
    expect(await store.listForModeration('pending')).toHaveLength(1)
  })

  it('enforces the article-wide limit across different reader addresses', async () => {
    const store = new MemoryCommentStore()
    const handler = createCommentHandler(
      dependencies({
        store,
        rateLimitPerIp: 10,
        rateLimitPerThread: 1,
      }),
    )
    const body = JSON.stringify({
      authorName: 'Reader',
      body: 'Shared article quota',
      verificationToken: 'valid-token',
    })
    const first = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: { 'x-client-ip': '203.0.113.11' },
        body,
      }),
    )
    const second = await handler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: { 'x-client-ip': '203.0.113.12' },
        body,
      }),
    )
    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
  })

  it('protects moderation reads and status changes with a bearer token', async () => {
    const store = new MemoryCommentStore()
    const deletedCacheKeys = []
    await store.createPending(comment('moderate-me'))
    const handler = createCommentHandler(
      dependencies({
        store,
        cache: {
          match: async () => undefined,
          put: async () => {},
          delete: async (key) => {
            deletedCacheKeys.push(key.url)
            return true
          },
        },
      }),
    )
    const unauthenticated = await handler(
      request('/v1/moderation/comments', { method: 'GET' }),
    )
    const listed = await handler(
      request('/v1/moderation/comments?status=pending', {
        headers: { authorization: 'Bearer moderation-secret' },
      }),
    )
    const changed = await handler(
      request('/v1/moderation/comments/moderate-me', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer moderation-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      }),
    )
    expect(unauthenticated.status).toBe(401)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({
      comments: [{ id: 'moderate-me', status: 'pending' }],
    })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({
      comment: { id: 'moderate-me', status: 'approved' },
    })
    expect(deletedCacheKeys).toEqual([
      'https://comments.test/v1/threads/article-slug',
    ])
  })
})
