#!/usr/bin/env node
// ARCH-001: every import must point downward in the layer map.
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
const resolveExtensions = ['.ts', '.tsx', '.mts', '.mjs', '.js']

function moduleClass(specifier) {
  for (const [name, patterns] of Object.entries(map.modules))
    if (patterns.some((pattern) => globToRegExp(pattern).test(specifier)))
      return name
  return undefined
}

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(root, path.dirname(fromFile), specifier)
  const candidates = [
    base,
    ...resolveExtensions.map((extension) => `${base}${extension}`),
    ...resolveExtensions.map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ]
  const hit = candidates.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  )
  return hit ? path.relative(root, hit).split(path.sep).join('/') : undefined
}

/** Classifies a specifier as { kind, layer?, index?, module? }. */
function classify(fromFile, specifier) {
  if (specifier.startsWith('node:')) return { kind: 'builtin' }
  for (const [alias, directory] of Object.entries(map.aliases)) {
    if (specifier === alias)
      return {
        kind: 'layer',
        layer: layerOf(`${directory}/index.ts`, map),
        index: true,
      }
    if (specifier.startsWith(`${alias}/`)) {
      const target = resolveRelative(
        'package.json',
        `./${directory}/${specifier.slice(alias.length + 1)}`,
      )
      return {
        kind: 'layer',
        layer: layerOf(target ?? directory, map),
        index: false,
      }
    }
  }
  if (specifier.startsWith('.')) {
    const target = resolveRelative(fromFile, specifier)
    if (!target) return { kind: 'unresolved' }
    return {
      kind: 'layer',
      layer: layerOf(target, map),
      index: /\/src\/index\.[a-z]+$/.test(target),
      target,
    }
  }
  const module = moduleClass(specifier)
  return module ? { kind: 'module', module } : { kind: 'unknown' }
}

function allowed(layerId, target, typeOnly, specifier) {
  const allow = map.layers[layerId].allow
  if (target.kind === 'builtin')
    return allow.includes('builtin') || allow.includes(specifier)
  if (target.kind === 'module') return allow.includes(target.module)
  if (target.kind === 'unknown') return allow.includes(specifier)
  if (target.kind === 'unresolved') return true
  if (!target.layer) return true
  if (allow.includes(target.layer)) return true
  if (typeOnly && allow.includes(`types:${target.layer}`)) return true
  if (target.index && allow.includes(`index:${target.layer}`)) return true
  return false
}

const violations = []
for (const file of listSourceFiles()) {
  if (matchesAny(file, map.exempt)) continue
  const layerId = layerOf(file, map)
  if (!layerId) continue
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  for (const { specifier, typeOnly } of importsOf(source)) {
    const target = classify(file, specifier)
    if (
      file.startsWith('packages/') &&
      target.kind === 'layer' &&
      target.target?.startsWith('apps/')
    ) {
      violations.push({
        key: `${file} -> ${specifier}`,
        detail: 'packages never import applications',
      })
      continue
    }
    if (allowed(layerId, target, typeOnly, specifier)) continue
    const targetName =
      target.kind === 'layer'
        ? `${target.layer}${target.index ? '' : ' (not via index)'}`
        : target.kind === 'module'
          ? `${target.module} module`
          : target.kind
    violations.push({
      key: `${file} -> ${specifier}`,
      detail: `${layerId} may not import ${targetName}${typeOnly ? ' (type-only)' : ''}`,
    })
  }
}

reportAgainstBaseline('layer-imports', violations, 'layer-imports')
