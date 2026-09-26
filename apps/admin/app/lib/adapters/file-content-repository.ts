import { randomUUID } from 'node:crypto'
import type { BuildJob } from '@publisher/publication'
import { FileBuildJobRepository } from '@publisher/persistence'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
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
  withCanonicalBody,
  type DeskReview,
} from '@publisher/content'
import { FileArticleRepositoryAdapter } from './article-repository-adapter'
import type {
  ContentRepository,
  PublishResult,
} from '../services/repository-contract'
import { publishFileContent } from './file-publication'
import { initialPayload, type LocalState } from '@publisher/content'
import {
  assertAuthorUnassigned,
  validatedAuthor,
  validatedPost,
  validatedSettings,
  validatedTag,
  assertUniqueFeaturedRanks,
  referencesTerm,
  upsertTaxonomyTerm,
  withDeskGateUpgrade,
  withDeskReview,
} from '@publisher/content'

export class FileContentRepository implements ContentRepository {
  readonly siteId: string
  private readonly directory: string
  private readonly filePath: string
  private readonly articleRepository: FileArticleRepositoryAdapter

  constructor(directory: string, siteId = 'default') {
    this.siteId = siteId
    this.directory = directory
    this.filePath =
      siteId === 'default'
        ? path.join(directory, 'content.json')
        : path.join(directory, 'sites', siteId, 'content.json')
    this.articleRepository = new FileArticleRepositoryAdapter(
      path.dirname(this.filePath),
    )
  }

  private async readState(): Promise<LocalState> {
    try {
      const state = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as LocalState
      if (state.siteId !== this.siteId)
        throw new Error('Content repository site mismatch')
      return {
        ...state,
        categories: state.categories ?? state.tags,
        posts: state.posts.map((post) =>
          withDeskGateUpgrade(
            withCanonicalBody({ ...post, tags: post.tags ?? [] }, post.slug, {
              onImportError: 'lenient',
            }),
          ),
        ),
        authors: state.authors.map((author) => ({
          ...author,
          editorialPersona: author.editorialPersona ?? '',
        })),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return initialPayload(this.siteId)
    }
  }

  private async writeState(state: LocalState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(
      temporary,
      `${JSON.stringify({ ...state, siteId: this.siteId }, null, 2)}\n`,
      'utf8',
    )
    await rename(temporary, this.filePath)
  }

  async list(): Promise<readonly ManagedPost[]> {
    const state = await this.readState()
    return state.posts.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
  }

  async get(id: string): Promise<ManagedPost | undefined> {
    const post = (await this.readState()).posts.find(
      (candidate) => candidate.id === id,
    )
    return post
  }

  async listTags(): Promise<readonly ManagedTaxonomyTerm[]> {
    return [...(await this.readState()).tags].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getTag(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.readState()).tags.find(
      (tag) => tag.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async listCategories(): Promise<readonly ManagedTaxonomyTerm[]> {
    return [...(await this.readState()).categories].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getCategory(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.readState()).categories.find(
      (category) => category.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async getSettings(): Promise<ManagedPublicationSettings> {
    return (await this.readState()).settings
  }

  async saveSettings(
    input: PublicationSettingsInput,
  ): Promise<ManagedPublicationSettings> {
    const state = await this.readState()
    const settings = validatedSettings(input, state.settings)
    await this.writeState({ ...state, settings })
    return settings
  }

  async listAuthors(): Promise<readonly ManagedAuthorProfile[]> {
    return [...(await this.readState()).authors].sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  }

  async getAuthor(slug: string): Promise<ManagedAuthorProfile | undefined> {
    return (await this.readState()).authors.find(
      (author) => author.slug.toLowerCase() === slug.toLowerCase(),
    )
  }

  async saveAuthor(
    slug: string | undefined,
    input: AuthorProfileInput,
  ): Promise<ManagedAuthorProfile> {
    const state = await this.readState()
    const authors = state.authors
    const current = slug
      ? authors.find(
          (author) => author.slug.toLowerCase() === slug.toLowerCase(),
        )
      : undefined
    if (slug && !current) throw new Error('Author not found')
    const candidate = validatedAuthor(slug, input, current)
    if (!current && authors.some((author) => author.slug === candidate.slug))
      throw new ContentValidationError('Author already exists')
    const nextAuthors = current
      ? authors.map((author) =>
          author.slug === current.slug ? candidate : author,
        )
      : [...authors, candidate]
    await this.writeState({ ...state, authors: nextAuthors })
    return candidate
  }

  async removeAuthor(slug: string): Promise<ManagedAuthorProfile> {
    const state = await this.readState()
    const authors = state.authors
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
    await this.writeState({
      ...state,
      authors: authors.map((author) =>
        author.slug === current.slug ? archived : author,
      ),
    })
    return archived
  }

  async save(
    id: string | undefined,
    input: PostDraftInput,
  ): Promise<ManagedPost> {
    const state = await this.readState()
    const stored = id ? state.posts.find((post) => post.id === id) : undefined
    const current = stored
    if (id && !current) throw new Error('Post not found')
    const categories = state.categories
    const allowedCategories = categories
      .filter(
        (tag) => tag.active || referencesTerm(current?.categories, tag.slug),
      )
      .map((tag) => tag.slug)
    const tags = state.tags
    const allowedTags = tags
      .filter((tag) => tag.active || referencesTerm(current?.tags, tag.slug))
      .map((tag) => tag.slug)
    const authors = state.authors
    const allowedAuthors = authors
      .filter((author) => author.active || author.slug === current?.authorSlug)
      .map((author) => author.slug)
    const post = validatedPost(
      id,
      current,
      input,
      allowedCategories,
      allowedAuthors,
      state.settings.canonicalOrigin,
      allowedTags,
    )
    const posts = current
      ? state.posts.map((candidate) =>
          candidate.id === post.id ? post : candidate,
        )
      : [...state.posts, post]
    assertUniqueFeaturedRanks(posts)
    await this.writeState({ ...state, posts })
    return post
  }

  async saveTag(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    const state = await this.readState()
    const { terms, term } = upsertTaxonomyTerm(state.tags, slug, input, 'Tag')
    await this.writeState({ ...state, tags: terms })
    return term
  }

  async removeTag(slug: string): Promise<ManagedTaxonomyTerm> {
    const state = await this.readState()
    const tags = state.tags
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
    await this.writeState({
      ...state,
      tags: tags.map((tag) => (tag.slug === current.slug ? archived : tag)),
    })
    return archived
  }

  async saveCategory(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    const state = await this.readState()
    const { terms, term } = upsertTaxonomyTerm(
      state.categories,
      slug,
      input,
      'Category',
    )
    await this.writeState({ ...state, categories: terms })
    return term
  }

  async removeCategory(slug: string): Promise<ManagedTaxonomyTerm> {
    const state = await this.readState()
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
    await this.writeState({
      ...state,
      categories: state.categories.map((item) =>
        item.slug === current.slug ? archived : item,
      ),
    })
    return archived
  }

  async remove(id: string): Promise<void> {
    const state = await this.readState()
    const posts = state.posts.filter((post) => post.id !== id)
    if (posts.length === state.posts.length) throw new Error('Post not found')
    await this.writeState({ ...state, posts })
  }

  async reviewPost(id: string, review: DeskReview): Promise<ManagedPost> {
    const state = await this.readState()
    const current = state.posts.find((post) => post.id === id)
    if (!current) throw new Error('Post not found')
    const post = withDeskReview(current, review)
    await this.writeState({
      ...state,
      posts: state.posts.map((item) => (item.id === id ? post : item)),
    })
    return post
  }

  async publish(idempotencyKey: string = randomUUID()): Promise<PublishResult> {
    const state = await this.readState()
    return publishFileContent({
      state,
      siteId: this.siteId,
      directory: this.directory,
      articleRepository: this.articleRepository,
      idempotencyKey,
      writeState: (next) => this.writeState(next),
    })
  }

  async getBuildJob(jobId: string): Promise<BuildJob | undefined> {
    return new FileBuildJobRepository(this.directory).get(jobId)
  }
}
