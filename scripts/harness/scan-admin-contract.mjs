#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const required = [
  'apps/admin/app/lib/http/auth.ts',
  'apps/admin/app/lib/repository.ts',
  'apps/admin/app/api/posts/route.ts',
  'apps/admin/app/api/posts/[id]/route.ts',
  'apps/admin/app/api/publish/route.ts',
  'apps/admin/app/robots.ts',
]
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length > 0) {
  console.error(`[admin-contract] missing: ${missing.join(', ')}`)
  process.exit(1)
}
const robots = fs.readFileSync(
  path.join(root, 'apps/admin/app/robots.ts'),
  'utf8',
)
// Identity policy lives in http/auth.ts; its session SQL in the account store.
const auth =
  fs.readFileSync(path.join(root, 'apps/admin/app/lib/http/auth.ts'), 'utf8') +
  fs.readFileSync(
    path.join(root, 'apps/admin/app/lib/adapters/account-store.ts'),
    'utf8',
  )
const adminPackage = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/admin/package.json'), 'utf8'),
)
const adminConfig = fs.readFileSync(
  path.join(root, 'apps/admin/next.config.ts'),
  'utf8',
)
const publicOutput = path.join(root, 'apps/site/out')
if (!robots.includes('disallow:')) {
  console.error('[admin-contract] robots must disallow indexing')
  process.exit(1)
}
if (!adminPackage.dependencies?.sharp) {
  console.error('[admin-contract] admin runtime must declare sharp explicitly')
  process.exit(1)
}
for (const packageName of [
  '@img/sharp-linux-x64',
  '@img/sharp-libvips-linux-x64',
]) {
  if (!adminPackage.dependencies?.[packageName]) {
    console.error(`[admin-contract] admin runtime must declare ${packageName}`)
    process.exit(1)
  }
}
for (const marker of [
  'outputFileTracingRoot',
  'sharp-linux-x64',
  'sharp-libvips-linux-x64',
]) {
  if (!adminConfig.includes(marker)) {
    console.error(`[admin-contract] native sharp trace is missing ${marker}`)
    process.exit(1)
  }
}
for (const marker of [
  'account_sessions',
  'hashPassword',
  'bootstrapOwner',
  'SameSite=Strict',
]) {
  if (!auth.includes(marker)) {
    console.error(`[admin-contract] auth contract missing ${marker}`)
    process.exit(1)
  }
}
if (
  fs.existsSync(path.join(publicOutput, 'admin')) ||
  fs.existsSync(path.join(publicOutput, 'api'))
) {
  console.error('[admin-contract] public output contains an admin or API route')
  process.exit(1)
}
console.log(
  '[admin-contract] separate local-account auth, publish, noindex, and public-boundary contracts found',
)
