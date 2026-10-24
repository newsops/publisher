#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const argument = process.argv.indexOf('--root')
if (
  argument >= 0 &&
  (!process.argv[argument + 1] || process.argv[argument + 1].startsWith('--'))
) {
  console.error('[adapter-contract] --root requires a directory')
  process.exit(2)
}
const root =
  argument >= 0
    ? path.resolve(process.argv[argument + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const scopes = [
  'apps/admin/app',
  'apps/site/app',
  'packages/content/src',
  'packages/publication/src',
  'packages/persistence/src',
  'packages/admin-client/src',
  'packages/ops-cli/bin',
  'docs/adapters.md',
  'docs/admin-api.md',
  'docs/admin-api.openapi.yaml',
  'docs/agent-operations.md',
  'scripts/harness/surface-map.json',
]
const failures = []
let checked = 0
function inspect(relative) {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isDirectory()) {
    for (const entry of fs.readdirSync(target))
      inspect(path.join(relative, entry))
    return
  }
  if (
    !/\.(?:ts|tsx|js|mjs|json|css|md|yaml)$/.test(relative) ||
    /\.test\./.test(relative)
  )
    return
  checked += 1
  const lines = fs.readFileSync(target, 'utf8').split('\n')
  lines.forEach((line, index) => {
    // Desk Plugin is the agent distribution; its platform paths/verbs remain.
    const domain = line
      .replaceAll('Desk Plugin', '')
      .replaceAll('packages/claude-plugin', '')
      .replaceAll('scan-plugin-contract.mjs', '')
      .replace(/\/plugin (?:marketplace add|install) [^`\s]+/g, '')
    if (/plugin/i.test(domain))
      failures.push(`${relative}:${index + 1}: removed domain terminology`)
  })
}
for (const scope of scopes) inspect(scope)
if (failures.length) {
  for (const failure of failures) console.error(`[adapter-contract] ${failure}`)
  process.exit(1)
}
console.log(
  `[adapter-contract] ${checked} domain files use Adapter; Desk Plugin is distinct`,
)
