import {
  assertUniqueFeaturedRanks,
  articles as seedArticles,
  initialPayload,
  validatedAuthor,
  validatedPost,
  validatedSettings,
  validatedTag,
  type EditorialArchive,
  type LocalState,
  type ManagedAuthorProfile,
  type ManagedArticle,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
} from '@publisher/content'
import {
  PostgresMediaRepository,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import type {
  ArchiveRestoreInput,
  ArchiveRestoreMediaBinding,
} from './archive-restore'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function starterFingerprint(state: LocalState): string {
  const { posts, tags, categories, authors, settings, snapshots } = state
  const { updatedAt, ...settingsWithoutMetadata } = settings
  return canonicalJson({
    posts,
    tags: tags.map(({ createdAt, updatedAt, ...tag }) => tag),
    categories: categories.map(
      ({ createdAt, updatedAt, ...category }) => category,
    ),
    authors: authors.map(({ createdAt, updatedAt, ...author }) => author),
    settings: settingsWithoutMetadata,
    snapshots,
  })
}

export function assertUntouchedStarterFixture(
  siteId: string,
  state: LocalState,
): void {
  if (starterFingerprint(state) !== starterFingerprint(initialPayload(siteId)))
    throw new Error('Archive restore requires an untouched starter fixture')
}

export async function assertUntouchedStarterArticles(
  database: PostgresQueryable,
  siteId: string,
): Promise<void> {
  await database.query('LOCK TABLE publisher_admin.articles IN EXCLUSIVE MODE')
  const current = await database.query<{
    id: string
    payload: ManagedArticle
    revision: number
  }>(
    'SELECT id, payload, revision FROM publisher_admin.articles WHERE site_id = $1',
    [siteId],
  )
  const expected = new Map(
    seedArticles.map((article) => [
      article.id,
      canonicalJson({ ...article, revision: 1 }),
    ]),
  )
  if (current.rows.length !== expected.size)
    throw new Error(
      'Archive restore requires an untouched starter fixture: article inventory changed',
    )
  for (const row of current.rows) {
    const { createdAt, ...payload } = row.payload
    if (
      row.revision !== 1 ||
      row.id !== payload.id ||
      canonicalJson(payload) !== expected.get(row.id)
    )
      throw new Error(
        'Archive restore requires an untouched starter fixture: article changed',
      )
  }
}

function managedAuthors(
  archive: EditorialArchive,
  mediaPaths: ReadonlyMap<string, string>,
): ManagedAuthorProfile[] {
  return archive.authors.map((author) =>
    validatedAuthor(
      author.slug,
      {
        ...author,
        avatarUrl: author.avatarAsset
          ? mediaPaths.get(author.avatarAsset)
          : undefined,
      },
      undefined,
    ),
  )
}

function managedTags(archive: EditorialArchive): ManagedTaxonomyTerm[] {
  return archive.tags.map((tag) =>
    validatedTag(tag.slug, { ...tag, active: true }, undefined),
  )
}

function rewriteBodyMediaReferences(
  post: EditorialArchive['posts'][number],
  mediaPaths: ReadonlyMap<string, string>,
): string {
  let bodyMarkdown = post.bodyMarkdown
  for (const [reference, assetPath] of Object.entries(
    post.bodyMediaAssets ?? {},
  )) {
    const publicPath = mediaPaths.get(assetPath)
    if (!publicPath)
      throw new Error(`Approved media is unavailable: ${assetPath}`)
    bodyMarkdown = bodyMarkdown.split(reference).join(publicPath)
  }
  return bodyMarkdown
}

function normalizedArchiveSeoTitle(
  value: string | undefined,
): string | undefined {
  if (!value?.trim()) return value
  const title = value.trim()
  let normalized = ''
  for (const codePoint of title) {
    if (normalized.length + codePoint.length > 70) break
    normalized += codePoint
  }
  return normalized
}

function managedPosts(
  archive: EditorialArchive,
  settings: ManagedPublicationSettings,
  tags: readonly ManagedTaxonomyTerm[],
  authors: readonly ManagedAuthorProfile[],
  mediaPaths: ReadonlyMap<string, string>,
): ManagedPost[] {
  const posts = archive.posts.map((post) =>
    validatedPost(
      undefined,
      undefined,
      {
        ...post,
        seoTitle: normalizedArchiveSeoTitle(post.seoTitle),
        imageUrl: post.imageAsset ? mediaPaths.get(post.imageAsset) : undefined,
        bodyMarkdown: rewriteBodyMediaReferences(post, mediaPaths),
      },
      tags.map((tag) => tag.slug),
      authors.map((author) => author.slug),
      settings.canonicalOrigin,
    ),
  )
  assertUniqueFeaturedRanks(posts)
  return posts
}

async function approvedMediaPaths(
  database: PostgresQueryable,
  pool: PostgresPool,
  siteId: string,
  archive: EditorialArchive,
  bindings: Readonly<Record<string, ArchiveRestoreMediaBinding>>,
) {
  const mediaRepository = new PostgresMediaRepository(undefined, pool)
  const paths = new Map<string, string>()
  for (const entry of archive.media) {
    const binding = bindings[entry.assetPath]
    if (!binding)
      throw new Error(`Approved media binding is required: ${entry.assetPath}`)
    const media = await mediaRepository.getUsing(
      database,
      binding.mediaId,
      siteId,
    )
    if (!media || media.state !== 'approved' || media.sha256 !== entry.sha256)
      throw new Error(`Approved media is unavailable: ${entry.assetPath}`)
    const variant = media.variants.find(
      (candidate) => candidate.sha256 === binding.variantSha256,
    )
    if (!variant)
      throw new Error(
        `Approved media variant is unavailable: ${entry.assetPath}`,
      )
    paths.set(entry.assetPath, variant.publicPath)
  }
  return paths
}

export async function prepareArchiveState(
  database: PostgresQueryable,
  pool: PostgresPool,
  siteId: string,
  input: ArchiveRestoreInput,
): Promise<LocalState> {
  const mediaPaths = await approvedMediaPaths(
    database,
    pool,
    siteId,
    input.archive,
    input.media,
  )
  const settings = validatedSettings(input.archive.settings, {
    ...initialPayload().settings,
    revision: 0,
  })
  const authors = managedAuthors(input.archive, mediaPaths)
  const tags = managedTags(input.archive)
  return {
    siteId,
    settings,
    authors,
    tags,
    categories: tags,
    posts: managedPosts(input.archive, settings, tags, authors, mediaPaths),
    snapshots: [],
  }
}
