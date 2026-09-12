import { createHash } from 'node:crypto'
import { manifestChecksum, type ReleaseManifest } from './release-manifest'
import type { ReadableArtifactStore } from './static-deployment'
import { BASELINE_CSP } from './static-policy'
import { extractLocalArtifactReferences } from './html-references'

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function text(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function safeLocalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('..')
  )
}

function verifyHtml(body: string, article: boolean): void {
  if (!/^<!doctype html>/i.test(body) || !body.includes('<h1'))
    throw new Error('Candidate HTML is missing its semantic document shell')
  if (article) {
    if (
      !body.includes('<article') ||
      !body.includes('rel="canonical"') ||
      !body.includes('property="og:description"') ||
      !body.includes('data-updated') ||
      !body.includes('type="application/ld+json"') ||
      !body.includes('NewsArticle')
    )
      throw new Error('Candidate article is missing required SEO semantics')
    const match =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)
    if (!match) throw new Error('Candidate article JSON-LD is missing')
    JSON.parse(match[1]!)
  }
}

function verifyLocalReferences(
  references: readonly string[],
  paths: ReadonlySet<string>,
): void {
  for (const local of references) {
    if (!safeLocalPath(local) || !paths.has(local))
      throw new Error(`Candidate references a missing local artifact: ${local}`)
  }
}

function verifyManifestIntegrity(
  manifest: ReleaseManifest,
  label: 'Candidate' | 'Previous release',
): void {
  const { sha256: expected, ...payload } = manifest
  if (manifestChecksum(payload) !== expected)
    throw new Error(`${label} manifest checksum mismatch`)
}

function mustReadEntry(
  path: string,
  entry: ReleaseManifest['entries'][number],
): boolean {
  return (
    path === '/.well-known/publisher/release-policy.json' ||
    path === '/.well-known/publisher/runtime.json' ||
    (path.startsWith('/data/comments/') &&
      entry.cacheClass === 'runtime-pointer')
  )
}

async function readVerifiedBodies(
  manifest: ReleaseManifest,
  store: ReadableArtifactStore,
  previous: ReleaseManifest | undefined,
  paths: ReadonlySet<string>,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const bodies = new Map<string, Uint8Array>()
  const previousEntries = new Map(
    (previous?.entries ?? []).map((entry) => [entry.path, entry]),
  )
  for (const entry of manifest.entries) {
    if (!Array.isArray(entry.localReferences))
      throw new Error(`Candidate reference metadata is missing: ${entry.path}`)
    verifyLocalReferences(entry.localReferences, paths)
    const objectPrefix = `artifacts/sha256/${entry.sha256}`
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !entry.objectKey.startsWith(objectPrefix) ||
      !/^\.[A-Za-z0-9]+$/.test(entry.objectKey.slice(objectPrefix.length))
    )
      throw new Error(
        `Candidate object key is not content-addressed: ${entry.path}`,
      )
    const old = previousEntries.get(entry.path)
    const unchanged =
      old?.sha256 === entry.sha256 && old.objectKey === entry.objectKey
    if (unchanged && !mustReadEntry(entry.path, entry)) continue
    const body = await store.get(entry.objectKey)
    if (sha256(body) !== entry.sha256)
      throw new Error(`Candidate artifact checksum mismatch: ${entry.path}`)
    bodies.set(entry.path, body)
    if (entry.contentType.startsWith('application/json')) JSON.parse(text(body))
    if (entry.kind === 'article-html' || entry.kind === 'index-html') {
      const html = text(body)
      verifyHtml(html, entry.kind === 'article-html')
      if (
        JSON.stringify(extractLocalArtifactReferences(html)) !==
        JSON.stringify(entry.localReferences)
      )
        throw new Error(
          `Candidate reference metadata does not match HTML: ${entry.path}`,
        )
    }
  }
  return bodies
}

function verifyReleasePolicy(bodies: ReadonlyMap<string, Uint8Array>): void {
  const body = bodies.get('/.well-known/publisher/release-policy.json')
  if (!body) throw new Error('Candidate release policy is missing')
  const policy = JSON.parse(text(body)) as {
    schemaVersion?: number
    contentSecurityPolicy?: string
  }
  if (
    policy.schemaVersion !== 1 ||
    policy.contentSecurityPolicy !== BASELINE_CSP
  )
    throw new Error('Candidate release policy does not match the baseline CSP')
}

function verifyRuntimeManifest(
  bodies: ReadonlyMap<string, Uint8Array>,
  paths: ReadonlySet<string>,
): void {
  const body = bodies.get('/.well-known/publisher/runtime.json')
  if (!body) throw new Error('Candidate runtime manifest is missing')
  const runtime = JSON.parse(text(body)) as {
    schemaVersion?: number
    themeCss?: unknown
    recent?: unknown
    popular?: unknown
  }
  if (runtime.schemaVersion !== 1)
    throw new Error('Candidate runtime manifest schema is invalid')
  for (const value of [runtime.themeCss, runtime.recent, runtime.popular]) {
    if (value === undefined) continue
    if (!safeLocalPath(value) || !paths.has(value))
      throw new Error(
        'Candidate runtime manifest references a missing artifact',
      )
  }
}

function verifyCommentPointers(
  manifest: ReleaseManifest,
  bodies: ReadonlyMap<string, Uint8Array>,
  paths: ReadonlySet<string>,
): void {
  for (const entry of manifest.entries) {
    if (
      !entry.path.startsWith('/data/comments/') ||
      entry.cacheClass !== 'runtime-pointer'
    )
      continue
    const body = bodies.get(entry.path)
    if (!body) throw new Error('Candidate comment pointer is missing')
    const pointer = JSON.parse(text(body)) as {
      schemaVersion?: number
      projection?: unknown
    }
    if (
      pointer.schemaVersion !== 1 ||
      !safeLocalPath(pointer.projection) ||
      !pointer.projection.startsWith('/data/comments/') ||
      !paths.has(pointer.projection)
    )
      throw new Error('Candidate comment pointer is invalid')
  }
}

export async function verifyPublicationCandidate(
  manifest: ReleaseManifest,
  store: ReadableArtifactStore,
  previous?: ReleaseManifest,
): Promise<void> {
  verifyManifestIntegrity(manifest, 'Candidate')
  if (previous) {
    verifyManifestIntegrity(previous, 'Previous release')
    if (
      previous.siteId !== manifest.siteId ||
      manifest.parentReleaseId !== previous.releaseId
    )
      throw new Error('Candidate release lineage mismatch')
  }
  const paths = new Set(manifest.entries.map((entry) => entry.path))
  if (paths.size !== manifest.entries.length)
    throw new Error('Candidate manifest contains duplicate paths')
  const bodies = await readVerifiedBodies(manifest, store, previous, paths)
  verifyReleasePolicy(bodies)
  verifyRuntimeManifest(bodies, paths)
  verifyCommentPointers(manifest, bodies, paths)
  for (const required of ['/sitemap.xml', '/feed.xml'])
    if (!paths.has(required))
      throw new Error(`Candidate metadata artifact is missing: ${required}`)
}
