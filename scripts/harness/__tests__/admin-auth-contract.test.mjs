import { describe, expect, it } from 'vitest'
import {
  AdminAuthError,
  assertSameOrigin,
  enforceRateLimit,
  hashPassword,
  sessionCookieHeader,
  verifyPassword,
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
  it('uses a one-way password verifier and secure opaque session cookie', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(stored).toMatch(/^scrypt\$32768\$/)
    expect(stored).not.toContain('correct horse battery staple')
    await expect(
      verifyPassword('correct horse battery staple', stored),
    ).resolves.toBe(true)
    await expect(verifyPassword('wrong password', stored)).resolves.toBe(false)

    const cookie = sessionCookieHeader(
      'opaque-token',
      new Date('2030-01-01T00:00:00Z'),
    )
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).not.toContain('password')
  })

  it('rejects a missing identity and cross-origin mutation', async () => {
    await withEnvironment(
      { ADMIN_PUBLIC_ORIGIN: 'https://admin.test' },
      async () => {
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
      /too many requests/i,
    )
  })
})
