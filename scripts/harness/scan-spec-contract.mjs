#!/usr/bin/env node
// Every gated spec has a test-plan row per completion criterion, and specs
// written under ARCH-001 tag each affected path with its layer (L0–L5).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const stages = ['draft', 'backlog', 'todo', 'active', 'done']
// Specs completed before the layer contract existed are not re-tagged;
// every other spec tags its affected paths with a layer id.
const untaggedSpecs = new Set([
  'ADMIN-001',
  'ADMIN-002',
  'CLI-005',
  'INFRA-005',
  'SECURITY-001',
  'API-001',
  'CLI-001',
  'CLI-002',
  'CLI-003',
  'CLI-004',
  'DATA-001',
  'DATA-002',
  'DATA-003',
  'EDIT-001',
  'INFRA-001',
  'INFRA-002',
  'INFRA-003',
  'INFRA-004',
  'INFRA-006',
  'PERF-001',
  'RULE-001',
  'WEB-001',
  'WEB-002',
  'WEB-003',
  'WEB-004',
  'WEB-005',
])
const files = stages.flatMap((stage) => {
  const directory = path.join(root, '.agents/spec-docs', stage)
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(directory, name))
})

const failures = []
let criteriaCount = 0
for (const file of files) {
  const relative = path.relative(root, file)
  const spec = fs.readFileSync(file, 'utf8')
  const criteria = [...spec.matchAll(/^- \[[ x]\] (TC-\d+):/gm)].map(
    (match) => match[1],
  )
  const planned = [...spec.matchAll(/^\| (TC-\d+) +\|/gm)].map(
    (match) => match[1],
  )
  const missing = criteria.filter((id) => !planned.includes(id))
  if (criteria.length === 0)
    failures.push(`${relative}: no TC-NN completion criteria`)
  if (missing.length > 0)
    failures.push(`${relative}: missing test-plan rows ${missing.join(', ')}`)
  criteriaCount += criteria.length
  const id = path.basename(file).split('-').slice(0, 2).join('-')
  if (!untaggedSpecs.has(id)) {
    const scope = spec.split('### Affected Scope')[1]?.split('\n### ')[0] ?? ''
    if (!/\bL[0-5]\b/.test(scope))
      failures.push(
        `${relative}: ### Affected Scope must tag paths with their layer (L0–L5), see scripts/harness/layer-map.json`,
      )
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[spec-contract] ${failure}`)
  process.exit(1)
}
console.log(
  `[spec-contract] ${criteriaCount} completion criteria across ${files.length} specs have matching test-plan rows; layer tags checked on ${files.length - [...untaggedSpecs].filter((id) => files.some((file) => path.basename(file).startsWith(id))).length} spec(s)`,
)
