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

    await client.getStatus()
    await client.getOperation('operation/1')
    await client.publish('replay-key')

    expect(calls.map((call) => call.url)).toEqual([
      'https://admin.example.test/api/v1/posts?limit=1',
      'https://admin.example.test/api/v1/operations/operation%2F1',
      'https://admin.example.test/api/v1/publish',
    ])
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe(
      'Bearer secret-token-sentinel',
    )
    expect(new Headers(calls[2].init?.headers).get('idempotency-key')).toBe(
      'replay-key',
    )
  })

  it('normalizes failures without serializing credentials or remote payloads', async () => {
    const client = createPublisherAdminClient({
      origin: 'https://admin.example.test',
      token: 'secret-token-sentinel',
      fetch: async () => response(403, { token: 'secret-token-sentinel' }),
    })

    await expect(client.getStatus()).rejects.toMatchObject({
      code: 'REMOTE_ERROR',
      status: 403,
    })
    expect(
      JSON.stringify(new PublisherApiError('REMOTE_ERROR', 403)),
    ).not.toContain('secret-token-sentinel')
  })
})
