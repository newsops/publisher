#!/usr/bin/env node
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
  type RequestListener,
} from 'node:http'
import {
  buildIncrementalRelease,
  createPublicationRecipes,
  createScaleFixture,
  getTheme,
  type ArtifactStore,
  type ReleaseManifest,
} from '../../packages/publication/src/index'
import {
  createAdapterInstallation,
  projectPublicAdapterSnapshot,
} from '../../packages/content/src/index'

class MemoryStore implements ArtifactStore {
  readonly objects = new Map<string, Uint8Array>()
  async has(key: string) {
    return this.objects.has(key)
  }
  async put(key: string, body: Uint8Array) {
    this.objects.set(key, body)
  }
  async get(key: string) {
    const body = this.objects.get(key)
    if (!body) throw new Error('Missing fixture artifact')
    return body
  }
}

const records: {
  kind: string
  method: string
  path: string
  origin?: string
  referrer?: string
}[] = []
const servers: Server[] = []
const origin = (port: number) => `http://127.0.0.1:${port}`
function record(kind: string, request: IncomingMessage) {
  records.push({
    kind,
    method: request.method ?? 'GET',
    path: request.url ?? '/',
    origin: request.headers.origin,
    referrer: request.headers.referer,
  })
  if (records.length > 500) records.shift()
}

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

async function listen(port: number, handler: RequestListener) {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  servers.push(server)
}

function policyHeaders(
  policy: string,
  pathname: string,
): Record<string, string> {
  const headers: Record<string, string> = {}
  let selected = false
  for (const line of policy.split('\n')) {
    if (line.startsWith('/')) {
      const pattern = new RegExp(
        `^${line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`,
      )
      selected = pattern.test(pathname)
    } else if (selected) {
      const match = /^  ([A-Za-z-]+): (.+)$/.exec(line)
      if (match) headers[match[1]!] = match[2]!
    }
  }
  return headers
}

function fixtureAdapters(): ReturnType<typeof projectPublicAdapterSnapshot> {
  return projectPublicAdapterSnapshot(
    [
      {
        ...createAdapterInstallation('default', 'google.analytics', {
          measurementId: 'G-FIXTURE01',
          consent: 'granted',
        }),
        state: 'enabled',
      },
    ],
    'default',
  )
}

async function buildSite(
  port: number,
): Promise<{ store: MemoryStore; manifest: ReleaseManifest }> {
  const articles = createScaleFixture(3)
  const store = new MemoryStore()
  const graph = createPublicationRecipes({
    siteId: 'default',
    origin: origin(port),
    publicationName: 'Example News',
    language: 'en',
    semanticVersion: 'semantic-v3',
    runtimeVersion: 'runtime-v1',
    baselineVersion: 'baseline-v3',
    articles,
    recent: {
      generatedAt: '2026-09-11T00:00:00.000Z',
      slugs: articles.map((a) => a.slug),
    },
    theme: getTheme('editorial'),
    adapters: fixtureAdapters(),
    commentRuntime: {
      origin: origin(4311),
      siteId: 'default',
      submissionEnabled: true,
      humanVerification: {
        siteKey: 'public-fixture-key',
        scriptUrl: `${origin(4312)}/widget.js`,
        globalName: 'fixtureVerification',
        frameOrigins: [origin(4313)],
        connectOrigins: [origin(4314)],
      },
    },
  })
  const built = await buildIncrementalRelease({
    siteId: 'default',
    releaseId: 'fixture',
    ...graph,
    store,
    generatedAt: '2026-09-11T00:00:00.000Z',
  })
  return { store, manifest: built.manifest }
}

async function serveArtifact(
  request: IncomingMessage,
  response: ServerResponse,
  store: MemoryStore,
  manifest: ReleaseManifest,
  policy: string,
) {
  const pathname = new URL(request.url ?? '/', origin(4310)).pathname
  if (pathname === '/__observations') return json(response, { records })
  const entry = manifest.entries.find((item) => item.path === pathname)
  if (!entry) return json(response, { error: 'Not found' }, 404)
  const releasePolicy = manifest.entries.find(
    (item) => item.path === '/.well-known/publisher/release-policy.json',
  )
  if (!releasePolicy) throw new Error('Fixture release policy missing')
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(await store.get(releasePolicy.objectKey)),
  )
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('cache' in parsed) ||
    !parsed.cache ||
    typeof parsed.cache !== 'object'
  )
    throw new Error('Fixture cache policy missing')
  const cacheKey =
    entry.cacheClass === 'immutable'
      ? 'immutable'
      : entry.cacheClass === 'html'
        ? 'html'
        : 'runtime'
  const cache: unknown = Reflect.get(parsed.cache, cacheKey)
  if (typeof cache !== 'string') throw new Error('Fixture cache policy invalid')
  response.writeHead(200, {
    'Cache-Control': cache,
    ...policyHeaders(policy, pathname),
    'Content-Type': entry.contentType,
  })
  response.end(await store.get(entry.objectKey))
}

await listen(4311, async (request, response) => {
  response.setHeader(
    'Access-Control-Allow-Origin',
    request.headers.origin ?? origin(4310),
  )
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }
  record('comments', request)
  if (request.method === 'POST') {
    let body = ''
    for await (const chunk of request) {
      body += String(chunk)
      if (body.length > 8192) return json(response, { error: 'Too large' }, 413)
    }
    const parsed: unknown = JSON.parse(body)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('verificationToken' in parsed) ||
      parsed.verificationToken !== 'fixture-token'
    )
      return json(response, { error: 'Verification required' }, 400)
    return json(response, { status: 'pending' }, 202)
  }
  json(response, {
    comments: [
      { authorName: 'Example Reader', body: 'Approved fixture comment.' },
    ],
  })
})

await listen(4312, (request, response) => {
  record('verification-script', request)
  response.writeHead(200, { 'Content-Type': 'text/javascript' })
  response.end(
    `window.fixtureVerification={render:(host,options)=>{const frame=document.createElement('iframe');frame.title='Fixture verification';frame.src='${origin(4313)}/challenge';host.append(frame);fetch('${origin(4314)}/verify').then(()=>options.callback('fixture-token'));return 'fixture'},reset:()=>{}};`,
  )
})
await listen(4313, (request, response) => {
  record('verification-frame', request)
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end(
    '<!doctype html><title>Fixture verification</title><p>Verification fixture ready.</p>',
  )
})
await listen(4314, (request, response) => {
  record('verification-connect', request)
  response.setHeader(
    'Access-Control-Allow-Origin',
    request.headers.origin ?? origin(4310),
  )
  json(response, { success: true })
})
for (const port of [4310, 4316]) {
  const { store, manifest } = await buildSite(port)
  const entry = manifest.entries.find((item) => item.path === '/_headers')
  if (!entry) throw new Error('Fixture headers missing')
  const policy = new TextDecoder().decode(await store.get(entry.objectKey))
  await listen(port, (request, response) => {
    void serveArtifact(request, response, store, manifest, policy).catch(() =>
      json(response, { error: 'Fixture failure' }, 500),
    )
  })
}
process.stdout.write(
  'Continuity fixture ready: desktop http://127.0.0.1:4310/ ; fresh mobile http://127.0.0.1:4316/ ; article /2026/09/article-0001.html ; observations /__observations\n',
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const server of servers) server.close()
  })
