import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '../../../apps/admin/app/api/comments/moderation/route.ts'
import { PATCH } from '../../../apps/admin/app/api/comments/moderation/[id]/route.ts'

const environment = [
  'NODE_ENV',
  'ADMIN_DEV_TOKEN',
  'ADMIN_PUBLIC_ORIGIN',
  'COMMENTS_ORIGIN',
  'COMMENTS_MODERATION_TOKEN',
]
const saved = new Map()
const originalFetch = globalThis.fetch

beforeEach(() => {
  for (const name of environment) {
    saved.set(name, process.env[name])
    delete process.env[name]
  }
  process.env.NODE_ENV = 'test'
  process.env.ADMIN_DEV_TOKEN = 'admin-test-token'
  process.env.ADMIN_PUBLIC_ORIGIN = 'https://admin.test'
  process.env.COMMENTS_ORIGIN = 'https://comments.test'
  process.env.COMMENTS_MODERATION_TOKEN = 'server-only-secret'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const name of environment) {
    const value = saved.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
})

function identityHeaders() {
  return {
    'x-admin-dev-token': 'admin-test-token',
    'x-admin-dev-email': 'editor@example.test',
  }
}

describe('COMMENT-001 admin moderation boundary', () => {
  it('denies unauthenticated moderation reads before contacting the comment service', async () => {
    let upstreamCalls = 0
    globalThis.fetch = async () => {
      upstreamCalls += 1
      return Response.json({ comments: [] })
    }
    const response = await GET(
      new Request('https://admin.test/api/comments/moderation'),
    )
    expect(response.status).toBe(401)
    expect(upstreamCalls).toBe(0)
  })

  it('forwards the server-only token on the selected site-scoped list and update paths', async () => {
    const calls = []
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), headers: new Headers(init?.headers) })
      return Response.json({
        comments: [{ id: 'comment-1', status: 'pending' }],
      })
    }
    const list = await GET(
      new Request('https://admin.test/api/comments/moderation?status=pending', {
        headers: identityHeaders(),
      }),
    )
    const update = await PATCH(
      new Request('https://admin.test/api/comments/moderation/comment-1', {
        method: 'PATCH',
        headers: {
          ...identityHeaders(),
          'x-admin-site-id': 'second-publication',
          origin: 'https://admin.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'comment-1' }) },
    )
    expect(list.status).toBe(200)
    expect(update.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(calls[0].input).toBe(
      'https://comments.test/v1/sites/default/moderation/comments?status=pending',
    )
    expect(calls[1].input).toBe(
      'https://comments.test/v1/sites/second-publication/moderation/comments/comment-1',
    )
    for (const call of calls)
      expect(call.headers.get('authorization')).toBe(
        'Bearer server-only-secret',
      )
  })

  it('rejects a cross-origin moderation mutation', async () => {
    let upstreamCalls = 0
    globalThis.fetch = async () => {
      upstreamCalls += 1
      return Response.json({})
    }
    const response = await PATCH(
      new Request('https://admin.test/api/comments/moderation/comment-1', {
        method: 'PATCH',
        headers: {
          ...identityHeaders(),
          origin: 'https://attacker.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'comment-1' }) },
    )
    expect(response.status).toBe(403)
    expect(upstreamCalls).toBe(0)
  })

  it('rejects an invalid selected site before contacting the comment service', async () => {
    let upstreamCalls = 0
    globalThis.fetch = async () => {
      upstreamCalls += 1
      return Response.json({ comments: [] })
    }
    const response = await GET(
      new Request('https://admin.test/api/comments/moderation', {
        headers: { ...identityHeaders(), 'x-admin-site-id': 'Invalid site' },
      }),
    )
    expect(response.status).toBe(400)
    expect(upstreamCalls).toBe(0)
  })
})
