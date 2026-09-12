#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = path.join(root, 'apps/site/out')
const required = [
  'index.html',
  'about.html',
  'contact-us.html',
  'search/index.html',
  'sitemap.xml',
  'feed.xml',
  'feeds/posts/default.xml',
  'search-index.json',
  'llms.txt',
]
if (!fs.existsSync(output)) {
  console.error(
    '[static-output] apps/site/out is missing; run pnpm build first',
  )
  process.exit(1)
}
const missing = required.filter(
  (file) => !fs.existsSync(path.join(output, file)),
)
if (missing.length > 0) {
  console.error(
    `[static-output] missing generated files: ${missing.join(', ')}`,
  )
  process.exit(1)
}
if (!fs.existsSync(path.join(root, 'apps/site/public/_headers'))) {
  console.error('[static-output] public cache header contract is missing')
  process.exit(1)
}
const sitemap = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8')
const feed = fs.readFileSync(path.join(output, 'feed.xml'), 'utf8')
if (
  (sitemap.match(/<url>/g) ?? []).length !== 16 ||
  (feed.match(/<item>/g) ?? []).length !== 8
) {
  console.error(
    '[static-output] generated sitemap/feed counts do not match the generic starter snapshot',
  )
  process.exit(1)
}
console.log(
  '[static-output] required static routes, generic feeds, sitemap, llms.txt, and search index found',
)
