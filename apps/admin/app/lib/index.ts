/**
 * Composition root (ARCH-003/ARCH-005). Routes, scripts, and HTTP helpers
 * obtain adapters only through this module; adapters receive their pool,
 * store, or directory from here and never read the environment themselves.
 */
import {
  assertSiteId,
  type DeskReviewer,
  type ManagedPost,
} from '@publisher/content'
import {
  FileBuildJobRepository,
  objectStoreFromEnvironment,
  PostgresBuildJobRepository,
  PostgresMediaRepository,
} from '@publisher/persistence'
import type { BuildJobRepository } from '@publisher/publication'
import { AccountStore, AccountStoreUnavailable } from './adapters/account-store'
import {
  PostgresAgentGuidanceRepository,
  siteGuidanceText,
} from './adapters/agent-guidance'
import {
  findArchiveRestoreOperation as findArchiveRestoreOperationWith,
  restoreArchive as restoreArchiveWith,
  type ArchiveRestoreInput,
} from './adapters/archive-restore'
import { FilePluginRepository } from './adapters/file-plugin-repository'
import {
  approveImage as approveImageWith,
  listMedia as listMediaWith,
  mediaLibraryImageFacts,
  readApprovedMediaPreview as readApprovedMediaPreviewWith,
  uploadImage as uploadImageWith,
  type MediaDependencies,
} from './adapters/media-service'
import { PostgresPluginRepository } from './adapters/postgres-plugin-repository'
import { PostgresSiteRegistry } from './adapters/site-registry'
import { adminConfig, adminDataDirectory } from './config'
import { adminPool, useFileStores } from './repository'
import {
  decideDesk as decideDeskWith,
  deskReportFor as deskReportForWith,
  type DeskDecisionInput,
  type DeskDependencies,
} from './services/desk-review'
import type { PluginRepository } from './services/plugin-repository'

export { adminConfig, adminDataDirectory } from './config'
export {
  adminPool,
  getArticleRepositoryForSite,
  getRepository,
  getRepositoryForSite,
  shouldUseIsolatedFileRepository,
  useFileStores,
  FileContentRepository,
  PostgresContentRepository,
} from './repository'
export type { ContentRepository, PublishResult } from './repository'
export { seedCheckedInPostgresFixture } from './adapters/postgres-publication'
export {
  parseAgentGuidanceInput,
  PostgresAgentGuidanceRepository,
  type AgentGuidance,
} from './adapters/agent-guidance'
export {
  deliverSnapshot,
  publicationIdempotencyKey,
  type PublishDelivery,
} from './adapters/publisher'
export {
  PostgresSiteRegistry,
  type SiteConfig,
  type SiteInput,
} from './adapters/site-registry'
export type {
  ArchiveRestoreInput,
  ArchiveRestoreMediaBinding,
  ArchiveRestoreResult,
} from './adapters/archive-restore'
export {
  AccountStore,
  AccountStoreConflict,
  AccountStoreUnavailable,
  type AccountUpdate,
  type StoredAccount,
  type StoredAccountRecord,
  type StoredCredential,
  type StoredRole,
} from './adapters/account-store'
export {
  DeskDecisionError,
  deskReviewerFor,
  parseDeskDecision,
} from './services/desk-review'
export {
  knownPluginIds,
  publicPluginInstallation,
  type PluginInstallationView,
  type PluginRepository,
} from './services/plugin-repository'

function requireProductionDatabase(): never {
  throw new Error('DATABASE_URL is required for production persistence')
}

/** Accounts and sessions; unavailable (503 at the surface) without a database. */
export function accountStore(): AccountStore {
  const pool = adminPool()
  if (!pool) throw new AccountStoreUnavailable()
  return new AccountStore(pool)
}

let siteRegistry: PostgresSiteRegistry | undefined
export function getSiteRegistry(): PostgresSiteRegistry {
  const pool = adminPool()
  if (!pool) throw new Error('DATABASE_URL is required for the site registry')
  return (siteRegistry ??= new PostgresSiteRegistry(pool))
}

let guidance: PostgresAgentGuidanceRepository | undefined
export function getAgentGuidanceRepository(): PostgresAgentGuidanceRepository {
  const pool = adminPool()
  if (!pool) throw new Error('DATABASE_URL is required for agent guidance')
  return (guidance ??= new PostgresAgentGuidanceRepository(pool))
}

function optionalGuidanceRepository() {
  return adminPool() ? getAgentGuidanceRepository() : undefined
}

/** Object store plus media metadata, or undefined when either is missing. */
export function mediaDependencies(): MediaDependencies | undefined {
  const store = objectStoreFromEnvironment()
  const databaseUrl = adminConfig().databaseUrl
  if (!store || !databaseUrl) return undefined
  return { store, repository: new PostgresMediaRepository(databaseUrl) }
}

function requireMedia(): MediaDependencies {
  const dependencies = mediaDependencies()
  if (dependencies) return dependencies
  if (!objectStoreFromEnvironment())
    throw new Error('Object storage is not configured')
  throw new Error('DATABASE_URL is required for media metadata')
}

export const uploadImage = (input: Parameters<typeof uploadImageWith>[1]) =>
  uploadImageWith(requireMedia(), input)
export const approveImage = (id: string, siteId: string) =>
  approveImageWith(requireMedia(), id, siteId)
export const listMedia = (siteId: string) =>
  listMediaWith(requireMedia(), siteId)
export const readApprovedMediaPreview = (
  id: string,
  siteId: string,
  variantSha256: string,
) => readApprovedMediaPreviewWith(requireMedia(), id, siteId, variantSha256)

function deskDependencies(): DeskDependencies {
  return {
    resolveImage: mediaLibraryImageFacts(mediaDependencies()),
    guidanceFor: (siteId) =>
      siteGuidanceText(optionalGuidanceRepository(), siteId),
  }
}

export function deskReportFor(siteId: string, post: ManagedPost) {
  return deskReportForWith(siteId, post, deskDependencies())
}

export function decideDesk(
  siteId: string,
  postId: string,
  decision: DeskDecisionInput,
  reviewer: DeskReviewer,
) {
  return decideDeskWith(siteId, postId, decision, reviewer, deskDependencies())
}

export function restoreArchive(siteId: string, input: ArchiveRestoreInput) {
  const pool = adminPool()
  if (!pool) requireProductionDatabase()
  return restoreArchiveWith(siteId, input, pool)
}

export function findArchiveRestoreOperation(siteId: string, id: string) {
  const pool = adminPool()
  return pool
    ? findArchiveRestoreOperationWith(siteId, id, pool)
    : Promise.resolve(undefined)
}

export function getPluginRepositoryForSite(siteId: string): PluginRepository {
  assertSiteId(siteId)
  if (useFileStores())
    return new FilePluginRepository(adminDataDirectory(siteId), siteId)
  const pool = adminPool()
  if (pool) return new PostgresPluginRepository(siteId, pool)
  return requireProductionDatabase()
}

export function buildJobsForSite(siteId: string): BuildJobRepository {
  assertSiteId(siteId)
  const pool = adminPool()
  if (pool) return new PostgresBuildJobRepository(pool)
  if (adminConfig().nodeEnv === 'production') requireProductionDatabase()
  return new FileBuildJobRepository(adminDataDirectory(siteId))
}
