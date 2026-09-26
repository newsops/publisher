import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

describe('admin client package boundary', () => {
  it('keeps the reusable client independent of runtimes, providers, and process configuration', async () => {
    const source = await readFile(
      resolve(root, 'packages/admin-client/src/client.js'),
      'utf8',
    )

    expect(source).not.toMatch(
      /process\.env|postgres|@aws-sdk|cloudflare|vercel|window\.|document\./i,
    )
    expect(source).toContain("'/api/v2/sites'")
  })

  it('documents the admin app as the API mutation authority', async () => {
    const structure = await readFile(
      resolve(root, '.agents/project-structure.md'),
      'utf8',
    )
    expect(structure).toContain('`apps/admin` owns API-route authentication')
    expect(structure).toContain('`packages/admin-client` is a caller')
  })
})
