#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const scans = [
  'scan-repository-contract.mjs',
  'scan-static-boundary.mjs',
  'scan-static-output.mjs',
  'scan-admin-contract.mjs',
  'scan-portable-runtime.mjs',
  'scan-spec-contract.mjs',
  'scan-layer-imports.mjs',
  'scan-env-access.mjs',
  'scan-route-shape.mjs',
  'scan-surface-parity.mjs',
  'scan-plugin-contract.mjs',
  'scan-repository-privacy.mjs',
]
const failures = []

for (const scan of scans) {
  const result = spawnSync('node', [path.join(here, scan)], {
    stdio: 'inherit',
  })
  if (result.status !== 0) failures.push(scan)
}

if (failures.length > 0) {
  console.error(
    `[harness] ${failures.length}/${scans.length} scans failed: ${failures.join(', ')}`,
  )
  process.exit(1)
}

console.log(`[harness] ${scans.length} scans passed`)
