#!/usr/bin/env node

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const outputRoot = path.join(repositoryRoot, 'apps/site/out')
const port = Number(process.env.PORT ?? 3000)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8'],
])

async function isFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname)
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined
  const relative = decoded.replace(/^\/+/, '')
  const candidates = decoded.endsWith('/')
    ? [path.join(relative, 'index.html')]
    : path.extname(relative)
      ? [relative]
      : [path.join(relative, 'index.html'), `${relative}.html`]
  for (const candidate of candidates) {
    const resolved = path.resolve(outputRoot, candidate)
    if (
      resolved.startsWith(`${outputRoot}${path.sep}`) &&
      (await isFile(resolved))
    )
      return resolved
  }
  return undefined
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://preview.local')
      .pathname
    const file = await resolveFile(pathname)
    const selected = file ?? path.join(outputRoot, '404.html')
    const body = await readFile(selected)
    response.writeHead(file ? 200 : 404, {
      'Content-Type':
        contentTypes.get(path.extname(selected).toLowerCase()) ??
        'application/octet-stream',
      'Content-Length': body.byteLength,
    })
    if (request.method === 'HEAD') response.end()
    else response.end(body)
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(error instanceof Error ? error.message : 'Preview failure')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[static-preview] http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)))
