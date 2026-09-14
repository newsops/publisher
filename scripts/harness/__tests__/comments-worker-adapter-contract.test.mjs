import { describe, expect, it } from 'vitest'
import worker, {
  createWorkerFetchHandler,
  requestWithoutCallerClientIp,
} from '../../../apps/comments/src/worker.ts'
import { createCommentHandler } from '../../../apps/comments/src/app.ts'
import {
  MemoryCommentStore,
  MemoryRateLimiter,
} from '../../../apps/comments/src/db.ts'

const publicOrigin = 'https://www.publication.test'

function request(path, init = {}) {
  return new Request(
    `https://comments.publication.test${path.replace('/v1/threads/', '/v1/sites/publication/threads/').replace('/v1/moderation/comments', '/v1/sites/publication/moderation/comments')}`,
    init,
  )
}

function parseJsonc(source) {
  return JSON.parse(
    source.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'),
  )
}

function workerEnvironment() {
  return {
    COMMENTS_DATABASE_URL:
      'postgresql://comments:unused@database.test/comments',
    COMMENTS_MODERATION_TOKEN: 'moderation-secret',
    HUMAN_VERIFICATION_SECRET: 'verification-secret',
    HUMAN_VERIFICATION_URL: 'https://verification.test/siteverify',
    MAX_COMMENT_BODY_BYTES: '16384',
    PUBLIC_ORIGINS: JSON.stringify({ publication: publicOrigin }),
    RATE_LIMIT_PER_IP: '5',
    RATE_LIMIT_PER_THREAD: '20',
    RATE_LIMIT_WINDOW_SECONDS: '900',
  }
}

describe('INFRA-001 Cloudflare Worker adapter', () => {
  it('routes CORS preflight and unsupported methods through the same HTTP contract', async () => {
    const options = request('/v1/threads/article-slug', {
      method: 'OPTIONS',
      headers: { origin: publicOrigin },
    })
    const workerOptions = await worker.fetch(options, workerEnvironment(), {})
    expect(workerOptions.status).toBe(204)
    expect(workerOptions.headers.get('access-control-allow-origin')).toBe(
      publicOrigin,
    )

    const unsupported = request('/v1/threads/article-slug', {
      method: 'PUT',
      headers: { origin: publicOrigin },
    })
    const workerResponse = await worker.fetch(
      unsupported,
      workerEnvironment(),
      {},
    )
    const nodeResponse = await createCommentHandler({
      store: new MemoryCommentStore(),
      limiter: new MemoryRateLimiter(),
      verifier: { verify: async () => true },
      moderationToken: 'moderation-secret',
      publicOrigins: { publication: publicOrigin },
    })(unsupported)
    expect(workerResponse.status).toBe(nodeResponse.status)
    expect(await workerResponse.json()).toEqual(await nodeResponse.json())
    expect(workerResponse.headers.get('access-control-allow-origin')).toBe(
      publicOrigin,
    )
  })

  it('keeps Node HTTP transport out of the Worker entrypoint', async () => {
    const fs = await import('node:fs/promises')
    const source = await fs.readFile(
      new URL('../../../apps/comments/src/worker.ts', import.meta.url),
      'utf8',
    )
    const configuration = parseJsonc(
      await fs.readFile(
        new URL('../../../apps/comments/wrangler.jsonc', import.meta.url),
        'utf8',
      ),
    )
    expect(source).not.toMatch(/node:http|createServer|node:stream/)
    expect(source).toContain('env.COMMENTS_DATABASE_URL')
    expect(source).not.toContain('HYPERDRIVE')
    expect(configuration.compatibility_flags).toContain('nodejs_compat')
    expect(configuration).not.toHaveProperty('hyperdrive')
    expect(configuration.vars).not.toHaveProperty('COMMENTS_DATABASE_URL')
    expect(configuration.vars).not.toHaveProperty('COMMENTS_MODERATION_TOKEN')
    expect(configuration.vars).not.toHaveProperty('HUMAN_VERIFICATION_SECRET')
  })

  it('uses a bounded direct PostgreSQL connection only for one production request', async () => {
    const fs = await import('node:fs/promises')
    const source = await fs.readFile(
      new URL('../../../apps/comments/src/worker.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('createPostgresPool(connectionString, { max: 1 })')
    expect(source).toContain('finally')
    expect(source).toContain('await pool.end()')
  })

  it('removes caller-controlled client IP without consuming provider headers', () => {
    const normalized = requestWithoutCallerClientIp(
      request('/v1/threads/article-slug', {
        headers: {
          'x-client-ip': '203.0.113.99',
        },
      }),
    )
    expect(normalized.headers.get('x-client-ip')).toBeNull()
  })

  it('preserves write and moderation semantics through the Worker transport', async () => {
    const store = new MemoryCommentStore()
    const workerHandler = createWorkerFetchHandler(workerEnvironment(), {
      store,
      limiter: new MemoryRateLimiter(),
      verifier: { verify: async () => true },
      moderationToken: 'moderation-secret',
      publicOrigin,
      rateLimitPerIp: 1,
      rateLimitPerThread: 2,
    })
    const submission = await workerHandler(
      request('/v1/threads/article-slug', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: publicOrigin,
          'x-client-ip': '203.0.113.99',
        },
        body: JSON.stringify({
          authorName: 'Reader',
          body: 'A useful comment.',
          verificationToken: 'valid-token',
        }),
      }),
    )
    expect(submission.status).toBe(202)
    expect(await submission.json()).toEqual({ status: 'pending' })

    const pending = await workerHandler(
      request('/v1/moderation/comments?status=pending', {
        headers: { authorization: 'Bearer moderation-secret' },
      }),
    )
    expect(pending.status).toBe(200)
    const { comments } = await pending.json()
    expect(comments).toHaveLength(1)

    const approved = await workerHandler(
      request(`/v1/moderation/comments/${comments[0].id}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer moderation-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      }),
    )
    expect(approved.status).toBe(200)

    const read = await workerHandler(request('/v1/threads/article-slug'))
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({
      slug: 'article-slug',
      comments: [{ authorName: 'Reader', status: 'approved' }],
    })
  })
})
