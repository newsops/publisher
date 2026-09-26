#!/usr/bin/env node
// PLUG-001: the Claude plugin is a consumer of the CLI surface, not a fourth
// surface. This scan keeps it honest: the manifests parse and point at real
// paths, the committed bundle and usage table equal a fresh build, every
// `publisher …` mention in plugin content names a real, bundled command, and
// no credential leaves the SessionStart hook. Any `--token` text is a
// violation, including prose that documents the prohibition. `--root <dir>`
// evaluates a copied tree (tests) while the build itself always runs from
// this workspace.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { root as repositoryRoot } from './layer-common.mjs'

const rootIndex = process.argv.indexOf('--root')
const rootArgument = rootIndex >= 0 ? process.argv[rootIndex + 1] : undefined
if (rootIndex >= 0 && (!rootArgument || rootArgument.startsWith('--'))) {
  console.error('[plugin-contract] --root requires a directory')
  process.exit(2)
}
const root = rootArgument ? path.resolve(rootArgument) : repositoryRoot
const pluginRelative = 'packages/claude-plugin'
const pluginRoot = path.join(root, pluginRelative)
const hookRelative = 'scripts/session-env.sh'
const skipDirectories = new Set(['node_modules'])
const failures = []
const fail = (message) => failures.push(message)

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
  } catch (error) {
    fail(`${relative}: ${error.message}`)
    return undefined
  }
}

/** Files under `directory`, recursively, skipping `skipDirectories`. */
function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (!entry.isDirectory()) return [full]
    return skipDirectories.has(entry.name) ? [] : walk(full)
  })
}

/** Expands `a|b` alternatives in a word list into every concrete word list. */
function expandAlternatives(words) {
  const alternatives = words.map((word) => word.split('|'))
  const expanded = []
  const expand = (index, prefix) =>
    index === alternatives.length
      ? expanded.push(prefix)
      : alternatives[index].forEach((word) =>
          expand(index + 1, [...prefix, word]),
        )
  expand(0, [])
  return expanded
}

// 1. Manifests.
const marketplace = readJson('.claude-plugin/marketplace.json')
const manifest = readJson(`${pluginRelative}/.claude-plugin/plugin.json`)
if (marketplace) {
  for (const key of ['name', 'owner', 'plugins'])
    if (!(key in marketplace)) fail(`marketplace.json: missing ${key}`)
  for (const plugin of marketplace.plugins ?? []) {
    if (!plugin.name || !plugin.source)
      fail('marketplace.json: every plugin needs name and source')
    if (typeof plugin.source === 'string' && plugin.source.startsWith('./')) {
      const target = path.join(
        root,
        plugin.source,
        '.claude-plugin/plugin.json',
      )
      if (!fs.existsSync(target))
        fail(`marketplace source missing: ${plugin.source}`)
    }
  }
}
if (manifest) {
  if (manifest.name !== 'publisher')
    fail('plugin.json: name must be "publisher"')
  for (const key of ['admin_origin', 'api_token'])
    if (!manifest.userConfig?.[key])
      fail(`plugin.json: userConfig.${key} missing`)
  if (manifest.userConfig?.api_token?.sensitive !== true)
    fail('plugin.json: userConfig.api_token must be sensitive')
}

// 2. Bundle and usage-table freshness. Always the workspace build script: a
// copied tree has no ops-cli to bundle from.
const build = await import(
  pathToFileURL(path.join(repositoryRoot, pluginRelative, 'scripts/build.mjs'))
)
let commands = []
try {
  const expected = await build.expected(pluginRoot)
  commands = expected.commands
  const readPlugin = (relative) =>
    fs.readFileSync(path.join(pluginRoot, relative), 'utf8')
  if (readPlugin('bin/publisher') !== expected.source)
    fail('stale bundle: run pnpm --filter @publisher/claude-plugin build')
  if (readPlugin('skills/publisher-cli/SKILL.md') !== expected.skill)
    fail('stale usage table: run pnpm --filter @publisher/claude-plugin build')
} catch (error) {
  fail(`build failed: ${error.message}`)
}

// 3. Command references in commands, skills, and agents.
const known = commands.flatMap((usage) =>
  expandAlternatives(build.commandWords(usage)),
)
const startsWith = (candidate, prefix) =>
  prefix.every((word, index) => candidate[index] === word)

const contentFiles = ['commands', 'skills', 'agents']
  .flatMap((directory) => walk(path.join(pluginRoot, directory)))
  .filter((file) => file.endsWith('.md'))
for (const file of contentFiles) {
  const relative = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(/`publisher((?:\s+[a-z][a-z|-]*)+)/g)) {
    for (const mention of expandAlternatives(match[1].trim().split(/\s+/))) {
      let taken = []
      for (const word of mention) {
        const next = [...taken, word]
        if (!known.some((candidate) => startsWith(candidate, next))) break
        taken = next
      }
      const exact = known.some(
        (candidate) =>
          candidate.length === taken.length && startsWith(candidate, taken),
      )
      if (
        taken.length > 0 &&
        build.NOT_BUNDLED.some((prefix) => startsWith(taken, prefix))
      )
        fail(`${relative}: not bundled: publisher ${taken.join(' ')}`)
      else if (!exact)
        fail(
          `${relative}: unknown command: publisher ${mention.slice(0, taken.length + 1).join(' ')}`,
        )
    }
  }
  if (/--token\b/.test(text) || /PUBLISHER_API_TOKEN\s*=\s*\S/.test(text))
    fail(`${relative}: credential in arguments`)
}

// 4. The token option is referenced only by the hook script.
for (const file of walk(pluginRoot)) {
  const relative = path.relative(pluginRoot, file)
  if (relative === hookRelative || relative.startsWith('test/')) continue
  if (fs.readFileSync(file, 'utf8').includes('CLAUDE_PLUGIN_OPTION_API_TOKEN'))
    fail(
      `${pluginRelative}/${relative}: token reference outside ${hookRelative}`,
    )
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[plugin-contract] ${failure}`)
  process.exit(1)
}
console.log(
  `[plugin-contract] manifests valid, bundle current, ${contentFiles.length} content files reference only bundled commands`,
)
