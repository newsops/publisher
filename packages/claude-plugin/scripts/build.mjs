#!/usr/bin/env node
// PLUG-001: bundles the workspace CLI into bin/publisher and regenerates the
// command table in skills/publisher-cli/SKILL.md from the CLI's own usage
// output. `--check` rebuilds in memory and exits 1 when the committed files
// differ, so scan-plugin-contract.mjs can call it.
// The output depends on the pinned esbuild version; bumping esbuild requires a rebuild.
import * as esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const entry = path.resolve(packageRoot, '../ops-cli/bin/publisher.mjs')
const SKILL_RELATIVE = 'skills/publisher-cli/SKILL.md'
export const bundlePath = path.join(packageRoot, 'bin/publisher')
export const skillPath = path.join(packageRoot, SKILL_RELATIVE)
const START = '<!-- publisher-usage:start -->'
const END = '<!-- publisher-usage:end -->'

/** Commands stubbed out of the bundle (see content-stub.mjs). */
export const NOT_BUNDLED = [
  ['content', 'inspect'],
  ['content', 'restore'],
]

/** Leading command words of a usage string, e.g. ['taxonomy', 'categories|tags', 'list']. */
export function commandWords(usage) {
  const words = []
  for (const word of usage.split(' ')) {
    if (!/^[a-z][a-z|-]*$/.test(word)) break
    words.push(word)
  }
  return words
}

export function isBundled(usage) {
  const words = commandWords(usage)
  return !NOT_BUNDLED.some((prefix) =>
    prefix.every((word, index) => words[index] === word),
  )
}

export async function bundleSource() {
  const result = await esbuild.build({
    entryPoints: [entry],
    absWorkingDir: packageRoot,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: {
      'tsx/esm/api': path.join(packageRoot, 'scripts/tsx-stub.mjs'),
      '@publisher/content': path.join(packageRoot, 'scripts/content-stub.mjs'),
    },
    legalComments: 'none',
    logLevel: 'silent',
  })
  const text = result.outputFiles[0].text
  const foreign = [...text.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith('node:'))
  if (foreign.length)
    throw new Error(`bundle imports non-builtin modules: ${foreign.join(', ')}`)
  return text
}

/** Runs a bundle with `--json` and no command to read the USAGE envelope. */
export async function usageCommands(source) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-plugin-'))
  const file = path.join(directory, 'publisher.mjs')
  try {
    await writeFile(file, source, 'utf8')
    const result = spawnSync(process.execPath, [file, '--json'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    })
    if (result.error) throw result.error
    let body
    try {
      body = JSON.parse(result.stdout)
    } catch {
      throw new Error(
        `bundle did not print a JSON envelope (exit ${result.status}): ${result.stderr || result.stdout}`,
      )
    }
    if (body.code !== 'USAGE' || !Array.isArray(body.commands))
      throw new Error(`unexpected usage envelope: ${result.stdout}`)
    return body.commands
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export function renderUsageTable(commands) {
  const cell = (text) => text.replace(/\|/g, '\\|')
  const rows = commands.filter(isBundled).map((usage) => {
    const words = commandWords(usage)
    return `| \`${cell(words.join(' '))}\` | \`${cell(usage)}\` |`
  })
  return [
    START,
    '',
    '| Command | Usage |',
    '| --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n')
}

export function withUsageTable(skill, table) {
  const start = skill.indexOf(START)
  const end = skill.indexOf(END)
  if (start < 0 || end <= start)
    throw new Error('SKILL.md is missing usage markers')
  return `${skill.slice(0, start)}${table}${skill.slice(end + END.length)}`
}

/**
 * Fresh bundle, regenerated skill, and command list. `targetRoot` lets the
 * harness scan evaluate a copied plugin tree while the bundle entry and
 * esbuild still resolve from this workspace.
 */
export async function expected(targetRoot = packageRoot) {
  const source = await bundleSource()
  const commands = await usageCommands(source)
  const skill = withUsageTable(
    await readFile(path.join(targetRoot, SKILL_RELATIVE), 'utf8'),
    renderUsageTable(commands),
  )
  return { source, skill, commands }
}

async function main() {
  const check = process.argv.includes('--check')
  const { source, skill } = await expected()
  const stale = []
  const currentBundle = await readFile(bundlePath, 'utf8').catch(() => '')
  const currentSkill = await readFile(skillPath, 'utf8')
  if (currentBundle !== source) stale.push('stale bundle: bin/publisher')
  if (currentSkill !== skill)
    stale.push('stale usage table: skills/publisher-cli/SKILL.md')
  if (check) {
    for (const line of stale) console.error(`[plugin-build] ${line}`)
    process.exit(stale.length ? 1 : 0)
  }
  await mkdir(path.dirname(bundlePath), { recursive: true })
  await writeFile(bundlePath, source, 'utf8')
  await chmod(bundlePath, 0o755)
  await writeFile(skillPath, skill, 'utf8')
  console.log(
    `[plugin-build] bin/publisher ${Buffer.byteLength(source)} bytes; ${stale.length ? 'updated' : 'unchanged'}`,
  )
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    await main()
  } catch (error) {
    console.error(`[plugin-build] ${error.message}`)
    process.exit(1)
  }
}
