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
import type { ArticleRepository } from './services/article-repository'
import { FileArticleRepositoryAdapter } from './adapters/article-repository-adapter'
import { FileContentRepository } from './adapters/file-content-repository'
import { PostgresArticleRepository } from './adapters/postgres-article-repository'
import { PostgresContentRepository } from './adapters/postgres-content-repository'
import type {
  ContentRepository,
  PublishResult,
} from './services/repository-contract'
import type { BuildJob } from '@publisher/publication'
import { assertSiteId } from '@publisher/content'
import { postgresPool } from '@publisher/persistence'
import { adminConfig, adminDataDirectory } from './config'

/** The shared pool for the configured database, or undefined without one. */
export function adminPool() {
  const url = adminConfig().databaseUrl
  return url ? postgresPool(url) : undefined
}

function requireProductionDatabase(): never {
  throw new Error('DATABASE_URL is required for production persistence')
}

class RuntimeContentRepository implements ContentRepository {
  readonly siteId = 'default'
  private file: FileContentRepository | undefined
  private postgres: PostgresContentRepository | undefined

  private async active(): Promise<ContentRepository> {
    const config = adminConfig()
    const file = () =>
      (this.file ??= new FileContentRepository(adminDataDirectory()))
    if (config.isolatedFileRepository) return file()
    const pool = adminPool()
    if (pool)
      return (this.postgres ??= new PostgresContentRepository(
        this.siteId,
        pool,
      ))
    if (config.nodeEnv === 'production') requireProductionDatabase()
    return file()
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
  environment?: NodeJS.ProcessEnv,
): boolean {
  return adminConfig(environment).isolatedFileRepository
}

let repository: ContentRepository | undefined

export function getRepository(): ContentRepository {
  if (!repository) repository = new RuntimeContentRepository()
  return repository
}

export function getRepositoryForSite(siteId: string): ContentRepository {
  assertSiteId(siteId)
  const pool = adminPool()
  if (pool) return new PostgresContentRepository(siteId, pool)
  if (siteId === 'default') return getRepository()
  if (adminConfig().nodeEnv === 'production') requireProductionDatabase()
  return new FileContentRepository(adminDataDirectory(siteId), siteId)
}

/** File-backed stores serve local development; production requires PostgreSQL. */
export function useFileStores(): boolean {
  const config = adminConfig()
  return (
    config.isolatedFileRepository ||
    (config.nodeEnv !== 'production' && !config.databaseUrl)
  )
}

export function getArticleRepositoryForSite(
  siteId = 'default',
): ArticleRepository {
  assertSiteId(siteId)
  if (useFileStores())
    return new FileArticleRepositoryAdapter(adminDataDirectory(siteId))
  const pool = adminPool()
  if (pool) return new PostgresArticleRepository(siteId, pool)
  return requireProductionDatabase()
}

export { FileContentRepository } from './adapters/file-content-repository'
export { PostgresContentRepository } from './adapters/postgres-content-repository'
export type {
  ContentRepository,
  PublishResult,
} from './services/repository-contract'
