import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  requireSiteAutomationIdentity,
  withSiteAutomation,
} from '../../../apps/admin/app/lib/http/automation-auth.ts'

const primaryToken = 'synthetic-primary-automation-token'
const extraToken = 'synthetic-extra-automation-token'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const record = (ring, role = 'editor') => ({
  id: `${ring}-fixture`,
  role,
  sha256: digest(ring === 'primary' ? primaryToken : extraToken),
  sites: [ring === 'primary' ? 'example' : 'other'],
})
let diagnostics

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('DATABASE_URL', undefined)
  vi.stubEnv('ADMIN_AUTOMATION_KEYS', JSON.stringify([record('primary')]))
  vi.stubEnv('ADMIN_AUTOMATION_KEYS_EXTRA', JSON.stringify([record('extra')]))
  diagnostics = ['info', 'warn', 'error', 'log'].map((name) =>
    vi.spyOn(console, name).mockImplementation(() => {}),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function request(token = primaryToken) {
  return new Request('http://127.0.0.1/api/v2/sites/example/posts', {
    headers: { authorization: `Bearer ${token}` },
  })
}

function expectSecretSafe(value) {
  const serialized = JSON.stringify({
    value,
    diagnostics: diagnostics.flatMap((spy) => spy.mock.calls),
  })
  for (const secret of [
    primaryToken,
    extraToken,
    digest(primaryToken),
    digest(extraToken),
  ])
    expect(serialized).not.toContain(secret)
}

async function expectUnavailable(token = primaryToken) {
  const handler = vi.fn(() => Response.json({ forbidden: 'handler ran' }))
  const response = await withSiteAutomation(
    request(token),
    'editor',
    'example',
    handler,
  )
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  const body = await response.json()
  expect(body).toMatchObject({
    error: {
      code: 'service_unavailable',
      message: 'Automation authentication unavailable',
    },
  })
  expect(handler).not.toHaveBeenCalled()
  expectSecretSafe(body)
}

describe('SECURITY-001 additive automation keyring isolation', () => {
  it.each(['primary', 'extra'])(
    'authorizes %s without replacing either ring and denies another site',
    async (ring) => {
      const token = ring === 'primary' ? primaryToken : extraToken
      const site = ring === 'primary' ? 'example' : 'other'
      const identity = requireSiteAutomationIdentity(
        request(token),
        'editor',
        site,
      )
      expect(identity.subject).toBe(`automation:${ring}-fixture`)
      expect(identity.roles).toEqual(['editor'])
      const handler = vi.fn(async (resolved) =>
        Response.json({ subject: resolved.subject }),
      )
      const success = await withSiteAutomation(
        request(token),
        'editor',
        site,
        handler,
      )
      expect(success.status).toBe(200)
      expect(handler).toHaveBeenCalledOnce()
      expectSecretSafe(await success.json())
      const wrongSite = await withSiteAutomation(
        request(token),
        'editor',
        `${site}-denied`,
        handler,
      )
      expect(wrongSite.status).toBe(403)
      const deniedBody = await wrongSite.json()
      expect(deniedBody).toMatchObject({
        error: { code: 'forbidden' },
      })
      expectSecretSafe(deniedBody)
      expect(handler).toHaveBeenCalledOnce()
      expect(process.env.ADMIN_AUTOMATION_KEYS).toBe(
        JSON.stringify([record('primary')]),
      )
      expect(process.env.ADMIN_AUTOMATION_KEYS_EXTRA).toBe(
        JSON.stringify([record('extra')]),
      )
      expectSecretSafe(identity)
    },
  )

  it.each(['primary', 'extra'])(
    'keeps editor/publisher semantics identical in the %s ring',
    async (ring) => {
      const token = ring === 'primary' ? primaryToken : extraToken
      const site = ring === 'primary' ? 'example' : 'other'
      const variable =
        ring === 'primary'
          ? 'ADMIN_AUTOMATION_KEYS'
          : 'ADMIN_AUTOMATION_KEYS_EXTRA'
      const handler = vi.fn(async () => Response.json({ accepted: true }))
      const denied = await withSiteAutomation(
        request(token),
        'publisher',
        site,
        handler,
      )
      expect(denied.status).toBe(403)
      expectSecretSafe(await denied.json())
      expect(handler).not.toHaveBeenCalled()
      vi.stubEnv(variable, JSON.stringify([record(ring, 'publisher')]))
      const identity = requireSiteAutomationIdentity(
        request(token),
        'publisher',
        site,
      )
      expect(identity.roles).toEqual(['editor', 'publisher'])
      for (const role of ['editor', 'publisher']) {
        const granted = await withSiteAutomation(
          request(token),
          role,
          site,
          handler,
        )
        expect(granted.status).toBe(200)
        expectSecretSafe(await granted.json())
      }
      expect(handler).toHaveBeenCalledTimes(2)
    },
  )

  it('fails closed when both keyring configurations are missing', async () => {
    vi.stubEnv('ADMIN_AUTOMATION_KEYS', undefined)
    vi.stubEnv('ADMIN_AUTOMATION_KEYS_EXTRA', undefined)
    await expectUnavailable()
  })

  it.each(['ADMIN_AUTOMATION_KEYS', 'ADMIN_AUTOMATION_KEYS_EXTRA'])(
    'rejects malformed JSON in %s despite a valid sibling ring',
    async (variable) => {
      vi.stubEnv(variable, `{"private":"${extraToken}",broken`)
      await expectUnavailable(
        variable === 'ADMIN_AUTOMATION_KEYS' ? extraToken : primaryToken,
      )
    },
  )

  const invalidRecords = [
    ['non-array ring', {}],
    ['null record', [null]],
    [
      'missing identifier',
      [{ role: 'editor', sha256: digest(primaryToken), sites: ['example'] }],
    ],
    ['non-string identifier', [{ ...record('primary'), id: 12 }]],
    ['unknown role', [{ ...record('primary'), role: 'owner' }]],
    ['invalid digest', [{ ...record('primary'), sha256: 'not-a-sha256' }]],
    ['non-string digest', [{ ...record('primary'), sha256: 42 }]],
    ['non-array sites', [{ ...record('primary'), sites: 'example' }]],
    ['invalid site member', [{ ...record('primary'), sites: [42] }]],
  ]
  for (const variable of [
    'ADMIN_AUTOMATION_KEYS',
    'ADMIN_AUTOMATION_KEYS_EXTRA',
  ]) {
    it.each(invalidRecords)(
      `rejects %s in ${variable} without dropping invalid records`,
      async (_name, value) => {
        vi.stubEnv(variable, JSON.stringify(value))
        await expectUnavailable()
      },
    )
  }

  it.each(['across rings', 'inside primary', 'inside extra'])(
    'rejects duplicate IDs %s',
    async (location) => {
      if (location === 'across rings') {
        vi.stubEnv(
          'ADMIN_AUTOMATION_KEYS_EXTRA',
          JSON.stringify([{ ...record('extra'), id: 'primary-fixture' }]),
        )
      } else {
        const variable =
          location === 'inside primary'
            ? 'ADMIN_AUTOMATION_KEYS'
            : 'ADMIN_AUTOMATION_KEYS_EXTRA'
        const duplicate = record(
          location === 'inside primary' ? 'primary' : 'extra',
        )
        vi.stubEnv(variable, JSON.stringify([duplicate, duplicate]))
      }
      await expectUnavailable()
    },
  )

  it.each([undefined, []])(
    'denies a schema-valid key without a site scope',
    async (sites) => {
      vi.stubEnv(
        'ADMIN_AUTOMATION_KEYS',
        JSON.stringify([{ ...record('primary'), sites }]),
      )
      const response = await withSiteAutomation(
        request(),
        'editor',
        'example',
        vi.fn(),
      )
      expect(response.status).toBe(403)
      expectSecretSafe(await response.json())
    },
  )
})
