import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const scan = path.join(root, 'scripts/harness/scan-plugin-contract.mjs')
const copies = []

/** Copies the plugin and marketplace into a temp tree the scan can mutate. */
async function copyPlugin() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'plugin-scan-'))
  copies.push(directory)
  for (const relative of ['packages/claude-plugin', '.claude-plugin'])
    await cp(path.join(root, relative), path.join(directory, relative), {
      recursive: true,
      filter: (source) => !source.includes('/node_modules'),
    })
  return directory
}

async function append(file, text) {
  await writeFile(file, `${await readFile(file, 'utf8')}${text}`, 'utf8')
}

function runScan(pluginRoot) {
  return spawnSync(process.execPath, [scan, '--root', pluginRoot], {
    cwd: root,
    encoding: 'utf8',
  })
}

describe('plugin contract scan (PLUG-001)', () => {
  afterAll(async () => {
    for (const directory of copies)
      await rm(directory, { recursive: true, force: true })
  })

  it('passes on the committed tree', () => {
    const result = runScan(root)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('[plugin-contract]')
  })

  it('fails on a stale bundle', async () => {
    const copy = await copyPlugin()
    await append(path.join(copy, 'packages/claude-plugin/bin/publisher'), '\n')
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('stale bundle')
  })

  it('fails on a stale usage table', async () => {
    const copy = await copyPlugin()
    const skill = path.join(
      copy,
      'packages/claude-plugin/skills/publisher-cli/SKILL.md',
    )
    const text = await readFile(skill, 'utf8')
    await writeFile(
      skill,
      text.replace('| `doctor` |', '| `doctors` |'),
      'utf8',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('stale usage table')
  })

  it('fails on a command the CLI does not have', async () => {
    const copy = await copyPlugin()
    await append(
      path.join(copy, 'packages/claude-plugin/commands/status.md'),
      '\nRun `publisher post frobnicate --site x --json`.\n',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'unknown command: publisher post frobnicate',
    )
  })

  it('fails on an unknown top-level verb', async () => {
    const copy = await copyPlugin()
    await append(
      path.join(copy, 'packages/claude-plugin/commands/status.md'),
      '\nRun `publisher frobnicate --site x`.\n',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('unknown command: publisher frobnicate')
  })

  it('fails on an unbundled command', async () => {
    const copy = await copyPlugin()
    await append(
      path.join(copy, 'packages/claude-plugin/commands/status.md'),
      '\nRun `publisher content inspect --archive x`.\n',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not bundled: publisher content inspect')
  })

  it('fails on credentials in arguments or token references outside the hook', async () => {
    const copy = await copyPlugin()
    await append(
      path.join(copy, 'packages/claude-plugin/skills/press-images/SKILL.md'),
      '\nUse `publisher doctor --token abc` and $CLAUDE_PLUGIN_OPTION_API_TOKEN.\n',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('credential in arguments')
    expect(result.stderr).toContain(
      'token reference outside scripts/session-env.sh',
    )
  })

  it('fails when the marketplace source does not exist', async () => {
    const copy = await copyPlugin()
    const manifest = path.join(copy, '.claude-plugin/marketplace.json')
    const parsed = JSON.parse(await readFile(manifest, 'utf8'))
    parsed.plugins[0].source = './packages/missing'
    await writeFile(manifest, JSON.stringify(parsed), 'utf8')
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('marketplace source missing')
  })

  it('fails when the token option is not sensitive', async () => {
    const copy = await copyPlugin()
    const manifest = path.join(
      copy,
      'packages/claude-plugin/.claude-plugin/plugin.json',
    )
    const parsed = JSON.parse(await readFile(manifest, 'utf8'))
    delete parsed.userConfig.api_token.sensitive
    await writeFile(manifest, JSON.stringify(parsed), 'utf8')
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('api_token must be sensitive')
  })
})
