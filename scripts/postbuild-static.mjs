#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'apps/site/out')

function walkHtml(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkHtml(target))
    else if (entry.name.endsWith('.html')) files.push(target)
  }
  return files
}

function removeFrameworkRuntime(html) {
  return html
    .replace(
      /<link\b[^>]*(?:rel=["'](?:modulepreload|preload)["'][^>]*as=["']script["']|as=["']script["'][^>]*rel=["'](?:modulepreload|preload)["'])[^>]*>/gi,
      '',
    )
    .replace(
      /<script\b[^>]*src=["'][^"']*\/_next\/static\/[^"']+["'][^>]*><\/script>/gi,
      '',
    )
    .replace(
      /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
      '',
    )
}

// Next requires a non-empty parameter set for an otherwise valid dynamic
// export. Remove the build-only sentinel when no non-default variants exist.
fs.rmSync(path.join(output, 'locale', 'und'), { recursive: true, force: true })

for (const year of fs.readdirSync(output, { withFileTypes: true })) {
  if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue
  for (const month of fs.readdirSync(path.join(output, year.name), {
    withFileTypes: true,
  })) {
    if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue
    const monthPath = path.join(output, year.name, month.name)
    for (const slug of fs.readdirSync(monthPath, { withFileTypes: true })) {
      if (!slug.isDirectory()) continue
      const index = path.join(monthPath, slug.name, 'index.html')
      if (!fs.existsSync(index)) continue
      fs.renameSync(index, path.join(monthPath, `${slug.name}.html`))
      fs.rmSync(path.join(monthPath, slug.name), {
        recursive: true,
        force: true,
      })
    }
  }
}

for (const filename of ['about.html', 'contact-us.html']) {
  const directory = path.join(output, filename)
  const index = path.join(directory, 'index.html')
  if (fs.existsSync(index)) {
    const temporary = path.join(output, `.${filename}.tmp`)
    fs.copyFileSync(index, temporary)
    fs.rmSync(directory, { recursive: true, force: true })
    fs.renameSync(temporary, path.join(output, filename))
  }
}

let stripped = 0
for (const file of walkHtml(output)) {
  const original = fs.readFileSync(file, 'utf8')
  const staticHtml = removeFrameworkRuntime(original)
  if (staticHtml !== original) {
    fs.writeFileSync(file, staticHtml, 'utf8')
    stripped += 1
  }
}

console.log(
  `[postbuild-static] normalized article paths and removed framework runtime from ${stripped} static HTML files`,
)
