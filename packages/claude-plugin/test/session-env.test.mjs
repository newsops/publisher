import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/session-env.sh',
)

const dirs = []

async function envFile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-hook-'))
  dirs.push(directory)
  const file = path.join(directory, 'env')
  await writeFile(file, 'export OTHER=1\n', 'utf8')
  return file
}

function runHook(environment) {
  return spawnSync('sh', [script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...environment },
  })
}

afterEach(() =>
  Promise.all(
    dirs.map((directory) => rm(directory, { recursive: true, force: true })),
  ),
)

describe('session-env hook (PLUG-001)', () => {
  it('appends quoted exports that round-trip through sh', async () => {
    const file = await envFile()
    const token = `p w$1'x"y\\z`
    const result = runHook({
      CLAUDE_ENV_FILE: file,
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: token,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    const content = await readFile(file, 'utf8')
    expect(content.startsWith('export OTHER=1\n')).toBe(true)
    expect(content.match(/^export /gm)).toHaveLength(3)
    for (const shell of ['sh', 'bash', 'zsh']) {
      const probe = spawnSync('command', ['-v', shell], { shell: true })
      if (probe.status !== 0) continue
      const sourced = spawnSync(
        shell,
        [
          '-c',
          `. "${file}"; printf '%s\\n%s\\n' "$PUBLISHER_ADMIN_ORIGIN" "$PUBLISHER_API_TOKEN"`,
        ],
        { encoding: 'utf8', env: { PATH: process.env.PATH } },
      )
      expect(sourced.stdout).toBe(`https://admin.example\n${token}\n`)
    }
  })

  it('strips a trailing slash from the origin', async () => {
    const file = await envFile()
    const result = runHook({
      CLAUDE_ENV_FILE: file,
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example/',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 't',
    })
    expect(result.stderr).toBe('')
    expect(await readFile(file, 'utf8')).toContain(
      "export PUBLISHER_ADMIN_ORIGIN='https://admin.example'\n",
    )
  })

  it('writes nothing when either option is missing', async () => {
    for (const environment of [
      { CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example' },
      { CLAUDE_PLUGIN_OPTION_API_TOKEN: 't' },
      {},
    ]) {
      const file = await envFile()
      const result = runHook({ CLAUDE_ENV_FILE: file, ...environment })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('')
      expect(await readFile(file, 'utf8')).toBe('export OTHER=1\n')
    }
  })

  it('exits 0 without CLAUDE_ENV_FILE', () => {
    const result = runHook({
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 't',
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('refuses values with newlines', async () => {
    const file = await envFile()
    const result = runHook({
      CLAUDE_ENV_FILE: file,
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 'a\nb',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(await readFile(file, 'utf8')).toBe('export OTHER=1\n')
  })

  it('fails loudly but silently about values when the env file is read-only', async () => {
    if (process.getuid?.() === 0) return
    const file = await envFile()
    await chmod(file, 0o444)
    const token = 'zz-secret-zz'
    const result = runHook({
      CLAUDE_ENV_FILE: file,
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: token,
    })
    // bash exits 1 on a failed redirection under `set -e`; dash exits 2.
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain(token)
    expect(await readFile(file, 'utf8')).toBe('export OTHER=1\n')
  })
})
