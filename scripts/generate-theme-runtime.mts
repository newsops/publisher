#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isThemeId } from '../packages/content/src/index'
import { getTheme } from '../packages/publication/src/index'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(root, 'apps/site/public')
const publication = JSON.parse(
  await fs.readFile(
    path.join(root, 'packages/content/src/data/publication.json'),
    'utf8',
  ),
) as { themeId?: string }
if (!publication.themeId || !isThemeId(publication.themeId))
  throw new Error(`Unknown theme: ${publication.themeId ?? ''}`)
// The registry entry is the complete, self-hosted stylesheet for the theme.
const selected = getTheme(publication.themeId)
const checksum = createHash('sha256').update(selected.css).digest('hex')
const themePath = `/theme-runtime/immutable/${selected.id}.${checksum}.css`
const releaseId = (
  process.env.PUBLIC_RELEASE_ID ??
  process.env.CONTENT_SNAPSHOT_ID ??
  'local'
).replace(/[^A-Za-z0-9._-]/g, '-')
const runtime = {
  schemaVersion: 1,
  theme: { id: selected.id, version: selected.version, css: themePath },
  projections: { recent: `/data/immutable/recent.${releaseId}.json` },
}
const bootstrap = `(()=>{const safePath=(value,prefix)=>typeof value==='string'&&value.startsWith(prefix)&&!value.includes('..');const renderList=(target,items)=>{if(!Array.isArray(items))return;const list=document.createElement('ol');list.className='rail-list';for(const item of items.slice(0,5)){if(!item||!safePath(item.path,'/'))continue;const row=document.createElement('li');const anchor=document.createElement('a');anchor.href=item.path;anchor.textContent=String(item.title||'');row.append(anchor);list.append(row)}if(list.childNodes.length){target.replaceChildren(list)}};fetch('/.well-known/publisher/runtime.json',{cache:'no-cache',headers:{Accept:'application/json'}}).then((response)=>response.ok?response.json():Promise.reject(new Error('runtime manifest unavailable'))).then((manifest)=>{const recent=manifest?.projections?.recent;if(safePath(recent,'/data/immutable/recent.'))fetch(recent,{cache:'force-cache'}).then((response)=>response.ok?response.json():Promise.reject()).then((payload)=>{for(const target of document.querySelectorAll('[data-runtime-projection="recent"]'))renderList(target,payload.items)}).catch(()=>{})}).catch(()=>{})})();\n`

await fs.mkdir(path.join(publicRoot, 'theme-runtime/immutable'), {
  recursive: true,
})
await fs.mkdir(path.join(publicRoot, 'site-runtime'), { recursive: true })
await fs.mkdir(path.join(publicRoot, '.well-known/publisher'), {
  recursive: true,
})
await fs.writeFile(path.join(publicRoot, themePath), `${selected.css}\n`)
await fs.writeFile(
  path.join(publicRoot, 'theme-runtime/current.css'),
  `${selected.css}\n`,
)
await fs.writeFile(
  path.join(publicRoot, 'site-runtime/projection-bootstrap.v1.js'),
  bootstrap,
)
await fs.writeFile(
  path.join(publicRoot, '.well-known/publisher/runtime.json'),
  `${JSON.stringify(runtime, null, 2)}\n`,
)
console.log(
  `[generate-theme-runtime] ${selected.id}@${selected.version} -> ${themePath}`,
)
