import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')

describe('static plugin boundary contract', () => {
  it('keeps disabled plugin output inert and has no public runtime configuration path', async () => {
    const layout = await readFile(
      path.join(root, 'apps/site/app/layout.tsx'),
      'utf8',
    )
    const buildInput = await readFile(
      path.join(root, 'apps/site/app/lib/public-plugins.ts'),
      'utf8',
    )
    const publicOutput = await readFile(
      path.join(root, 'apps/site/out/index.html'),
      'utf8',
    )
    const headers = await readFile(
      path.join(root, 'apps/site/out/_headers'),
      'utf8',
    )

    expect(layout).toContain('buildPublicPluginSnapshot')
    expect(buildInput).not.toContain('fetch(')
    expect(buildInput).not.toContain('api/')
    expect(buildInput).not.toContain('database')
    expect(publicOutput).not.toContain('publisher-plugin-marker')
    expect(publicOutput).not.toContain('publisher-google-analytics-id')
    expect(publicOutput).not.toContain('www.googletagmanager.com')
    expect(publicOutput).not.toContain('www.google-analytics.com')
    const csp = headers
      .split('\n')
      .find((line) => line.startsWith('  Content-Security-Policy: '))
    expect(csp).toBeDefined()
    expect(csp).not.toMatch(/(?:script-src|connect-src)[^;]*\*/)
  })
})
