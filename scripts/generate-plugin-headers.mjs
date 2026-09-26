#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const headerPath = path.join(root, 'apps/site/out/_headers')
const turnstileRuntimePath = path.join(
  root,
  'apps/site/out/site-runtime/turnstile.v1.js',
)
const snapshotPath = path.join(root, 'packages/content/src/data/plugins.json')

const providerOrigins = {
  'platform.static-marker': {
    script: [],
    connect: [],
    isActive: () => true,
  },
  'google.analytics': {
    script: ['https://www.googletagmanager.com'],
    connect: ['https://www.google-analytics.com'],
    isActive: (configuration) => configuration?.consent === 'granted',
  },
}

async function publicSnapshot() {
  let parsed
  try {
    parsed = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  } catch {
    throw new Error('public plugin snapshot must be valid JSON')
  }
  if (
    !parsed ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.installations)
  )
    throw new Error('public plugin snapshot has an invalid shape')
  return parsed
}

function appendOrigins(csp, directive, origins) {
  if (origins.length === 0) return csp
  const expression = new RegExp('(' + directive + ' [^;]+)')
  const addition = origins.join(' ')
  if (!expression.test(csp))
    throw new Error('CSP has no ' + directive + ' directive')
  return csp.replace(expression, (_match, current) => current + ' ' + addition)
}

const snapshot = await publicSnapshot()
const scripts = new Set()
const connects = new Set()
const frames = new Set()
for (const installation of snapshot.installations) {
  const declared = providerOrigins[installation.pluginId]
  if (!declared)
    throw new Error(
      'Unknown plugin in public snapshot: ' + installation.pluginId,
    )
  if (!declared.isActive(installation.configuration)) continue
  for (const origin of declared.script) scripts.add(origin)
  for (const origin of declared.connect) connects.add(origin)
}
for (const origin of [...scripts, ...connects])
  if (origin === '*' || origin.includes('*'))
    throw new Error('Wildcard plugin provider origins are forbidden')

function exactHttpsOrigin(value, name) {
  if (!value) return undefined
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== value.replace(/\/$/, ''))
    throw new Error(`${name} must be an exact HTTPS origin`)
  return url.origin
}

const commentOrigin = exactHttpsOrigin(
  process.env.NEXT_PUBLIC_COMMENT_ORIGIN,
  'NEXT_PUBLIC_COMMENT_ORIGIN',
)
if (commentOrigin) connects.add(commentOrigin)
const verificationOrigin = exactHttpsOrigin(
  process.env.NEXT_PUBLIC_HUMAN_VERIFICATION_ORIGIN,
  'NEXT_PUBLIC_HUMAN_VERIFICATION_ORIGIN',
)
if (verificationOrigin) {
  scripts.add(verificationOrigin)
  connects.add(verificationOrigin)
  frames.add(verificationOrigin)
}
if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
  const turnstileOrigin = 'https://challenges.cloudflare.com'
  scripts.add(turnstileOrigin)
  connects.add(turnstileOrigin)
  frames.add(turnstileOrigin)
} else await fs.rm(turnstileRuntimePath, { force: true })
for (const origin of [...scripts, ...connects, ...frames])
  if (origin === '*' || origin.includes('*'))
    throw new Error('Wildcard runtime provider origins are forbidden')

const headers = await fs.readFile(headerPath, 'utf8')
const lines = headers.split('\n')
const index = lines.findIndex((line) =>
  line.startsWith('  Content-Security-Policy: '),
)
if (index < 0) throw new Error('Static header output has no CSP')
const prefix = '  Content-Security-Policy: '
let csp = lines[index].slice(prefix.length)
csp = appendOrigins(csp, 'script-src', [...scripts].sort())
csp = appendOrigins(csp, 'connect-src', [...connects].sort())
if (frames.size > 0) csp += `; frame-src 'self' ${[...frames].sort().join(' ')}`
lines[index] = prefix + csp
await fs.writeFile(headerPath, lines.join('\n'), 'utf8')
console.log(
  '[generate-plugin-headers] generated exact static CSP allow-list for ' +
    String(snapshot.installations.length) +
    ' enabled plugin(s)',
)
