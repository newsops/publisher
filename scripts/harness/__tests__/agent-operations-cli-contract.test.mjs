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
            bodyMarkdown: 'private archive body sentinel',
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

  it('retrieves the selected author persona before planning a Markdown post', async () => {
    await withServer(
      (request, response) => {
        expect(request.method).toBe('GET')
        expect(request.url).toBe('/api/v2/sites/default/authors/reporter')
        expect(request.headers.authorization).toBe('Bearer test-token')
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({
            author: {
              slug: 'reporter',
              name: 'Reporter',
              editorialPersona: 'Use concise factual language.',
            },
          }),
        )
      },
      async (origin) => {
        const result = await runAsync(
          [
            'post',
            'plan',
            '--site',
            'default',
            '--author',
            'reporter',
            '--json',
            '--non-interactive',
          ],
          {
            PUBLISHER_ADMIN_ORIGIN: origin,
            PUBLISHER_API_TOKEN: 'test-token',
          },
        )
        expect(result.status).toBe(0)
        expect(result.body).toMatchObject({
          ok: true,
          code: 'POST_PLAN',
          siteId: 'default',
          authorContext: {
            authorSlug: 'reporter',
            displayName: 'Reporter',
            editorialPersona: 'Use concise factual language.',
          },
        })
        expect(JSON.stringify(result.body)).not.toContain('test-token')
      },
    )
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
            bodyMarkdown: 'private archive body sentinel',
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
        if (request.method === 'GET') {
          expect(request.url).toBe('/api/v2/sites/default/agent-guidance')
          response.setHeader('content-type', 'application/json')
          response.end(
            JSON.stringify({
              siteId: 'default',
              agentContext: {
                instructions: 'Use a representative image.',
                revision: 1,
              },
            }),
          )
          return
        }
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
        if (request.url === '/api/v2/sites')
          return response.end(
            JSON.stringify({ sites: [{ siteId: 'default' }] }),
          )
        if (request.url === '/api/v2/sites/default/operations/job-1')
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
            site: [{ siteId: 'default' }],
          },
        })

        const operation = await runAsync(
          ['operation', 'get', 'job-1', '--site', 'default', '--json'],
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

  it('keeps the envelope code authoritative when the admin returns a malformed body', async () => {
    await withServer(
      (request, response) => {
        expect(request.headers.authorization).toBe('Bearer test-token')
        response.setHeader('content-type', 'application/json')
        response.end('<html>not json</html>')
      },
      async (origin) => {
        const result = await runAsync(['site', 'list', '--json'], {
          PUBLISHER_ADMIN_ORIGIN: origin,
          PUBLISHER_API_TOKEN: 'test-token',
        })
        expect(result.status).toBe(30)
        expect(result.body).toEqual({
          schemaVersion: 1,
          ok: false,
          code: 'REMOTE_ERROR',
          clientCode: 'MALFORMED_RESPONSE',
          status: 200,
        })
        expect(JSON.stringify(result.body)).not.toContain('test-token')
      },
    )
  })

  it('preserves a publish idempotency key and reports one operation identity', async () => {
    const jobs = new Map()
    await withServer(
      (request, response) => {
        if (request.method === 'GET') {
          expect(request.url).toBe('/api/v2/sites/default/agent-guidance')
          response.setHeader('content-type', 'application/json')
          response.end(
            JSON.stringify({
              siteId: 'default',
              agentContext: { instructions: '', revision: 1 },
            }),
          )
          return
        }
        expect(request.method).toBe('POST')
        expect(request.url).toBe('/api/v2/sites/default/publish')
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
        const args = [
          'publish',
          '--site',
          'default',
          '--idempotency-key',
          'release-1',
          '--json',
        ]
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

  it('runs the desk loop: submit, report, rejected approval, attested approval', async () => {
    const calls = []
    const checklist = ['facts-verified', 'headline-accurate']
    await withServer(
      (request, response) => {
        let raw = ''
        request.on('data', (chunk) => (raw += chunk))
        request.on('end', () => {
          calls.push({
            method: request.method,
            url: request.url,
            ifMatch: request.headers['if-match'],
            body: raw ? JSON.parse(raw) : undefined,
          })
          response.setHeader('content-type', 'application/json')
          if (request.method === 'PATCH') {
            response.end(
              JSON.stringify({
                siteId: 'default',
                post: { id: 'p1', status: 'review', revision: 2 },
              }),
            )
            return
          }
          if (request.method === 'GET') {
            response.end(
              JSON.stringify({
                siteId: 'default',
                postId: 'p1',
                revision: 2,
                status: 'review',
                report: {
                  checks: [
                    { id: 'image.present', level: 'fail', message: 'x' },
                  ],
                  checklist: checklist.map((id) => ({ id, label: id })),
                  approvalValid: false,
                },
              }),
            )
            return
          }
          const attested = (JSON.parse(raw).checklist ?? []).map(
            (item) => item.id,
          )
          if (attested.length < checklist.length) {
            response.statusCode = 409
            response.end(
              JSON.stringify({
                error: {
                  code: 'desk_checklist_incomplete',
                  message: 'missing',
                },
                report: { checks: [], checklist: [] },
              }),
            )
            return
          }
          response.end(
            JSON.stringify({
              siteId: 'default',
              postId: 'p1',
              revision: 3,
              status: 'review',
              report: { approvalValid: true, review: { status: 'approved' } },
            }),
          )
        })
      },
      async (origin) => {
        const environment = {
          PUBLISHER_ADMIN_ORIGIN: origin,
          PUBLISHER_API_TOKEN: 'test-token',
        }
        const submitted = await runAsync(
          [
            'post',
            'submit',
            '--site',
            'default',
            '--post',
            'p1',
            '--revision',
            '1',
            '--non-interactive',
            '--json',
          ],
          environment,
        )
        expect(submitted.status).toBe(0)
        expect(submitted.body.code).toBe('POST_SUBMITTED')
        expect(submitted.body.desk.report.checks[0].id).toBe('image.present')
        expect(calls[0]).toMatchObject({
          method: 'PATCH',
          url: '/api/v2/sites/default/posts/p1',
          ifMatch: '"1"',
          body: { status: 'review' },
        })
        const report = await runAsync(
          ['desk', 'report', '--site', 'default', '--post', 'p1', '--json'],
          environment,
        )
        expect(report.body.code).toBe('DESK_REPORT')
        expect(report.body.report.checklist).toHaveLength(2)
        const rejected = await runAsync(
          [
            'desk',
            'approve',
            '--site',
            'default',
            '--post',
            'p1',
            '--revision',
            '2',
            '--check',
            'facts-verified',
            '--non-interactive',
            '--json',
          ],
          environment,
        )
        expect(rejected.status).toBe(30)
        expect(rejected.body.code).toBe('DESK_REJECTED')
        expect(rejected.body.body.error.code).toBe('desk_checklist_incomplete')
        const approved = await runAsync(
          [
            'desk',
            'approve',
            '--site',
            'default',
            '--post',
            'p1',
            '--revision',
            '2',
            '--check',
            'facts-verified',
            '--check',
            'headline-accurate',
            '--note',
            'ok',
            '--non-interactive',
            '--json',
          ],
          environment,
        )
        expect(approved.status).toBe(0)
        expect(approved.body.code).toBe('DESK_APPROVED')
        expect(approved.body.report.approvalValid).toBe(true)
        expect(calls.at(-1)).toMatchObject({
          method: 'POST',
          url: '/api/v2/sites/default/posts/p1/desk',
          ifMatch: '"2"',
          body: {
            action: 'approve',
            note: 'ok',
            checklist: [
              { id: 'facts-verified', checked: true },
              { id: 'headline-accurate', checked: true },
            ],
          },
        })
        const interactive = await runAsync(
          [
            'desk',
            'approve',
            '--site',
            'default',
            '--post',
            'p1',
            '--revision',
            '2',
            '--check',
            'facts-verified',
            '--json',
          ],
          environment,
        )
        expect(interactive.body.code).toBe('NON_INTERACTIVE_REQUIRED')
      },
    )
  })

  it('covers every automation capability with a command that maps to one v2 operation (ARCH-006)', async () => {
    const calls = []
    const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-cli-'))
    const input = path.join(directory, 'input.json')
    await writeFile(input, JSON.stringify({ name: 'Example' }), 'utf8')
    const image = path.join(directory, 'hero.png')
    await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await withServer(
      (request, response) => {
        let raw = ''
        request.on('data', (chunk) => (raw += chunk))
        request.on('end', () => {
          calls.push({
            method: request.method,
            url: request.url,
            ifMatch: request.headers['if-match'],
            contentType: request.headers['content-type']?.split(';')[0],
          })
          response.setHeader('content-type', 'application/json')
          response.statusCode = request.method === 'POST' ? 201 : 200
          response.end(
            JSON.stringify({
              siteId: 'default',
              media: { id: 'm1', variants: [] },
              ok: true,
            }),
          )
        })
      },
      async (origin) => {
        const environment = {
          PUBLISHER_ADMIN_ORIGIN: origin,
          PUBLISHER_API_TOKEN: 'token',
        }
        const expectations = [
          [
            ['settings', 'get', '--site', 'default'],
            'SETTINGS',
            'GET /api/v2/sites/default/settings',
          ],
          [
            [
              'settings',
              'set',
              '--site',
              'default',
              '--input',
              input,
              '--revision',
              '3',
            ],
            'SETTINGS_UPDATED',
            'PATCH /api/v2/sites/default/settings',
          ],
          [
            ['site', 'update', '--site', 'default', '--input', input],
            'SITE_UPDATED',
            'PATCH /api/v2/sites/default',
          ],
          [
            ['site', 'archive', '--site', 'default'],
            'SITE_ARCHIVED',
            'DELETE /api/v2/sites/default',
          ],
          [
            ['post', 'get', '--site', 'default', '--post', 'p1'],
            'POST',
            'GET /api/v2/sites/default/posts/p1',
          ],
          [
            [
              'post',
              'delete',
              '--site',
              'default',
              '--post',
              'p1',
              '--revision',
              '2',
            ],
            'POST_DELETED',
            'DELETE /api/v2/sites/default/posts/p1',
          ],
          [
            ['plugin', 'list', '--site', 'default'],
            'PLUGINS',
            'GET /api/v2/sites/default/plugins',
          ],
          [
            [
              'plugin',
              'get',
              '--site',
              'default',
              '--plugin',
              'google.analytics',
            ],
            'PLUGIN',
            'GET /api/v2/sites/default/plugins/google.analytics',
          ],
          [
            [
              'plugin',
              'install',
              '--site',
              'default',
              '--plugin',
              'google.analytics',
            ],
            'PLUGIN_INSTALLED',
            'POST /api/v2/sites/default/plugins',
          ],
          [
            [
              'plugin',
              'configure',
              '--site',
              'default',
              '--plugin',
              'google.analytics',
              '--input',
              input,
              '--revision',
              '1',
            ],
            'PLUGIN_CONFIGURED',
            'PATCH /api/v2/sites/default/plugins/google.analytics',
          ],
          [
            [
              'plugin',
              'enable',
              '--site',
              'default',
              '--plugin',
              'google.analytics',
              '--revision',
              '2',
            ],
            'PLUGIN_ENABLED',
            'POST /api/v2/sites/default/plugins/google.analytics',
          ],
          [
            ['article', 'get', '--site', 'default', '--article', 'p1'],
            'ARTICLE',
            'GET /api/v2/sites/default/articles/p1',
          ],
          [
            [
              'article',
              'set',
              '--site',
              'default',
              '--article',
              'p1',
              '--input',
              input,
              '--revision',
              '4',
            ],
            'ARTICLE_VARIANT_SET',
            'PUT /api/v2/sites/default/articles/p1',
          ],
          [
            [
              'article',
              'remove',
              '--site',
              'default',
              '--article',
              'p1',
              '--locale',
              'ko-KR',
              '--revision',
              '5',
            ],
            'ARTICLE_VARIANT_REMOVED',
            'DELETE /api/v2/sites/default/articles/p1?locale=ko-KR',
          ],
          [
            [
              'media',
              'upload',
              '--site',
              'default',
              '--file',
              image,
              '--mime-type',
              'image/png',
              '--pending',
            ],
            'MEDIA_UPLOADED',
            'POST /api/v2/sites/default/media',
          ],
          [
            ['media', 'approve', '--site', 'default', '--media', 'm1'],
            'MEDIA_APPROVED',
            'PUT /api/v2/sites/default/media',
          ],
        ]
        for (const [args, code, call] of expectations) {
          calls.length = 0
          const result = await runAsync(
            [...args, '--non-interactive', '--json'],
            environment,
          )
          expect(result.body.code, args.join(' ')).toBe(code)
          expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([call])
        }
        const mutations = calls.filter((call) => call.ifMatch)
        expect(mutations.every((call) => /^"\d+"$/.test(call.ifMatch))).toBe(
          true,
        )
        // A mutation without --non-interactive never reaches the server.
        calls.length = 0
        const refused = await runAsync(
          ['site', 'archive', '--site', 'default', '--json'],
          environment,
        )
        expect(refused.body.code).toBe('NON_INTERACTIVE_REQUIRED')
        expect(calls).toEqual([])
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
