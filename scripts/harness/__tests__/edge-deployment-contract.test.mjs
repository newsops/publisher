import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('edge deployment contract', () => {
  it('documents local cache policy and remote smoke inputs', () => {
    const headers = fs.readFileSync(
      path.join(root, 'apps/site/public/_headers'),
      'utf8',
    )
    const smoke = fs.readFileSync(
      path.join(root, 'scripts/harness/edge-smoke.mjs'),
      'utf8',
    )
    expect(headers).toContain('immutable')
    expect(headers).toContain('max-age=0, must-revalidate')
    expect(headers).not.toContain('stale-if-error')
    expect(smoke).toContain('PUBLIC_SMOKE_URL')
    expect(smoke).toContain('ADMIN_SMOKE_URL')
    expect(smoke).toContain('ORIGIN_SMOKE_URL')
    expect(smoke).toContain('ADMIN_RATE_LIMIT_SMOKE_URL')
    expect(smoke).toContain('CONTACT_RATE_LIMIT_SMOKE_URL')
    expect(fs.existsSync(path.join(root, 'apps/admin/wrangler.jsonc'))).toBe(
      false,
    )
    expect(fs.existsSync(path.join(root, 'scripts/deploy/preflight.mjs'))).toBe(
      true,
    )
    expect(
      fs.existsSync(path.join(root, 'scripts/deploy/publication-worker.ts')),
    ).toBe(true)
  })
})
