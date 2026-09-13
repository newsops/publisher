import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

describe('native image runtime tracing', () => {
  it('traces sharp and its Linux binary payload for every image-processing route', async () => {
    const config = await readFile(
      resolve(root, 'apps/admin/next.config.ts'),
      'utf8',
    )

    expect(config).toContain("'/api/v2/sites/[siteId]/media'")
    expect(config).toContain("'/api/v2/sites/[siteId]/content-restore'")
    expect(config).toContain('node_modules/sharp/**/*')
    expect(config).toContain('node_modules/@img/sharp-linux-x64/**/*')
    expect(config).toContain('node_modules/@img/sharp-libvips-linux-x64/**/*')
  })
})
