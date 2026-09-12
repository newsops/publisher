#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const siteRoot = path.join(root, 'apps/site')
const sourceFiles = []

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(target)
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(target)
  }
}

collect(siteRoot)
const forbidden =
  /firebase-admin|mongodb|mongoose|server action|use server|process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)/i
const violations = sourceFiles.flatMap((file) => {
  const content = fs.readFileSync(file, 'utf8')
  return forbidden.test(content) ? [path.relative(root, file)] : []
})

const config = fs.readFileSync(path.join(siteRoot, 'next.config.ts'), 'utf8')
if (
  !config.includes("output = 'export'") &&
  !config.includes("output: 'export'")
)
  violations.push('apps/site/next.config.ts: missing output export')
if (violations.length > 0) {
  console.error(`[static-boundary] violations: ${violations.join(', ')}`)
  process.exit(1)
}

console.log(
  '[static-boundary] public site has static-export configuration and no forbidden runtime boundary',
)
