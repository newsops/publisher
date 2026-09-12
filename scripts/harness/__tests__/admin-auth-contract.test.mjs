import { describe, expect, it } from 'vitest'
import {
  AdminAuthError,
  assertSameOrigin,
  enforceRateLimit,
  requireIdentity,
} from '../../../apps/admin/app/lib/auth.ts'

async function withEnvironment(values, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('admin authentication contract', () => {
  it('accepts a timing-safe development identity and assigns publisher role', async () => {
    const identity = await withEnvironment(
      {
        NODE_ENV: 'test',
        ADMIN_DEV_TOKEN: 'test-token',
        ADMIN_PUBLISHERS: 'publisher@example.com',
      },
      () =>
        requireIdentity(
          new Request('http://admin.test/api/posts', {
            headers: {
              'x-admin-dev-token': 'test-token',
              'x-admin-dev-email': 'publisher@example.com',
            },
          }),
          'publisher',
        ),
    )

    expect(identity.email).toBe('publisher@example.com')
    expect(identity.roles).toEqual(['editor', 'publisher'])
  })

  it('rejects a missing identity and cross-origin mutation', async () => {
    await withEnvironment(
      { NODE_ENV: 'test', ADMIN_DEV_TOKEN: 'expected-token' },
      async () => {
        await expect(
          requireIdentity(new Request('http://admin.test/api/posts')),
        ).rejects.toMatchObject({ status: 401 })

        expect(() =>
          assertSameOrigin(
            new Request('http://admin.test/api/publish', {
              headers: { origin: 'https://attacker.test' },
            }),
          ),
        ).toThrow(AdminAuthError)
      },
    )
  })

  it('limits repeated mutations per identity and route', async () => {
    const identity = {
      email: 'rate-limit-test@example.com',
      subject: 'rate-limit-test',
      roles: ['editor'],
    }
    const request = new Request(
      `http://admin.test/api/publish?case=${Date.now()}`,
    )

    for (let index = 0; index < 60; index += 1)
      expect(() => enforceRateLimit(request, identity)).not.toThrow()
    expect(() => enforceRateLimit(request, identity)).toThrowError(
      /rate limit/i,
    )
  })
})
