#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const required = [
  'apps/site/next.config.ts',
  'apps/site/app/page.tsx',
  'apps/site/app/[year]/[month]/[slug]/page.tsx',
  'apps/site/app/search/label/[label]/page.tsx',
  'apps/admin/app/page.tsx',
  'packages/content/src/types.ts',
  '.agents/spec-docs/active/WEB-001-static-public-site-and-admin.md',
]

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length > 0) {
  console.error(`[repository-contract] missing: ${missing.join(', ')}`)
  process.exit(1)
}

const snapshot = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/content/src/data/posts.json'),
    'utf8',
  ),
)
const posts = Array.isArray(snapshot.posts) ? snapshot.posts : []
if (
  posts.length !== 8 ||
  !posts.every((post) => post.slug.startsWith('sample-report-'))
) {
  console.error(
    '[repository-contract] expected exactly eight generic sample posts',
  )
  process.exit(1)
}

const trackedMedia = fs.existsSync(
  path.join(root, 'apps/site/public/media/posts'),
)
if (trackedMedia) {
  console.error(
    '[repository-contract] historical public media directory remains',
  )
  process.exit(1)
}

console.log(
  '[repository-contract] required foundation files and generic public starter snapshot found',
)
