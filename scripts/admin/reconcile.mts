import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgresContentRepository } from '../../apps/admin/app/lib/index'
import { seedCheckedInPostgresFixture } from '../../apps/admin/app/lib/index'
import { applyMigrations } from '../../packages/persistence/src/index'
import {
  objectStoreFromEnvironment,
  type ObjectStore,
} from '../../packages/persistence/src/index'
import {
  createPostgresPool,
  type PostgresPool,
} from '../../packages/persistence/src/index'
import {
  PostgresMediaRepository,
  validateImageUpload,
  type MediaVariant,
} from '../../packages/persistence/src/index'
import type { FixtureReconciliation } from '../../packages/persistence/src/index'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

export type { FixtureReconciliation } from '../../packages/persistence/src/index'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function mediaFiles(
  directory: string,
  relative = '',
): Promise<readonly string[]> {
  try {
    await stat(path.join(directory, relative))
  } catch {
    return []
  }
  const entries = await readdir(path.join(directory, relative), {
    withFileTypes: true,
  })
  const files: string[] = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) files.push(...(await mediaFiles(directory, child)))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

function sameValues(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    [...actual].sort().join('\u0000') === [...expected].sort().join('\u0000')
  )
}

async function readFixtureIdentity() {
  const root = path.join(repositoryRoot, 'packages/content/src/data')
  const [postDocument, tags, authors, publication] = await Promise.all([
    readFile(path.join(root, 'posts.json'), 'utf8').then(
      (value) =>
        JSON.parse(value) as { posts: readonly { sourceId: string }[] },
    ),
    readFile(path.join(root, 'taxonomy.json'), 'utf8').then(
      (value) => JSON.parse(value) as readonly { slug: string }[],
    ),
    readFile(path.join(root, 'authors.json'), 'utf8').then(
      (value) => JSON.parse(value) as readonly { slug: string }[],
    ),
    readFile(path.join(root, 'publication.json'), 'utf8').then(
      (value) =>
        JSON.parse(value) as { canonicalOrigin: string; themeId: string },
    ),
  ])
  return { posts: postDocument.posts, tags, authors, publication }
}

function assertFixtureContent(
  actual: {
    readonly posts: readonly { sourceId: string }[]
    readonly tags: readonly { slug: string }[]
    readonly authors: readonly { slug: string }[]
    readonly settings: { canonicalOrigin: string; themeId: string }
  },
  fixture: Awaited<ReturnType<typeof readFixtureIdentity>>,
): void {
  if (
    !sameValues(
      actual.posts.map((post) => post.sourceId),
      fixture.posts.map((post) => post.sourceId),
    ) ||
    !sameValues(
      actual.tags.map((tag) => tag.slug),
      fixture.tags.map((tag) => tag.slug),
    ) ||
    !sameValues(
      actual.authors.map((author) => author.slug),
      fixture.authors.map((author) => author.slug),
    ) ||
    actual.settings.canonicalOrigin !== fixture.publication.canonicalOrigin ||
    actual.settings.themeId !== fixture.publication.themeId
  )
    throw new Error(
      'PostgreSQL site state does not match the checked-in fixture',
    )
}

async function reconcileMediaFile(
  objectStore: ObjectStore,
  repository: PostgresMediaRepository,
  siteId: string,
  mediaRoot: string,
  relativePath: string,
): Promise<FixtureReconciliation['media'][number]> {
  const body = await readFile(path.join(mediaRoot, relativePath))
  const sha256 = createHash('sha256').update(body).digest('hex')
  const fileName = path.basename(relativePath).replace(/[^A-Za-z0-9._-]/g, '-')
  const objectKey = `sites/${siteId}/fixture-media/${sha256}/${fileName}`
  const mimeType = /\.png$/i.test(fileName) ? 'image/png' : 'image/jpeg'
  if (!(await objectStore.head(objectKey)))
    await objectStore.put(objectKey, {
      body,
      contentType: mimeType,
      cacheControl: 'private, max-age=31536000, immutable',
      sha256,
      metadata: { site: siteId, source: 'checked-in-fixture' },
    })
  const stored = await objectStore.head(objectKey)
  if (!stored || stored.size !== body.byteLength || stored.sha256 !== sha256)
    throw new Error(`Fixture media reconciliation failed: ${relativePath}`)
  const validated = await validateImageUpload({
    siteId,
    fileName,
    declaredMimeType: mimeType,
    declaredSha256: sha256,
    body,
  })
  const record = await repository.createPending({
    ...validated.metadata,
    objectKey,
  })
  const publicPath = `/media/${relativePath.split(path.sep).join('/')}`
  const variant: MediaVariant = {
    publicPath,
    objectKey,
    sha256,
    mimeType,
    byteSize: body.byteLength,
    width: validated.metadata.width,
    height: validated.metadata.height,
  }
  await repository.approve(record.id, siteId, [variant])
  return { path: publicPath, byteSize: body.byteLength, sha256, objectKey }
}

async function reconcileFixtureMedia(
  pool: PostgresPool,
  objectStore: ObjectStore,
  siteId: string,
  mediaRoot: string,
): Promise<FixtureReconciliation['media']> {
  const repository = new PostgresMediaRepository(undefined, pool)
  const media = []
  for (const relativePath of await mediaFiles(mediaRoot))
    media.push(
      await reconcileMediaFile(
        objectStore,
        repository,
        siteId,
        mediaRoot,
        relativePath,
      ),
    )
  return media
}

function fixtureDigest(
  siteId: string,
  content: {
    readonly posts: readonly { sourceId: string }[]
    readonly tags: readonly { slug: string }[]
    readonly authors: readonly { slug: string }[]
    readonly settings: { canonicalOrigin: string; themeId: string }
  },
  counts: FixtureReconciliation['counts'],
  media: FixtureReconciliation['media'],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        siteId,
        postSourceIds: content.posts.map((post) => post.sourceId).sort(),
        tagSlugs: content.tags.map((tag) => tag.slug).sort(),
        authorSlugs: content.authors.map((author) => author.slug).sort(),
        settings: {
          canonicalOrigin: content.settings.canonicalOrigin,
          themeId: content.settings.themeId,
        },
        counts,
        media,
      }),
    )
    .digest('hex')
}

export async function reconcileCheckedInFixture({
  pool,
  objectStore,
  siteId = 'default',
  mediaRoot = path.join(repositoryRoot, 'apps/site/public/media'),
}: {
  readonly pool: PostgresPool
  readonly objectStore: ObjectStore
  readonly siteId?: string
  readonly mediaRoot?: string
}): Promise<FixtureReconciliation> {
  const fixture = await readFixtureIdentity()
  const before = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM publisher_admin.site_states WHERE site_id = $1',
    [siteId],
  )
  await seedCheckedInPostgresFixture(pool, siteId)
  const repository = new PostgresContentRepository(siteId, pool)
  const [posts, tags, authors, settings] = await Promise.all([
    repository.list(),
    repository.listTags(),
    repository.listAuthors(),
    repository.getSettings(),
  ])
  const content = { posts, tags, authors, settings }
  assertFixtureContent(content, fixture)
  const media = await reconcileFixtureMedia(
    pool,
    objectStore,
    siteId,
    mediaRoot,
  )
  const counts = {
    posts: posts.length,
    tags: tags.length,
    authors: authors.length,
    media: media.length,
  }
  const fixtureSha256 = fixtureDigest(siteId, content, counts, media)
  return {
    schemaVersion: 1,
    source: 'checked-in-fixture',
    siteId,
    importedIntoEmptySite: Number(before.rows[0]?.count ?? 0) === 0,
    counts,
    media,
    fixtureSha256,
    recordedAt: new Date().toISOString(),
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const pool = createPostgresPool(connectionString, { max: 2 })
  try {
    await applyMigrations(connectionString, 'admin', pool)
    const objectStore = objectStoreFromEnvironment()
    if (!objectStore)
      throw new Error('Object storage configuration is required')
    const report = await reconcileCheckedInFixture({
      pool,
      objectStore,
      siteId: argument('--site') ?? 'default',
    })
    const output = argument('--output')
    if (output)
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
    console.log(JSON.stringify(report))
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
