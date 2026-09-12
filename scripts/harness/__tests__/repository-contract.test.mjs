import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('foundation contract', () => {
  it('uses static export for the public site', () => {
    const config = fs.readFileSync(
      path.join(root, 'apps/site/next.config.ts'),
      'utf8',
    )
    expect(config).toContain("output = 'export'")
  })

  it('keeps content types in the content package', () => {
    expect(
      fs.existsSync(path.join(root, 'packages/content/src/types.ts')),
    ).toBe(true)
  })

  it('exposes source workspaces to ESM and tsx CommonJS consumers', () => {
    for (const workspace of ['content', 'persistence', 'publication']) {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(root, 'packages', workspace, 'package.json'),
          'utf8',
        ),
      )
      expect(manifest.exports['.'].import).toBe('./src/index.ts')
      expect(manifest.exports['.'].require).toBe('./src/index.ts')
    }
  })

  it('rebuilds the static fixture before output-dependent contract tests', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    )
    expect(manifest.scripts.test).toMatch(
      /pnpm -r test && pnpm build && pnpm harness:test/,
    )
  })
})
