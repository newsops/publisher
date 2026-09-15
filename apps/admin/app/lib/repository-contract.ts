import type {
  AuthorProfileInput,
  ContentSnapshot,
  ManagedAuthorProfile,
  ManagedPost,
  ManagedPublicationSettings,
  ManagedTaxonomyTerm,
  PostDraftInput,
  PublicationSettingsInput,
  TaxonomyTermInput,
} from '@publisher/content'
import type { PublishDelivery } from './publisher'
import type { BuildJob, BuildJobStatus } from '@publisher/publication'

export interface SiteContext {
  readonly siteId: string
}

export interface PublishResult {
  readonly snapshot: ContentSnapshot
  readonly checksum: string
  readonly delivery: PublishDelivery
  readonly jobId: string
  readonly jobStatus: BuildJobStatus
}

export interface ContentRepository {
  list(): Promise<readonly ManagedPost[]>
  get(id: string): Promise<ManagedPost | undefined>
  save(id: string | undefined, input: PostDraftInput): Promise<ManagedPost>
  remove(id: string): Promise<void>
  listTags(): Promise<readonly ManagedTaxonomyTerm[]>
  getTag(slug: string): Promise<ManagedTaxonomyTerm | undefined>
  saveTag(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm>
  removeTag(slug: string): Promise<ManagedTaxonomyTerm>
  listCategories(): Promise<readonly ManagedTaxonomyTerm[]>
  getCategory(slug: string): Promise<ManagedTaxonomyTerm | undefined>
  saveCategory(
    slug: string | undefined,
    input: TaxonomyTermInput,
  ): Promise<ManagedTaxonomyTerm>
  removeCategory(slug: string): Promise<ManagedTaxonomyTerm>
  getSettings(): Promise<ManagedPublicationSettings>
  saveSettings(
    input: PublicationSettingsInput,
  ): Promise<ManagedPublicationSettings>
  listAuthors(): Promise<readonly ManagedAuthorProfile[]>
  getAuthor(slug: string): Promise<ManagedAuthorProfile | undefined>
  saveAuthor(
    slug: string | undefined,
    input: AuthorProfileInput,
  ): Promise<ManagedAuthorProfile>
  removeAuthor(slug: string): Promise<ManagedAuthorProfile>
  publish(idempotencyKey?: string): Promise<PublishResult>
  getBuildJob(jobId: string): Promise<BuildJob | undefined>
}
