import { describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const command = path.join(root, 'packages/ops-cli/bin/publisher.mjs')

function run(args, environment = {}) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
  })
  return { status: result.status, body: JSON.parse(result.stdout) }
}

function runAsync(args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [command, ...args], {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (status) => {
      try {
        resolve({ status, body: JSON.parse(stdout), stderr })
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function withServer(handler, callback) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const origin = `http://127.0.0.1:${address.port}`
  try {
    return await callback(origin)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

describe('agent operations CLI contract', () => {
  it('inspects a generic archive without emitting its local path or article body', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-archive-'),
    )
    await writeFile(
      path.join(directory, 'archive.json'),
      JSON.stringify({
        schemaVersion: 1,
        settings: {
          name: 'Generic News',
          shortName: 'Generic',
          description: 'A generic archive fixture.',
          canonicalOrigin: 'https://archive.example.test',
          language: 'en',
          locale: 'en-US',
          publisherName: 'Generic News',
          themeId: 'editorial',
        },
        authors: [{ slug: 'editor', name: 'Editor', bio: 'Fixture editor.' }],
        tags: [{ slug: 'General', name: 'General' }],
        media: [],
        posts: [
          {
            sourceId: 'archive-1',
            slug: 'archive-story',
            title: 'Archive story title',
            excerpt: 'Generic archive summary.',
            bodyHtml: '<p>private archive body sentinel</p>',
            author: 'Editor',
            authorSlug: 'editor',
            seoTitle: 'Archive story title',
            seoDescription: 'Generic archive summary.',
            publishedAt: '2026-09-13T00:00:00.000Z',
            categories: ['General'],
          },
        ],
      }),
    )
    const result = run([
      'content',
      'inspect',
      '--archive',
      directory,
      '--json',
      '--non-interactive',
    ])
    expect(result.status).toBe(0)
    expect(result.body).toMatchObject({
      schemaVersion: 1,
      ok: true,
      code: 'ARCHIVE_INSPECTED',
      counts: { authors: 1, tags: 1, posts: 1, media: 0 },
      nonInteractive: true,
    })
    expect(JSON.stringify(result.body)).not.toContain(directory)
    expect(JSON.stringify(result.body)).not.toContain('private archive body')
  })

  it('returns a versioned redacted configuration result without prompting', () => {
    const result = run(['doctor', '--json', '--non-interactive'], {
      PUBLISHER_ADMIN_ORIGIN: '',
      PUBLISHER_API_TOKEN: '',
    })
    expect(result.status).toBe(20)
    expect(result.body).toEqual({
      schemaVersion: 1,
      ok: false,
      code: 'CONFIGURATION_REQUIRED',
      missing: ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'],
      nonInteractive: true,
    })
    expect(JSON.stringify(result.body)).not.toContain('token')
  })

  it('does not issue a mutation when a human authority is required', () => {
    const result = run([
      'publish',
      '--json',
      '--non-interactive',
      '--requires-authority',
    ])
    expect(result.status).toBe(40)
    expect(result.body).toMatchObject({
      schemaVersion: 1,
      ok: false,
      code: 'AUTHORITY_REQUIRED',
      mutationAttempted: false,
    })
  })

  it('restores only through the scoped Admin API and redacts archive content', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-restore-'),
    )
    await writeFile(
      path.join(directory, 'archive.json'),
      JSON.stringify({
        schemaVersion: 1,
        settings: {
          name: 'Generic News',
          shortName: 'Generic',
          description: 'Generic restore fixture.',
          canonicalOrigin: 'https://archive.example.test',
          language: 'en',
          locale: 'en-US',
          publisherName: 'Generic News',
          themeId: 'editorial',
        },
        authors: [{ slug: 'editor', name: 'Editor', bio: 'Fixture editor.' }],
        tags: [{ slug: 'General', name: 'General' }],
        media: [],
        posts: [
          {
            sourceId: 'archive-1',
            slug: 'archive-story',
            title: 'Archive story',
            excerpt: 'Generic archive summary.',
            bodyHtml: '<p>private archive body sentinel</p>',
            author: 'Editor',
            authorSlug: 'editor',
            seoTitle: 'Archive story',
            seoDescription: 'Generic archive summary.',
            publishedAt: '2026-09-13T00:00:00.000Z',
            categories: ['General'],
          },
        ],
      }),
    )
    await withServer(
      async (request, response) => {
        expect(request.method).toBe('POST')
        expect(request.url).toBe('/api/v2/sites/default/content-restore')
        expect(request.headers.authorization).toBe('Bearer test-token')
        expect(request.headers['idempotency-key']).toBe('restore-request-001')
        response.statusCode = 202
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            operation: {
              operationId: 'restore-op-1',
              siteId: 'default',
              revision: 2,
              counts: { authors: 1, tags: 1, posts: 1, media: 0 },
            },
          }),
        )
      },
      async (origin) => {
        const result = await runAsync(
          [
            'content',
            'restore',
            '--archive',
            directory,
            '--site',
            'default',
            '--expected-revision',
            '1',
            '--idempotency-key',
            'restore-request-001',
            '--non-interactive',
            '--json',
          ],
          {
            PUBLISHER_ADMIN_ORIGIN: origin,
            PUBLISHER_API_TOKEN: 'test-token',
          },
        )
        expect(result.status).toBe(0)
        expect(result.body).toMatchObject({
          ok: true,
          code: 'ARCHIVE_RESTORE_ACCEPTED',
          operationId: 'restore-op-1',
        })
        expect(JSON.stringify(result.body)).not.toContain(directory)
        expect(JSON.stringify(result.body)).not.toContain(
          'private archive body',
        )
      },
    )
  })

  it('returns authenticated site and operation states with stable remote metadata', async () => {
    await withServer(
      (request, response) => {
        expect(request.headers.authorization).toBe('Bearer test-token')
        response.setHeader('content-type', 'application/json')
        if (request.url === '/api/v1/posts?limit=1')
          return response.end(JSON.stringify({ posts: [{ id: 'post-1' }] }))
        if (request.url === '/api/v1/operations/job-1')
          return response.end(
            JSON.stringify({
              operation: {
                id: 'job-1',
                status: 'published',
                terminal: true,
                retryable: false,
              },
            }),
          )
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not found' }))
      },
      async (origin) => {
        const environment = {
          PUBLISHER_ADMIN_ORIGIN: origin,
          PUBLISHER_API_TOKEN: 'test-token',
        }
        const status = await runAsync(['status', '--json'], environment)
        expect(status.status).toBe(0)
        expect(status.body).toMatchObject({
          schemaVersion: 1,
          ok: true,
          code: 'READY',
          status: 200,
          state: {
            kind: 'site',
            status: 'ready',
            terminal: false,
            retryable: false,
            site: { posts: [{ id: 'post-1' }] },
          },
        })

        const operation = await runAsync(
          ['operation', 'get', 'job-1', '--json'],
          environment,
        )
        expect(operation.status).toBe(0)
        expect(operation.body).toMatchObject({
          schemaVersion: 1,
          ok: true,
          code: 'OPERATION',
          status: 200,
          state: {
            operation: { id: 'job-1', terminal: true, retryable: false },
          },
        })
      },
    )
  })

  it('preserves a publish idempotency key and reports one operation identity', async () => {
    const jobs = new Map()
    await withServer(
      (request, response) => {
        expect(request.method).toBe('POST')
        expect(request.url).toBe('/api/v1/publish')
        expect(request.headers.authorization).toBe('Bearer test-token')
        const key = request.headers['idempotency-key']
        const jobId = jobs.get(key) ?? `job-${jobs.size + 1}`
        jobs.set(key, jobId)
        response.statusCode = 202
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ jobId, jobStatus: 'queued' }))
      },
      async (origin) => {
        const environment = {
          PUBLISHER_ADMIN_ORIGIN: origin,
          PUBLISHER_API_TOKEN: 'test-token',
        }
        const args = ['publish', '--idempotency-key', 'release-1', '--json']
        const first = await runAsync(args, environment)
        const second = await runAsync(args, environment)
        expect(first.status).toBe(0)
        expect(second.status).toBe(0)
        expect(first.body.operationId).toBe('job-1')
        expect(second.body.operationId).toBe('job-1')
        expect(jobs).toEqual(new Map([['release-1', 'job-1']]))
      },
    )
  })

  it('discovers a device flow without leaking tokens or persisting credentials', async () => {
    const requests = []
    await withServer(
      (request, response) => {
        requests.push({ method: request.method, url: request.url })
        response.setHeader('content-type', 'application/json')
        if (request.url === '/.well-known/openid-configuration')
          return response.end(
            JSON.stringify({
              device_authorization_endpoint: `http://${request.headers.host}/device`,
              token_endpoint: `http://${request.headers.host}/token`,
            }),
          )
        if (request.url === '/device')
          return response.end(
            JSON.stringify({
              verification_uri: 'https://verify.example.test/device',
              user_code: 'ABCD-EFGH',
              device_code: 'private-device-code',
              interval: 1,
              access_token: 'must-not-leak',
            }),
          )
        expect(request.method).toBe('POST')
        expect(request.url).toBe('/token')
        response.end(JSON.stringify({ error: 'authorization_pending' }))
      },
      async (origin) => {
        const result = await runAsync(['auth', 'login', '--device', '--json'], {
          PUBLISHER_OIDC_ISSUER: origin,
          PUBLISHER_OIDC_CLIENT_ID: 'publisher-cli',
        })
        expect(result.status).toBe(40)
        expect(result.body).toEqual({
          schemaVersion: 1,
          ok: false,
          code: 'AUTHORITY_REQUIRED',
          verificationUri: 'https://verify.example.test/device',
          userCode: 'ABCD-EFGH',
          interval: 1,
          pollAttempted: true,
          tokenPersisted: false,
        })
        expect(JSON.stringify(result.body)).not.toContain('must-not-leak')
        expect(JSON.stringify(result.body)).not.toContain('private-device-code')
        expect(requests).toEqual([
          { method: 'GET', url: '/.well-known/openid-configuration' },
          { method: 'POST', url: '/device' },
          { method: 'POST', url: '/token' },
        ])
      },
    )
  })
})
