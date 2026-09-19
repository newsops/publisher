/**
 * Composition root (ARCH-003). Routes, scripts, and the CLI-facing services
 * obtain adapters only through this module; services receive their adapter
 * dependencies as parameters and never construct storage clients.
 */
import {
  decideDesk as decideDeskWith,
  deskReportFor as deskReportForWith,
  type DeskDecisionInput,
  type DeskDependencies,
} from './services/desk-review'
import type { DeskReviewer } from '@publisher/content'
import type { ManagedPost } from '@publisher/content'
import { assertSiteId } from '@publisher/content'
import {
  PostgresBuildJobRepository,
  postgresPool,
} from '@publisher/persistence'
import type { BuildJobRepository } from '@publisher/publication'
import { FileBuildJobRepository } from '@publisher/persistence'
import { siteGuidanceText } from './adapters/agent-guidance'
import { FilePluginRepository } from './adapters/file-plugin-repository'
import { mediaLibraryImageFacts } from './adapters/media-service'
import { PostgresPluginRepository } from './adapters/postgres-plugin-repository'
import type { PluginRepository } from './services/plugin-repository'
import { shouldUseIsolatedFileRepository } from './repository'

export {
  getArticleRepositoryForSite,
  getRepository,
  getRepositoryForSite,
  shouldUseIsolatedFileRepository,
  FileContentRepository,
  PostgresContentRepository,
} from './repository'
export type { ContentRepository, PublishResult } from './repository'
export { seedCheckedInPostgresFixture } from './adapters/postgres-publication'
export {
  getAgentGuidanceRepository,
  parseAgentGuidanceInput,
  type AgentGuidance,
} from './adapters/agent-guidance'
export {
  approveImage,
  listMedia,
  readApprovedMediaPreview,
  uploadImage,
} from './adapters/media-service'
export {
  deliverSnapshot,
  publicationIdempotencyKey,
  type PublishDelivery,
} from './adapters/publisher'
export {
  getSiteRegistry,
  PostgresSiteRegistry,
  type SiteConfig,
  type SiteInput,
} from './adapters/site-registry'
export {
  findArchiveRestoreOperation,
  restoreArchive,
  type ArchiveRestoreInput,
  type ArchiveRestoreMediaBinding,
  type ArchiveRestoreResult,
} from './adapters/archive-restore'
export * from './adapters/account-store'
export {
  DeskDecisionError,
  deskReviewerFor,
  parseDeskDecision,
} from './services/desk-review'

const deskDependencies: DeskDependencies = {
  resolveImage: mediaLibraryImageFacts,
  guidanceFor: siteGuidanceText,
}

export function deskReportFor(siteId: string, post: ManagedPost) {
  return deskReportForWith(siteId, post, deskDependencies)
}

export function decideDesk(
  siteId: string,
  postId: string,
  decision: DeskDecisionInput,
  reviewer: DeskReviewer,
) {
  return decideDeskWith(siteId, postId, decision, reviewer, deskDependencies)
}

export function getPluginRepositoryForSite(siteId: string): PluginRepository {
  assertSiteId(siteId)
  if (
    shouldUseIsolatedFileRepository() ||
    (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL)
  )
    return new FilePluginRepository(undefined, siteId)
  if (process.env.DATABASE_URL) return new PostgresPluginRepository(siteId)
  throw new Error('DATABASE_URL is required for production persistence')
}

export function buildJobsForSite(siteId: string): BuildJobRepository {
  assertSiteId(siteId)
  if (process.env.DATABASE_URL)
    return new PostgresBuildJobRepository(
      postgresPool(process.env.DATABASE_URL),
    )
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL is required for production persistence')
  return new FileBuildJobRepository(
    siteId === 'default'
      ? (process.env.ADMIN_DATA_DIR ?? '.data/admin')
      : `${process.env.ADMIN_DATA_DIR ?? '.data/admin'}/sites/${siteId}`,
  )
}

export {
  knownPluginIds,
  publicPluginInstallation,
  type PluginInstallationView,
  type PluginRepository,
} from './services/plugin-repository'
