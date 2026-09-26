import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `scripts/check-secrets.sh` is the last gate before a push. It used to run
 * `rg` inside an `if`, so on a machine without ripgrep the condition was
 * simply false and the script reported success without reading a single file
 * (`.agents/rules/fail-loud.md`: a check that cannot establish its contract
 * fails loudly).
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const script = path.join(root, 'scripts/check-secrets.sh')
let sandbox

/** Runs the real script in `directory`, with `PATH` as given. */
function run(directory, PATH) {
  const result = spawnSync('sh', [script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, PATH },
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const withTools = process.env.PATH
/** A PATH that still resolves `sh` but holds no search tool at all. */
let withoutTools

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-secrets-'))
  fs.writeFileSync(path.join(sandbox, 'readme.md'), 'nothing secret here\n')
  const bin = path.join(sandbox, 'bin')
  fs.mkdirSync(bin)
  for (const tool of ['sh', 'cut', 'sort']) {
    const source = ['/bin', '/usr/bin']
      .map((directory) => path.join(directory, tool))
      .find((candidate) => fs.existsSync(candidate))
    if (source) fs.symlinkSync(source, path.join(bin, tool))
  }
  withoutTools = bin
})

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe('committed-secret scan', () => {
  it('passes on a clean tree', () => {
    const result = run(sandbox, withTools)
    expect(result.code, result.out).toBe(0)
    expect(result.out).toContain('no known committed-secret pattern found')
  })

  it('fails when a search tool is unavailable instead of reporting success', () => {
    const result = run(sandbox, withoutTools)
    expect(result.code, result.out).toBe(2)
    expect(result.out).toContain('refusing to pass without scanning')
    expect(result.out).not.toContain('no known committed-secret pattern found')
  })

  // Assembled at run time so this file itself never carries a literal the
  // scan would flag when it reads the repository.
  const header = (algorithm) =>
    `-----BEGIN ${algorithm}PRIVATE KEY-----\nbody\n`
  it.each([
    ['an AWS access key id', `const key = "${'AKIA'}IOSFODNN7EXAMPLE"\n`],
    ['a GitHub token', `token=${'ghp'}_0123456789abcdefghijklmnopqrstuvwx\n`],
    ['an OpenSSH private key', header('OPENSSH ')],
    ['an RSA private key', header('RSA ')],
    ['an EC private key', header('EC ')],
    ['an unqualified private key', header('')],
  ])('fails on %s', (_label, body) => {
    const file = path.join(sandbox, 'leaked.txt')
    fs.writeFileSync(file, body)
    try {
      const result = run(sandbox, withTools)
      expect(result.code, result.out).toBe(1)
      expect(result.out).toContain('possible secret found')
      expect(result.out).toContain('leaked.txt')
      // The matching credential itself must never reach the output.
      expect(result.out).not.toContain(body.trim().split('\n')[0])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('reports the whole repository as clean', () => {
    const result = run(root, withTools)
    expect(result.code, result.out).toBe(0)
  })
})
