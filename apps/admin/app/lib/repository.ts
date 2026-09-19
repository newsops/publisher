import type {
  AuthorProfileInput,
  ManagedAuthorProfile,
  ManagedPost,
  ManagedPublicationSettings,
  ManagedTaxonomyTerm,
  PostDraftInput,
  PublicationSettingsInput,
  TaxonomyTermInput,
  DeskReview,
} from '@publisher/content'
import type { ArticleRepository } from './article-repository'
import { FileArticleRepositoryAdapter } from './article-repository-adapter'
import { FileContentRepository } from './file-content-repository'
import { PostgresArticleRepository } from './postgres-article-repository'
import { PostgresContentRepository } from './postgres-content-repository'
import type { ContentRepository, PublishResult } from './repository-contract'
import type { BuildJob } from '@publisher/publication'
import { assertSiteId } from './site-registry'

class RuntimeContentRepository implements ContentRepository {
  readonly siteId = 'default'
  private readonly file = new FileContentRepository()
  private postgres: PostgresContentRepository | undefined

  private async active(): Promise<ContentRepository> {
    if (shouldUseIsolatedFileRepository()) return this.file
    if (process.env.DATABASE_URL)
      return (this.postgres ??= new PostgresContentRepository(this.siteId))
    if (process.env.NODE_ENV === 'production')
      throw new Error('DATABASE_URL is required for production persistence')
    return this.file
  }

  async list(): Promise<readonly ManagedPost[]> {
    return (await this.active()).list()
  }
  async get(id: string): Promise<ManagedPost | undefined> {
    return (await this.active()).get(id)
  }
  async save(
    id: string | undefined,
    input: PostDraftInput,
  ): Promise<ManagedPost> {
    return (await this.active()).save(id, input)
  }
  async reviewPost(id: string, review: DeskReview): Promise<ManagedPost> {
    return (await this.active()).reviewPost(id, review)
  }

  async remove(id: string): Promise<void> {
    return (await this.active()).remove(id)
  }
  async listTags(): Promise<readonly ManagedTaxonomyTerm[]> {
    return (await this.active()).listTags()
  }
  async getTag(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.active()).getTag(slug)
  }
  async saveTag(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    return (await this.active()).saveTag(slug, input)
  }
  async removeTag(slug: string): Promise<ManagedTaxonomyTerm> {
    return (await this.active()).removeTag(slug)
  }
  async listCategories(): Promise<readonly ManagedTaxonomyTerm[]> {
    return (await this.active()).listCategories()
  }
  async getCategory(slug: string): Promise<ManagedTaxonomyTerm | undefined> {
    return (await this.active()).getCategory(slug)
  }
  async saveCategory(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm> {
    return (await this.active()).saveCategory(slug, input)
  }
  async removeCategory(slug: string): Promise<ManagedTaxonomyTerm> {
    return (await this.active()).removeCategory(slug)
  }
  async getSettings(): Promise<ManagedPublicationSettings> {
    return (await this.active()).getSettings()
  }
  async saveSettings(
    input: PublicationSettingsInput,
  ): Promise<ManagedPublicationSettings> {
    return (await this.active()).saveSettings(input)
  }
  async listAuthors(): Promise<readonly ManagedAuthorProfile[]> {
    return (await this.active()).listAuthors()
  }
  async getAuthor(slug: string): Promise<ManagedAuthorProfile | undefined> {
    return (await this.active()).getAuthor(slug)
  }
  async saveAuthor(
    slug: string | undefined,
    input: AuthorProfileInput,
  ): Promise<ManagedAuthorProfile> {
    return (await this.active()).saveAuthor(slug, input)
  }
  async removeAuthor(slug: string): Promise<ManagedAuthorProfile> {
    return (await this.active()).removeAuthor(slug)
  }
  async publish(idempotencyKey?: string): Promise<PublishResult> {
    return (await this.active()).publish(idempotencyKey)
  }
  async getBuildJob(jobId: string): Promise<BuildJob | undefined> {
    return (await this.active()).getBuildJob(jobId)
  }
}

export function shouldUseIsolatedFileRepository(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV !== 'production' && Boolean(environment.ADMIN_DATA_DIR)
  )
}

let repository: ContentRepository | undefined

export function getRepository(): ContentRepository {
  if (!repository) repository = new RuntimeContentRepository()
  return repository
}

export function getRepositoryForSite(siteId: string): ContentRepository {
  assertSiteId(siteId)
  if (process.env.DATABASE_URL) return new PostgresContentRepository(siteId)
  if (siteId === 'default') return getRepository()
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL is required for production persistence')
  return new FileContentRepository(undefined, siteId)
}

export function getArticleRepositoryForSite(
  siteId = 'default',
): ArticleRepository {
  assertSiteId(siteId)
  if (
    shouldUseIsolatedFileRepository() ||
    (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL)
  )
    return new FileArticleRepositoryAdapter(
      siteId === 'default'
        ? process.env.ADMIN_DATA_DIR
        : `${process.env.ADMIN_DATA_DIR ?? '.data/admin'}/sites/${siteId}`,
    )
  if (process.env.DATABASE_URL) return new PostgresArticleRepository(siteId)
  throw new Error('DATABASE_URL is required for production persistence')
}

export { FileContentRepository } from './file-content-repository'
export { PostgresContentRepository } from './postgres-content-repository'
export type { ContentRepository, PublishResult } from './repository-contract'
