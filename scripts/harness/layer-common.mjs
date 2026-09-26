// Shared helpers for the layer-boundary scans (ARCH-001): the layer map is
// the single source, the baseline is a ratchet that may only shrink.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
export const mapPath = path.join(root, 'scripts/harness/layer-map.json')
export const baselinePath = path.join(
  root,
  'scripts/harness/layer-baseline.json',
)

export const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js'])
const skipDirectories = new Set([
  'node_modules',
  '.next',
  'out',
  'dist',
  '.git',
  '.data',
])

export function loadLayerMap() {
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'))
}

/** Converts a glob (`**`, `*`, `{a,b}`) into an anchored RegExp. */
export function globToRegExp(glob) {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        const slashAfter = glob[index + 2] === '/'
        pattern += slashAfter ? '(?:.*/)?' : '.*'
        index += slashAfter ? 2 : 1
      } else pattern += '[^/]*'
    } else if (char === '{') {
      const end = glob.indexOf('}', index)
      pattern += `(?:${glob
        .slice(index + 1, end)
        .split(',')
        .map(escape)
        .join('|')})`
      index = end
    } else pattern += escape(char)
  }
  return new RegExp(`^${pattern}$`)
}

function escape(text) {
  return text.replace(/[.+^$()|[\]\\?]/g, '\\$&')
}

export function matchesAny(relative, globs) {
  return globs.some((glob) => globToRegExp(glob).test(relative))
}

/** Walks the repository and yields repository-relative POSIX paths. */
export function listSourceFiles(directory = root) {
  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (skipDirectories.has(entry.name)) continue
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (sourceExtensions.has(path.extname(entry.name)))
        files.push(path.relative(root, target).split(path.sep).join('/'))
    }
  }
  walk(directory)
  return files.sort()
}

/** First layer whose globs match, honouring `exclude` globs; else undefined. */
export function layerOf(relative, map) {
  for (const [id, layer] of Object.entries(map.layers)) {
    if (layer.exclude && matchesAny(relative, layer.exclude)) continue
    if (matchesAny(relative, layer.globs)) return id
  }
  return undefined
}

/**
 * Static, side-effect (`import 'x'`), and dynamic import specifiers with a
 * type-only flag. The static clause never spans a quote, so a side-effect
 * import cannot swallow the `from` of the import after it.
 */
export function importsOf(source) {
  const results = []
  const staticPattern =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(staticPattern)) {
    const [, , typeKeyword, clause, specifier] = match
    const names = clause
      .replace(/[{}]/g, ' ')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    const typeOnly =
      Boolean(typeKeyword) ||
      (names.length > 0 && names.every((name) => name.startsWith('type ')))
    results.push({ specifier, typeOnly })
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g))
    results.push({ specifier: match[1], typeOnly: false })
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    results.push({ specifier: match[1], typeOnly: false })
  for (const match of source.matchAll(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ))
    results.push({ specifier: match[1], typeOnly: false })
  return results
}

export function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return []
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
}

/**
 * Compares this rule's violations with the baseline. New violations fail;
 * baseline entries that no longer match are stale and fail too, so the file
 * only shrinks. `--write-baseline` replaces this rule's entries.
 */
export function reportAgainstBaseline(rule, violations, label) {
  const keys = new Set(violations.map((violation) => violation.key))
  if (process.argv.includes('--write-baseline')) {
    const others = loadBaseline().filter((entry) => entry.rule !== rule)
    const entries = [...keys]
      .sort()
      .map((key) => ({ rule, key }))
      .concat(others)
      .sort(
        (a, b) => a.rule.localeCompare(b.rule) || a.key.localeCompare(b.key),
      )
    fs.writeFileSync(baselinePath, `${JSON.stringify(entries, null, 2)}\n`)
    console.log(`[${label}] baseline written with ${keys.size} entries`)
    return
  }
  const baseline = new Set(
    loadBaseline()
      .filter((entry) => entry.rule === rule)
      .map((entry) => entry.key),
  )
  const fresh = violations.filter((violation) => !baseline.has(violation.key))
  const stale = [...baseline].filter((key) => !keys.has(key))
  if (fresh.length === 0 && stale.length === 0) {
    console.log(
      `[${label}] no new violations (${baseline.size} baseline entries remain)`,
    )
    return
  }
  for (const violation of fresh)
    console.error(
      `[${label}] ${violation.key}${violation.detail ? ` — ${violation.detail}` : ''}`,
    )
  for (const key of stale)
    console.error(
      `[${label}] stale baseline entry (remove it from layer-baseline.json): ${key}`,
    )
  console.error(
    `[${label}] ${fresh.length} new violation(s), ${stale.length} stale baseline entr(ies)`,
  )
  process.exit(1)
}
