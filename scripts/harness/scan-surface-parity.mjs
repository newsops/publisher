#!/usr/bin/env node
// ARCH-001: every capability is registered in surface-map.json, reachable
// from the admin page, the automation API, the client, and the CLI unless it
// is declared surface-exclusive, and every automation route is documented.
import fs from 'node:fs'
import path from 'node:path'
import { reportAgainstBaseline, root } from './layer-common.mjs'

const map = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/harness/surface-map.json'), 'utf8'),
)
const { sources, capabilities } = map
const violations = []
const violation = (key, detail) => violations.push({ key, detail })

function routeDirectories(relativeBase, skip) {
  const base = path.join(root, relativeBase)
  const found = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      const relative = path.relative(base, target).split(path.sep).join('/')
      if (entry.isDirectory()) {
        if (skip && relative === skip) continue
        walk(target)
      } else if (entry.name === 'route.ts')
        found.push(path.dirname(relative) === '.' ? '' : path.dirname(relative))
    }
  }
  walk(base)
  return found.filter(Boolean).sort()
}

const browserRoutes = routeDirectories(sources.browserRoutes, 'v2')
const automationRoutes = routeDirectories(sources.automationRoutes)
const clientMethods = [
  ...fs
    .readFileSync(path.join(root, sources.clientTypes), 'utf8')
    .matchAll(/^  ([a-zA-Z]+)\(/gm),
]
  .map((match) => match[1])
  .filter((name) => name !== 'toJSON' && name !== 'constructor')
const usage = fs.readFileSync(path.join(root, sources.cliUsage), 'utf8')
const usageStart = usage.indexOf('commands: [') + 'commands: ['.length
const usageEnd = usage.indexOf('\n      ],', usageStart)
const cliCommands = [
  ...usage.slice(usageStart, usageEnd).matchAll(/'([^']+)'/g),
].map((match) => {
  const tokens = []
  for (const token of match[1].split(' ')) {
    if (token.startsWith('--') || token.startsWith('<')) break
    tokens.push(token)
  }
  return tokens.join(' ')
})
const uiPanels = fs
  .readdirSync(path.join(root, sources.uiPanels))
  .filter(
    (name) =>
      /^[A-Z][A-Za-z]+\.tsx$/.test(name) && !(map.uiShell ?? []).includes(name),
  )
const openapiPaths = new Set(
  [
    ...fs
      .readFileSync(path.join(root, sources.openapi), 'utf8')
      .matchAll(/^  (\/api\/v2\/[^:\s]+):/gm),
  ].map((match) => match[1]),
)

const registered = {
  browser: new Set(),
  automation: new Set(),
  client: new Set(),
  cli: new Set(),
  ui: new Set(),
}
const surfaces = ['browser', 'automation', 'client', 'cli']
const inventory = {
  browser: browserRoutes,
  automation: automationRoutes,
  client: clientMethods,
  cli: cliCommands,
  ui: uiPanels,
}

for (const capability of capabilities) {
  if (!fs.existsSync(path.join(root, capability.service)))
    violation(`missing service: ${capability.id}`, capability.service)
  for (const surface of [...surfaces, 'ui']) {
    for (const item of capability[surface] ?? []) {
      registered[surface].add(item)
      if (!inventory[surface].includes(item))
        violation(
          `missing path: ${capability.id} ${surface} ${item}`,
          'declared in surface-map.json but absent from the tree',
        )
    }
  }
  for (const surface of surfaces) {
    const present = (capability[surface] ?? []).length > 0
    if (capability.exclusive) {
      // The automation channel is the v2 route plus its client and CLI
      // wrappers; `browser` and `cli` exclusives stand alone.
      const channel =
        capability.exclusive === 'automation'
          ? ['automation', 'client', 'cli']
          : [capability.exclusive]
      if (!channel.includes(surface) && present)
        violation(
          `exclusive capability exposed elsewhere: ${capability.id} ${surface}`,
          `declared exclusive to ${capability.exclusive}`,
        )
      if (surface === capability.exclusive && !present)
        violation(
          `missing surface: ${capability.id} ${surface}`,
          'the exclusive surface itself must exist',
        )
      if (!capability.reason)
        violation(`exclusive without reason: ${capability.id}`, 'state why')
    } else if (!present)
      violation(
        `missing surface: ${capability.id} ${surface}`,
        'a capability without `exclusive` must be reachable from every surface',
      )
  }
}

for (const surface of [...surfaces, 'ui'])
  for (const item of inventory[surface])
    if (!registered[surface].has(item))
      violation(
        `unregistered capability: ${surface} ${item}`,
        'add it to scripts/harness/surface-map.json',
      )

for (const directory of automationRoutes) {
  const apiPath = `/api/v2/${directory.replace(/\[([^\]]+)\]/g, '{$1}')}`
  if (!openapiPaths.has(apiPath))
    violation(
      `undocumented v2 route: ${directory}`,
      `${apiPath} is not in ${sources.openapi}`,
    )
}

reportAgainstBaseline('surface-parity', violations, 'surface-parity')
