#!/usr/bin/env node
// ARCH-001: a route file is auth → parse → service → response. Browser routes
// resolve the site through the shared helper; automation routes use the
// site-scoped wrapper; neither imports adapters, SDKs, or other routes.
import fs from 'node:fs'
import path from 'node:path'
import {
  globToRegExp,
  importsOf,
  layerOf,
  listSourceFiles,
  loadLayerMap,
  matchesAny,
  reportAgainstBaseline,
  root,
} from './layer-common.mjs'

const map = loadLayerMap()
const { automation, browser, forbiddenImports } = map.routes
const violations = []

function moduleClass(specifier) {
  for (const [name, patterns] of Object.entries(map.modules))
    if (patterns.some((pattern) => globToRegExp(pattern).test(specifier)))
      return name
  return undefined
}

for (const file of listSourceFiles()) {
  if (matchesAny(file, map.exempt)) continue
  const isAutomation = matchesAny(file, automation.globs)
  const isBrowser = !isAutomation && matchesAny(file, browser.globs)
  if (!isAutomation && !isBrowser) continue
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const rules = isAutomation ? automation : browser
  if (
    !matchesAny(file, rules.requiredExempt ?? []) &&
    !rules.requiredAny.some((token) => source.includes(token))
  )
    violations.push({
      key: `${file} -> missing ${rules.requiredAny[0].replace('(', '')}`,
      detail: `${isAutomation ? 'automation' : 'browser'} routes authenticate through ${rules.requiredAny.join(' | ')}`,
    })
  if (
    isBrowser &&
    !matchesAny(file, browser.siteResolutionExempt) &&
    !browser.siteResolutionAny.some((token) => source.includes(token))
  )
    violations.push({
      key: `${file} -> missing site resolution`,
      detail: `browser routes resolve the site through ${browser.siteResolutionAny.join(' | ')}`,
    })
  for (const { specifier, typeOnly } of importsOf(source)) {
    if (typeOnly) continue
    const module = moduleClass(specifier)
    const target = specifier.startsWith('.')
      ? layerOf(
          path
            .relative(root, path.resolve(root, path.dirname(file), specifier))
            .split(path.sep)
            .join('/') + '.ts',
          map,
        )
      : specifier.startsWith('@publisher/')
        ? layerOf(
            `${map.aliases[specifier.split('/').slice(0, 2).join('/')]}/index.ts`,
            map,
          )
        : undefined
    const hit =
      (module && forbiddenImports.includes(module)) ||
      (target && forbiddenImports.includes(target)) ||
      (forbiddenImports.includes('route.ts') &&
        /\/route(\.ts)?$/.test(specifier))
    if (hit)
      violations.push({
        key: `${file} -> ${specifier}`,
        detail: 'route files import services and http helpers only',
      })
  }
}

reportAgainstBaseline('route-shape', violations, 'route-shape')
