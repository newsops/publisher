#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const file = path.join(
  root,
  '.agents/spec-docs/active/WEB-001-static-public-site-and-admin.md',
)
const spec = fs.readFileSync(file, 'utf8')
const criteria = [...spec.matchAll(/^- \[[ x]\] (TC-\d+):/gm)].map(
  (match) => match[1],
)
const planned = [...spec.matchAll(/^\| (TC-\d+) \|/gm)].map((match) => match[1])
const missing = criteria.filter((id) => !planned.includes(id))
if (criteria.length === 0 || missing.length > 0) {
  console.error(
    `[spec-contract] missing test-plan rows: ${missing.join(', ') || 'no criteria'}`,
  )
  process.exit(1)
}

console.log(
  `[spec-contract] ${criteria.length} completion criteria have matching test-plan rows`,
)
