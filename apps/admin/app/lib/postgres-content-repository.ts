import { randomUUID } from 'node:crypto'
import type { BuildJob } from '@publisher/publication'
import { PostgresBuildJobRepository } from './build-job-repository'
import {
  ContentValidationError,
  type AuthorProfileInput,
  type ManagedAuthorProfile,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
  type PostDraftInput,
  type PublicationSettingsInput,
  type TaxonomyTermInput,
} from '@publisher/content'
import {
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import type { ContentRepository, PublishResult } from './repository-contract'
import type { LocalState } from './repository-seed'
import {
  assertAuthorUnassigned,
  assertUniqueFeaturedRanks,
  validatedAuthor,
  validatedPost,
  validatedSettings,
  validatedTag,
  referencesTerm,
  upsertTaxonomyTerm,
} from './repository-validation'
import { assertSiteId } from './site-registry'
import {
  loadPostgresSiteState,
  publishPostgresContent,
  type StoredPostgresState,
} from './postgres-publication'

export class PostgresContentRepository implements ContentRepository {
  readonly siteId: string

  constructor(
    siteId = 'default',
    private readonly pool: PostgresPool = postgresPool(
      process.env.DATABASE_URL ?? '',
    ),
  ) {
    assertSiteId(siteId)
    this.siteId = siteId
  }

  private async stored(
    database: PostgresQueryable = this.pool,
    lock = false,
  ): Promise<StoredPostgresState> {
    return loadPostgresSiteState(database, this.siteId, lock)
  }

  private async mutate<T>(
    callback: (state: LocalState) => { state: LocalState; result: T },
    expectedStateRevision?: number,
  ): Promise<T> {
    return runPostgresTransaction(this.pool, async (client) => {
      const current = await this.stored(client, true)
      if (
        expectedStateRevision !== undefined &&
        current.revision !== expectedStateRevision
      )
        throw new Error('Content changed during publication')
      const next = callback(current.state)
      const updated = await client.query(
        `UPDATE publisher_admin.site_states
         SET state = $2::jsonb, revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE site_id = $1 AND revision = $3`,
        [this.siteId, JSON.stringify(next.state), current.revision],
      )
      if (updated.rowCount !== 1) throw new Error('Content revision conflict')
      return next.result
    })
  }

  async list(): Promise<readonly ManagedPost[]> {
    return (await this.stored()).state.posts.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
  }

  async get(id: string): Promise<ManagedPost | undefined> {
    const post = (await this.stored()).state.posts.find(
      (candidate) => candidate.id === id,
    )
    return post
  }

  async listTags(): Promise<readonly ManagedTaxonomyTerm[]> {
    return [...(await this.stored()).state.tags].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getTag(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.stored()).state.tags.find(
      (tag) => tag.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async listCategories(): Promise<readonly ManagedTaxonomyTerm[]> {
    return [...(await this.stored()).state.categories].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getCategory(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.stored()).state.categories.find(
      (item) => item.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async getSettings(): Promise<ManagedPublicationSettings> {
    const settings = (await this.stored()).state.settings
    return settings
  }

  async saveSettings(
    input: PublicationSettingsInput,
  ): Promise<ManagedPublicationSettings> {
    return this.mutate((state) => {
      const settings = validatedSettings(input, state.settings)
      return { state: { ...state, settings }, result: settings }
    })
  }

  async listAuthors(): Promise<readonly ManagedAuthorProfile[]> {
    return [...(await this.stored()).state.authors].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getAuthor(slug: string): Promise<ManagedAuthorProfile | undefined> {
    return (await this.stored()).state.authors.find(
      (author) => author.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async saveAuthor(
    slug: string | undefined,
    input: AuthorProfileInput,
  ): Promise<ManagedAuthorProfile> {
    return this.mutate((state) => {
      const authors = [...state.authors]
      const current = slug
        ? authors.find(
            (author) => author.slug.toLowerCase() === slug.toLowerCase(),
          )
        : undefined
      if (slug && !current) throw new Error('Author not found')
      const author = validatedAuthor(slug, input, current)
      if (!current && authors.some((item) => item.slug === author.slug))
        throw new ContentValidationError('Author already exists')
      const next = current
        ? authors.map((item) => (item.slug === current.slug ? author : item))
        : [...authors, author]
      return { state: { ...state, authors: next }, result: author }
    })
  }

  async removeAuthor(slug: string): Promise<ManagedAuthorProfile> {
    return this.mutate((state) => {
      const authors = [...state.authors]
      const current = authors.find(
        (author) => author.slug.toLowerCase() === slug.toLowerCase(),
      )
      if (!current) throw new Error('Author not found')
      assertAuthorUnassigned(state.posts, current.slug)
      const archived = {
        ...current,
        active: false,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      return {
        state: {
          ...state,
          authors: authors.map((author) =>
            author.slug === current.slug ? archived : author,
          ),
        },
        result: archived,
      }
    })
  }

  async save(
    id: string | undefined,
    input: PostDraftInput,
  ): Promise<ManagedPost> {
    return this.mutate((state) => {
      const stored = id
        ? state.posts.find((candidate) => candidate.id === id)
        : undefined
      const current = stored
      if (id && !current) throw new Error('Post not found')
      const categories = state.categories
      const tags = state.tags
      const authors = state.authors
      const post = validatedPost(
        id,
        current,
        input,
        categories
          .filter(
            (tag) =>
              tag.active || referencesTerm(current?.categories, tag.slug),
          )
          .map((tag) => tag.slug),
        authors
          .filter(
            (author) => author.active || author.slug === current?.authorSlug,
          )
          .map((author) => author.slug),
        state.settings.canonicalOrigin,
        tags
          .filter(
            (tag) => tag.active || referencesTerm(current?.tags, tag.slug),
          )
          .map((tag) => tag.slug),
      )
      const posts = current
        ? state.posts.map((candidate) =>
            candidate.id === post.id ? post : candidate,
          )
        : [...state.posts, post]
      assertUniqueFeaturedRanks(posts)
      return { state: { ...state, posts }, result: post }
    })
  }

  async saveTag(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    return this.mutate((state) => {
      const { terms, term } = upsertTaxonomyTerm(state.tags, slug, input, 'Tag')
      return { state: { ...state, tags: terms }, result: term }
    })
  }

  async removeTag(slug: string): Promise<ManagedTaxonomyTerm> {
    return this.mutate((state) => {
      const tags = [...state.tags]
      const current = tags.find(
        (tag) => tag.slug.toLowerCase() === slug.toLowerCase(),
      )
      if (!current) throw new Error('Tag not found')
      const archived = {
        ...current,
        active: false,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      return {
        state: {
          ...state,
          tags: tags.map((tag) => (tag.slug === current.slug ? archived : tag)),
        },
        result: archived,
      }
    })
  }

  async saveCategory(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    return this.mutate((state) => {
      const { terms, term } = upsertTaxonomyTerm(
        state.categories,
        slug,
        input,
        'Category',
      )
      return { state: { ...state, categories: terms }, result: term }
    })
  }

  async removeCategory(slug: string): Promise<ManagedTaxonomyTerm> {
    return this.mutate((state) => {
      const current = state.categories.find(
        (item) => item.slug.toLowerCase() === slug.toLowerCase(),
      )
      if (!current) throw new Error('Category not found')
      const archived = {
        ...current,
        active: false,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      return {
        state: {
          ...state,
          categories: state.categories.map((item) =>
            item.slug === current.slug ? archived : item,
          ),
        },
        result: archived,
      }
    })
  }

  async remove(id: string): Promise<void> {
    await this.mutate((state) => {
      const posts = state.posts.filter((post) => post.id !== id)
      if (posts.length === state.posts.length) throw new Error('Post not found')
      return { state: { ...state, posts }, result: undefined }
    })
  }

  async publish(idempotencyKey: string = randomUUID()): Promise<PublishResult> {
    return publishPostgresContent(this.siteId, this.pool, idempotencyKey)
  }

  async getBuildJob(jobId: string): Promise<BuildJob | undefined> {
    return new PostgresBuildJobRepository(this.pool).get(jobId)
  }
}
