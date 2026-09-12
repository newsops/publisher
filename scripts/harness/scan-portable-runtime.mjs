#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const targets = [
  'apps/admin/app',
  'apps/admin/.env.example',
  'apps/comments/src',
  'apps/comments/.env.example',
  'apps/comments/.dev.vars.example',
  'apps/comments/package.json',
  'packages/content/src',
  'packages/persistence',
  'packages/publication',
  'scripts/deploy/preflight.mjs',
  'scripts/deploy/preflight-core.mjs',
  'scripts/deploy/publication-worker.ts',
  'scripts/deploy/publication-worker-core.ts',
]
const forbidden = [
  /\bD1\b/,
  /D1Database|CF_D1|d1[-_]/i,
  /\bR2\b|R2_|CONTENT_SNAPSHOT_R2/i,
  /TURNSTILE|turnstile/i,
  /CF_ACCESS|Cf-Access-Jwt-Assertion/i,
  /cf-connecting-ip/i,
  /pagesProject|PAGES_PROJECT/i,
  /\blegacy\b/i,
]
const extensions = new Set([
  '.cjs',
  '.js',
  '.json',
  '.jsonc',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
])
const violations = []

function inspect(file) {
  if (
    !extensions.has(path.extname(file)) &&
    !path.basename(file).startsWith('.env')
  )
    return
  const relative = path.relative(root, file)
  const content = fs.readFileSync(file, 'utf8')
  for (const expression of forbidden)
    if (expression.test(content)) violations.push(`${relative}: ${expression}`)
}

function visit(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return inspect(target)
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const child = path.join(target, entry.name)
    if (entry.isDirectory()) visit(child)
    else inspect(child)
  }
}

for (const target of targets) visit(path.join(root, target))
if (violations.length) {
  console.error(
    `[portable-runtime] forbidden compatibility path: ${violations.join(', ')}`,
  )
  process.exit(1)
}
console.log(
  '[portable-runtime] PostgreSQL, S3-compatible storage, OIDC, and generic verification are the only core runtime paths',
)
