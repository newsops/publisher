#!/usr/bin/env node
// ARCH-001: `process.env` is read only at composition roots.
import fs from 'node:fs'
import path from 'node:path'
import {
  layerOf,
  listSourceFiles,
  loadLayerMap,
  matchesAny,
  reportAgainstBaseline,
  root,
} from './layer-common.mjs'

const map = loadLayerMap()
const violations = []
for (const file of listSourceFiles()) {
  if (matchesAny(file, map.exempt)) continue
  if (!layerOf(file, map)) continue
  if (matchesAny(file, map.compositionRoots)) continue
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const names = new Set()
  for (const match of source.matchAll(
    /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[)/g,
  ))
    names.add(match[1] ?? '[dynamic]')
  for (const name of [...names].sort()) {
    if (
      (map.envAllowedNames ?? []).some((pattern) =>
        new RegExp(`^${pattern.replace('*', '.*')}$`).test(name),
      )
    )
      continue
    violations.push({
      key: `${file} -> process.env.${name}`,
      detail: 'read configuration at a composition root and pass it in',
    })
  }
}

reportAgainstBaseline('env-access', violations, 'env-access')
