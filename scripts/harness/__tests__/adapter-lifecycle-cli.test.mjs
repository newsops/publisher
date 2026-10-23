import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cliFixture } from './cli-fixture.mjs'
import { getAdapterRepositoryForSite } from '../../../apps/admin/app/lib/index.ts'
import {
  GET,
  POST,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/adapters/[adapterId]/route.ts'

const base = ['--site', 'example', '--id', 'google.analytics']
describe('CLI-005 adapter lifecycle', () => {
  it('validates the installed configuration without an input file against the real API handlers', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-adapter-validation-'),
    )
    const environment = {
      NODE_ENV: 'test',
      ADMIN_DATA_DIR: directory,
      ADMIN_SITES_JSON: JSON.stringify([
        {
          siteId: 'example',
          name: 'Example',
          canonicalOrigin: 'https://example.test',
          themeId: 'editorial',
        },
      ]),
      ADMIN_AUTOMATION_KEYS: JSON.stringify([
        {
          id: 'adapter-validation',
          role: 'editor',
          sites: ['example'],
          sha256: createHash('sha256')
            .update('private-token-sentinel')
            .digest('hex'),
        },
      ]),
    }
    const previous = new Map(
      Object.keys(environment).map((key) => [key, process.env[key]]),
    )
    Object.assign(process.env, environment)
    const repository = getAdapterRepositoryForSite('example')
    const configuration = { measurementId: 'G-EXAMPLE123', consent: 'denied' }
    try {
      const installed = await repository.configure(
        'google.analytics',
        configuration,
      )
      await cliFixture(
        async (call) => {
          const request = new Request('http://admin.test' + call.url, {
            method: call.method,
            headers: call.headers,
            ...(call.body ? { body: JSON.stringify(call.body) } : {}),
          })
          const context = {
            params: Promise.resolve({
              siteId: 'example',
              adapterId: 'google.analytics',
            }),
          }
          const response = await (call.method === 'GET' ? GET : POST)(
            request,
            context,
          )
          return { status: response.status, body: await response.json() }
        },
        async ({ run, calls }) => {
          const result = await run([
            'adapter',
            'validate',
            ...base,
            '--revision',
            String(installed.revision),
            '--non-interactive',
          ])
          expect(result.status, JSON.stringify(result.body)).toBe(0)
          expect(result.body.valid).toBe(true)
          expect(calls.map(({ method }) => method)).toEqual(['GET', 'POST'])
          expect(calls[1].body).toEqual({ action: 'validate', configuration })
          expect(calls[1].headers['if-match']).toBe('"1"')
          expect(await repository.get('google.analytics')).toEqual(installed)
        },
      )
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    [
      'revision conflict',
      {
        siteId: 'example',
        adapter: {
          adapterId: 'google.analytics',
          revision: 4,
          configuration: {},
        },
      },
      'ADAPTER_REVISION_CONFLICT',
    ],
    [
      'missing configuration',
      {
        siteId: 'example',
        adapter: { adapterId: 'google.analytics', revision: 3 },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'missing revision',
      {
        siteId: 'example',
        adapter: { adapterId: 'google.analytics', configuration: {} },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'non-numeric revision',
      {
        siteId: 'example',
        adapter: {
          adapterId: 'google.analytics',
          revision: '3',
          configuration: {},
        },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'array configuration',
      {
        siteId: 'example',
        adapter: {
          adapterId: 'google.analytics',
          revision: 3,
          configuration: [],
        },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'wrong site',
      {
        siteId: 'other',
        adapter: {
          adapterId: 'google.analytics',
          revision: 3,
          configuration: {},
        },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'wrong adapter',
      {
        siteId: 'example',
        adapter: { adapterId: 'other.adapter', revision: 3, configuration: {} },
      },
      'MALFORMED_RESPONSE',
    ],
    [
      'wrong installation site',
      {
        siteId: 'example',
        adapter: {
          siteId: 'other',
          adapterId: 'google.analytics',
          revision: 3,
          configuration: {},
        },
      },
      'MALFORMED_RESPONSE',
    ],
  ])(
    'blocks validation after a %s read instead of issuing POST',
    async (_name, body, clientCode) => {
      await cliFixture(
        () => ({
          body: { ...body, adapter: { siteId: 'example', ...body.adapter } },
        }),
        async ({ run, calls }) => {
          const result = await run([
            'adapter',
            'validate',
            ...base,
            '--revision',
            '3',
            '--non-interactive',
          ])
          expect(result.status).toBe(30)
          expect(result.body.clientCode).toBe(clientCode)
          expect(result.body.mutationAttempted).toBe(false)
          expect(calls.map(({ method }) => method)).toEqual(['GET'])
        },
      )
    },
  )

  it('does not POST validation when reading the installation fails', async () => {
    await cliFixture(
      () => ({ status: 403, body: { error: 'denied' } }),
      async ({ run, calls }) => {
        const result = await run([
          'adapter',
          'validate',
          ...base,
          '--revision',
          '3',
          '--non-interactive',
        ])
        expect(result.status).toBe(30)
        expect(calls.map(({ method }) => method)).toEqual(['GET'])
      },
    )
  })

  it('uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-adapter-'),
    )
    const file = path.join(directory, 'configuration.json')
    const configuration = { measurementId: 'G-EXAMPLE123', consent: 'denied' }
    await writeFile(file, JSON.stringify(configuration))
    try {
      await cliFixture(
        () => ({
          body: {
            siteId: 'example',
            adapter: {
              adapterId: 'google.analytics',
              configuration,
              hasSecretReferences: false,
            },
          },
        }),
        async ({ run, calls }) => {
          for (const action of [
            'list',
            'get',
            'configure',
            'validate',
            'enable',
            'disable',
          ]) {
            const result = await run([
              'adapter',
              action,
              ...base,
              '--input',
              file,
              '--revision',
              '3',
              '--non-interactive',
            ])
            expect(result.status, action).toBe(0)
            expect(result.body.siteId).toBe('example')
            expect(result.stdout).not.toContain('private-token-sentinel')
          }
          expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
            'GET /api/v2/sites/example/adapters',
            'GET /api/v2/sites/example/adapters/google.analytics',
            'PATCH /api/v2/sites/example/adapters/google.analytics',
            ...Array(3).fill(
              'POST /api/v2/sites/example/adapters/google.analytics',
            ),
          ])
          expect(calls[2]).toMatchObject({
            body: { configuration },
            headers: { 'if-match': '"3"' },
          })
          expect(calls.slice(3).map((call) => call.body.action)).toEqual([
            'validate',
            'enable',
            'disable',
          ])
          expect(
            calls.slice(2).every((call) => call.headers['if-match'] === '"3"'),
          ).toBe(true)
        },
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['unknown', ['adapter', 'unknown', ...base], 'USAGE'],
    [
      'input',
      ['adapter', 'configure', ...base, '--revision', '3', '--non-interactive'],
      'INPUT_REQUIRED',
    ],
    [
      'revision',
      ['adapter', 'validate', ...base, '--non-interactive'],
      'INPUT_REQUIRED',
    ],
    [
      'invalid revision',
      ['adapter', 'enable', ...base, '--revision', '0', '--non-interactive'],
      'INPUT_REQUIRED',
    ],
    [
      'interactive mutation',
      ['adapter', 'disable', ...base, '--revision', '3'],
      'NON_INTERACTIVE_REQUIRED',
    ],
    [
      'old option',
      ['adapter', 'get', '--site', 'example', '--plugin', 'google.analytics'],
      'INPUT_REQUIRED',
    ],
    [
      'noncanonical option',
      ['adapter', 'get', '--site', 'example', '--adapter', 'google.analytics'],
      'INPUT_REQUIRED',
    ],
  ])('rejects %s before any request', async (_name, args, code) => {
    await cliFixture(
      () => ({ body: {} }),
      async ({ run, calls }) => {
        const result = await run(args)
        expect(result.status).toBe(10)
        expect(result.body.code).toBe(code)
        expect(calls).toEqual([])
      },
    )
  })

  it('redacts a token echoed by a failing remote service', async () => {
    await cliFixture(
      () => ({
        status: 403,
        body: {
          error: 'private-token-sentinel',
          nested: { authorization: 'Bearer private-token-sentinel' },
        },
      }),
      async ({ run }) => {
        const result = await run(['adapter', 'list', '--site', 'example'])
        expect(result.status).toBe(30)
        expect(result.stdout + result.stderr).not.toContain(
          'private-token-sentinel',
        )
      },
    )
  })
})
