import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const admin = path.join(root, 'apps/admin')
const loader = path.join(
  admin,
  'node_modules/next/dist/build/next-config-ts/transpile-config.js',
)

describe('admin framework workspace boundary', () => {
  it('uses one verified local development builder bound to loopback', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(admin, 'package.json'), 'utf8'),
    )
    expect(manifest.scripts.dev).toBe('next dev --webpack --hostname 127.0.0.1')
  })
  for (const cwd of [root, admin]) {
    it(`resolves the same source root when launched from ${path.relative(root, cwd) || 'root'}`, () => {
      const source = `
        const {transpileConfig} = require(${JSON.stringify(loader)});
        (async () => {
          const {default: config} = await transpileConfig({
            nextConfigPath: ${JSON.stringify(path.join(admin, 'next.config.ts'))},
            dir: ${JSON.stringify(admin)}
          });
          console.log(JSON.stringify({tracing:config.outputFileTracingRoot, bundling:config.turbopack?.root}));
        })().catch(error => { console.error(error.message); process.exit(1); });
      `
      const result = spawnSync(process.execPath, ['-e', source], {
        cwd,
        encoding: 'utf8',
        timeout: 15000,
      })
      expect(result.status, result.stderr).toBe(0)
      const value = JSON.parse(result.stdout.trim().split('\n').at(-1))
      expect(value).toEqual({ tracing: root, bundling: root })
    })
  }
})
