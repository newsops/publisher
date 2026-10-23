import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const runner = path.join(root, 'scripts/harness/run-package-tests.mjs')

describe('real package test entry points', () => {
  it('fails unknown package selection instead of succeeding without tests', () => {
    const result = spawnSync(process.execPath, [runner, '@publisher/unknown'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Unknown test package')
  })

  it('executes actual content assertions through the package runner', () => {
    const result = spawnSync(process.execPath, [runner, '@publisher/content'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toMatch(/Tests\s+[1-9]\d* passed/)
    expect(result.stdout).toContain('content-contract.test.mjs')
  }, 35_000)

  it('wires every formerly empty package command to its owned behavior suites', () => {
    for (const directory of [
      'apps/admin',
      'apps/comments',
      'apps/site',
      'packages/content',
      'packages/publication',
      'packages/persistence',
      'packages/ops-cli',
      'packages/operator',
    ]) {
      const metadata = JSON.parse(
        readFileSync(path.join(root, directory, 'package.json'), 'utf8'),
      )
      expect(metadata.scripts.test).toContain('run-package-tests.mjs')
      expect(metadata.scripts.test).toContain(metadata.name)
      expect(metadata.scripts.test).not.toContain('passWithNoTests')
    }
    const metadata = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    )
    expect(metadata.scripts.test.indexOf('pnpm build')).toBeLessThan(
      metadata.scripts.test.indexOf('pnpm -r test'),
    )
  })
})
