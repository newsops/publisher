import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cliFixture, guidanceReply } from './cli-fixture.mjs'

const temporary = []
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})
async function input(text) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-guidance-'))
  temporary.push(directory)
  const file = path.join(directory, 'input.json')
  await writeFile(file, text)
  return file
}

describe('ADMIN-002 agent guidance CLI preflight', () => {
  it('gets and revision-updates a private selected-site context', async () => {
    const file = await input('Require a representative image.')
    await cliFixture(
      () => ({ body: guidanceReply }),
      async ({ run, calls }) => {
        const get = await run(['site', 'guidance', 'get', '--site', 'example'])
        const set = await run([
          'site',
          'guidance',
          'set',
          '--site',
          'example',
          '--file',
          file,
          '--revision',
          '4',
          '--non-interactive',
        ])
        expect(get.body.agentContext).toEqual(guidanceReply.agentContext)
        expect(set.status).toBe(0)
        expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
          'GET /api/v2/sites/example/agent-guidance',
          'PATCH /api/v2/sites/example/agent-guidance',
        ])
        expect(calls[1]).toMatchObject({
          headers: { 'if-match': '"4"' },
          body: { instructions: 'Require a representative image.' },
        })
        expect(get.stdout + set.stdout).not.toContain('private-token-sentinel')
      },
    )
  })

  it.each(['plan', 'create', 'update'])(
    'fetches current guidance before post %s and includes its revision',
    async (action) => {
      const file = await input(
        JSON.stringify({ title: 'Example', authorSlug: 'reporter' }),
      )
      await cliFixture(
        (call) => ({
          body: call.url.endsWith('/agent-guidance')
            ? guidanceReply
            : call.url.includes('/authors/')
              ? {
                  author: {
                    slug: 'reporter',
                    name: 'Reporter',
                    editorialPersona: 'Verify facts.',
                  },
                }
              : { post: { id: 'p1', authorSlug: 'reporter', revision: 2 } },
        }),
        async ({ run, calls }) => {
          const result = await run([
            'post',
            action,
            '--site',
            'example',
            '--author',
            'reporter',
            '--input',
            file,
            '--post',
            'p1',
            '--revision',
            '1',
            '--non-interactive',
          ])
          expect(result.status).toBe(0)
          expect(result.body.agentContext).toEqual(guidanceReply.agentContext)
          const guidanceIndex = calls.findIndex((call) =>
            call.url.endsWith('/agent-guidance'),
          )
          expect(guidanceIndex).toBeGreaterThanOrEqual(0)
          if (action !== 'plan')
            expect(
              calls.findIndex((call) => call.method !== 'GET'),
            ).toBeGreaterThan(guidanceIndex)
          expect(result.stdout).not.toContain('private-token-sentinel')
        },
      )
    },
  )

  it.each([undefined, { instructions: '', revision: 0 }])(
    'fails closed on a malformed successful guidance response',
    async (agentContext) => {
      const file = await input(JSON.stringify({ authorSlug: 'reporter' }))
      await cliFixture(
        (call) => ({
          body: call.url.endsWith('/agent-guidance')
            ? { siteId: 'example', agentContext }
            : { author: { slug: 'reporter', name: 'Reporter' } },
        }),
        async ({ run, calls }) => {
          const result = await run([
            'post',
            'create',
            '--site',
            'example',
            '--author',
            'reporter',
            '--input',
            file,
            '--non-interactive',
          ])
          expect(result.status).not.toBe(0)
          expect(result.body.code).toBe('AGENT_CONTEXT_UNAVAILABLE')
          expect(calls.every((call) => call.method === 'GET')).toBe(true)
        },
      )
    },
  )

  it.each([
    'post-delete',
    'article-set',
    'media-approve',
    'post-submit',
    'desk',
    'publish',
  ])(
    'preflights %s before mutation and stops on guidance failure',
    async (operation) => {
      const file = await input('{}')
      const commands = {
        'post-delete': ['post', 'delete', '--post', 'p1', '--revision', '2'],
        'article-set': [
          'article',
          'set',
          '--article',
          'p1',
          '--revision',
          '2',
          '--input',
          file,
        ],
        'media-approve': ['media', 'approve', '--media', 'm1'],
        'post-submit': ['post', 'submit', '--post', 'p1', '--revision', '2'],
        desk: [
          'desk',
          'request-changes',
          '--post',
          'p1',
          '--revision',
          '2',
          '--note',
          'Fix facts',
        ],
        publish: ['publish', '--idempotency-key', 'example-release'],
      }
      await cliFixture(
        () => ({ status: 503, body: { error: 'unavailable' } }),
        async ({ run, calls }) => {
          const result = await run([
            ...commands[operation],
            '--site',
            'example',
            '--non-interactive',
          ])
          expect(result.status).not.toBe(0)
          expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
            'GET /api/v2/sites/example/agent-guidance',
          ])
        },
      )
    },
  )
})
