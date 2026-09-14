import { describe, expect, it } from 'vitest'

import { PublisherApiError, createPublisherAdminClient } from './client.js'

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Publisher Admin API client', () => {
  it('uses the documented automation routes and caller idempotency key', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = createPublisherAdminClient({
      origin: 'https://admin.example.test/',
      token: 'secret-token-sentinel',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return response(200, { ok: true })
      },
    })

    await client.listSites()
    await client.createSite({
      siteId: 'another-site',
      name: 'Another Site',
      canonicalOrigin: 'https://another.example.test',
    })
    await client.bootstrapSite('another-site')
    await client.getAgentGuidance('another-site')
    await client.updateAgentGuidance('another-site', 'Require an image.', 2)
    await client.getOperation('default', 'operation/1')
    await client.publish('default', 'replay-key')
    await client.uploadMedia('default', {
      fileName: 'pixel.png',
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      body: new Uint8Array([1]),
    })
    await client.approveMedia('default', 'media-1')
    await client.restoreContent(
      'default',
      { archive: {}, expectedRevision: 1, media: {} },
      'restore-key',
    )

    expect(calls.map((call) => call.url)).toEqual([
      'https://admin.example.test/api/v2/sites',
      'https://admin.example.test/api/v2/sites',
      'https://admin.example.test/api/v2/sites/another-site/bootstrap',
      'https://admin.example.test/api/v2/sites/another-site/agent-guidance',
      'https://admin.example.test/api/v2/sites/another-site/agent-guidance',
      'https://admin.example.test/api/v2/sites/default/operations/operation%2F1',
      'https://admin.example.test/api/v2/sites/default/publish',
      'https://admin.example.test/api/v2/sites/default/media',
      'https://admin.example.test/api/v2/sites/default/media',
      'https://admin.example.test/api/v2/sites/default/content-restore',
    ])
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe(
      'Bearer secret-token-sentinel',
    )
    expect(new Headers(calls[4].init?.headers).get('idempotency-key')).toBe(
      null,
    )
    expect(new Headers(calls[4].init?.headers).get('if-match')).toBe('"2"')
    expect(new Headers(calls[6].init?.headers).get('idempotency-key')).toBe(
      'replay-key',
    )
    expect(new Headers(calls[9].init?.headers).get('idempotency-key')).toBe(
      'restore-key',
    )
  })

  it('normalizes failures without serializing credentials or remote payloads', async () => {
    const client = createPublisherAdminClient({
      origin: 'https://admin.example.test',
      token: 'secret-token-sentinel',
      fetch: async () => response(403, { token: 'secret-token-sentinel' }),
    })

    await expect(client.listSites()).rejects.toMatchObject({
      code: 'REMOTE_ERROR',
      status: 403,
    })
    expect(
      JSON.stringify(new PublisherApiError('REMOTE_ERROR', 403)),
    ).not.toContain('secret-token-sentinel')
  })
})
