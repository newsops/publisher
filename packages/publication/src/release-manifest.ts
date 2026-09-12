import { createHash } from 'node:crypto'
import {
  manifestChecksum,
  type ArtifactEntry,
  type ArtifactKind,
  type ArtifactRecipe,
  type ArtifactStore,
  type BuildResult,
  type ReleaseManifest,
} from './release-contract'
import { extractLocalArtifactReferences } from './html-references'

export * from './release-contract'

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableRecord(values: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(values).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  )
}

function zeroKinds(): Record<ArtifactKind, number> {
  return {
    'article-html': 0,
    'index-html': 0,
    projection: 0,
    theme: 0,
    runtime: 0,
    metadata: 0,
    media: 0,
  }
}

function artifactExtension(recipe: ArtifactRecipe): string {
  if (recipe.kind === 'article-html' || recipe.kind === 'index-html')
    return '.html'
  if (recipe.contentType.startsWith('application/json')) return '.json'
  if (recipe.contentType.startsWith('text/css')) return '.css'
  if (recipe.contentType.startsWith('text/javascript')) return '.js'
  if (recipe.contentType.includes('xml')) return '.xml'
  const pathExtension = /\.[A-Za-z0-9]{1,8}$/.exec(recipe.path)?.[0]
  return pathExtension ?? '.bin'
}

function localReferences(body: Uint8Array, contentType: string): string[] {
  if (!contentType.startsWith('text/html')) return []
  return extractLocalArtifactReferences(new TextDecoder().decode(body))
}

function dependencyChecksum(
  recipe: ArtifactRecipe,
  dependencies: Readonly<Record<string, string>>,
): string {
  const declared = Object.fromEntries(
    [...new Set(recipe.dependencyKeys)].sort().map((key) => {
      if (!(key in dependencies))
        throw new Error(`Missing declared dependency: ${key}`)
      return [key, dependencies[key]]
    }),
  )
  return sha256(stableRecord(declared))
}

function reusableEntry(
  recipe: ArtifactRecipe,
  dependencySha256: string,
  previous?: ArtifactEntry,
): ArtifactEntry | undefined {
  if (
    previous?.kind === recipe.kind &&
    previous.contentType === recipe.contentType &&
    previous.cacheClass === recipe.cacheClass &&
    previous.dependencySha256 === dependencySha256
  )
    return previous
  return undefined
}

async function renderArtifact(
  recipe: ArtifactRecipe,
  dependencies: Readonly<Record<string, string>>,
): Promise<Uint8Array> {
  const accessed = new Set<string>()
  const body = await recipe.render((key) => {
    if (!recipe.dependencyKeys.includes(key))
      throw new Error(
        `Artifact ${recipe.path} read undeclared dependency: ${key}`,
      )
    if (!(key in dependencies)) throw new Error(`Missing dependency: ${key}`)
    accessed.add(key)
    return dependencies[key]
  })
  for (const key of recipe.dependencyKeys)
    if (!accessed.has(key))
      throw new Error(
        `Artifact ${recipe.path} declared but did not read: ${key}`,
      )
  return typeof body === 'string' ? new TextEncoder().encode(body) : body
}

async function createArtifactEntry({
  recipe,
  dependencies,
  dependencySha256,
  releaseId,
  store,
}: {
  readonly recipe: ArtifactRecipe
  readonly dependencies: Readonly<Record<string, string>>
  readonly dependencySha256: string
  readonly releaseId: string
  readonly store: ArtifactStore
}): Promise<{ readonly entry: ArtifactEntry; readonly uploaded: boolean }> {
  const bytes = await renderArtifact(recipe, dependencies)
  const contentSha256 = sha256(bytes)
  const objectKey = `artifacts/sha256/${contentSha256}${artifactExtension(recipe)}`
  const uploaded = !(await store.has(objectKey))
  if (uploaded)
    await store.put(objectKey, bytes, {
      sha256: contentSha256,
      contentType: recipe.contentType,
      cacheClass: recipe.cacheClass,
    })
  return {
    uploaded,
    entry: {
      path: recipe.path,
      kind: recipe.kind,
      sha256: contentSha256,
      dependencySha256,
      contentType: recipe.contentType,
      cacheClass: recipe.cacheClass,
      objectKey,
      sourceReleaseId: releaseId,
      localReferences: localReferences(bytes, recipe.contentType),
    },
  }
}

function assertUniqueRecipePaths(recipes: readonly ArtifactRecipe[]): void {
  const paths = recipes.map((recipe) => recipe.path)
  if (new Set(paths).size !== paths.length)
    throw new Error('Duplicate artifact path in release recipes')
}

function entryChanged(
  previous: ArtifactEntry | undefined,
  next: ArtifactEntry,
): boolean {
  return (
    !previous ||
    previous.kind !== next.kind ||
    previous.sha256 !== next.sha256 ||
    previous.dependencySha256 !== next.dependencySha256 ||
    previous.contentType !== next.contentType ||
    previous.cacheClass !== next.cacheClass ||
    previous.objectKey !== next.objectKey ||
    previous.sourceReleaseId !== next.sourceReleaseId ||
    JSON.stringify(previous.localReferences) !==
      JSON.stringify(next.localReferences)
  )
}

async function buildEntries(
  recipes: readonly ArtifactRecipe[],
  dependencies: Readonly<Record<string, string>>,
  previous: ReadonlyMap<string, ArtifactEntry>,
  releaseId: string,
  store: ArtifactStore,
) {
  const entries: ArtifactEntry[] = []
  const renderedByKind = zeroKinds()
  const uploadedByKind = zeroKinds()
  let rendered = 0
  let uploaded = 0
  let reused = 0
  for (const recipe of [...recipes].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (!recipe.path.startsWith('/'))
      throw new Error(`Artifact path must be absolute: ${recipe.path}`)
    const dependencySha256 = dependencyChecksum(recipe, dependencies)
    const old = reusableEntry(
      recipe,
      dependencySha256,
      previous.get(recipe.path),
    )
    if (old) {
      entries.push(old)
      reused += 1
      continue
    }
    const built = await createArtifactEntry({
      recipe,
      dependencies,
      dependencySha256,
      releaseId,
      store,
    })
    rendered += 1
    renderedByKind[recipe.kind] += 1
    if (built.uploaded) {
      uploaded += 1
      uploadedByKind[recipe.kind] += 1
    }
    entries.push(built.entry)
  }
  return { entries, rendered, uploaded, reused, renderedByKind, uploadedByKind }
}

function finalizeBuild(
  siteId: string,
  releaseId: string,
  generatedAt: string,
  current: ReleaseManifest | undefined,
  previous: ReadonlyMap<string, ArtifactEntry>,
  built: Awaited<ReturnType<typeof buildEntries>>,
): BuildResult {
  const nextWithoutChecksum: Omit<ReleaseManifest, 'sha256'> = {
    schemaVersion: 1,
    siteId,
    releaseId,
    parentReleaseId: current?.releaseId,
    generatedAt,
    entries: built.entries,
  }
  const manifest = {
    ...nextWithoutChecksum,
    sha256: manifestChecksum(nextWithoutChecksum),
  }
  const nextPaths = new Set(built.entries.map((entry) => entry.path))
  const removed = [...previous.keys()].filter(
    (path) => !nextPaths.has(path),
  ).length
  const changed =
    removed > 0 ||
    built.entries.length !== (current?.entries.length ?? 0) ||
    built.entries.some((entry) => entryChanged(previous.get(entry.path), entry))
  return {
    manifest,
    changed,
    metrics: {
      rendered: built.rendered,
      uploaded: built.uploaded,
      reused: built.reused,
      removed,
      renderedByKind: built.renderedByKind,
      uploadedByKind: built.uploadedByKind,
    },
  }
}

export async function buildIncrementalRelease({
  siteId,
  releaseId,
  dependencies,
  recipes,
  store,
  current,
  generatedAt = new Date().toISOString(),
}: {
  readonly siteId: string
  readonly releaseId: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly recipes: readonly ArtifactRecipe[]
  readonly store: ArtifactStore
  readonly current?: ReleaseManifest
  readonly generatedAt?: string
}): Promise<BuildResult> {
  if (current && current.siteId !== siteId)
    throw new Error('Current release belongs to a different site')
  if (current?.releaseId === releaseId)
    throw new Error('A release cannot use itself as its parent')
  const previous = new Map(
    (current?.entries ?? []).map((entry) => [entry.path, entry]),
  )
  assertUniqueRecipePaths(recipes)
  const built = await buildEntries(
    recipes,
    dependencies,
    previous,
    releaseId,
    store,
  )
  return finalizeBuild(siteId, releaseId, generatedAt, current, previous, built)
}
