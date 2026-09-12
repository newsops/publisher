import {
  authors as seedAuthors,
  posts as seedPosts,
  publication as seedPublication,
  tags as seedTags,
  type ContentSnapshot,
  type ManagedAuthorProfile,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
} from '@publisher/content'
import type { PublishDelivery } from './publisher'
import { DEFAULT_SITE_ID } from './site-catalog'

export interface LocalState {
  readonly siteId: string
  readonly posts: ManagedPost[]
  readonly tags: ManagedTaxonomyTerm[]
  readonly settings: ManagedPublicationSettings
  readonly authors: ManagedAuthorProfile[]
  readonly snapshots: Array<{
    snapshotId: string
    checksum: string
    createdAt: string
    delivery: PublishDelivery
    jobId: string
    snapshot: ContentSnapshot
  }>
}

export function initialPosts(): ManagedPost[] {
  return seedPosts.map((post) => ({
    ...post,
    id: `source-${post.sourceId}`,
    status: 'published',
    revision: 1,
    createdAt: post.updatedAt,
  }))
}

export function initialSettings(): ManagedPublicationSettings {
  return {
    ...seedPublication,
    revision: 1,
    updatedAt: new Date().toISOString(),
  }
}

export function initialAuthors(): ManagedAuthorProfile[] {
  const now = new Date().toISOString()
  return seedAuthors.map((author) => ({
    ...author,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }))
}

export function initialTags(): ManagedTaxonomyTerm[] {
  const now = new Date().toISOString()
  return seedTags.map((tag) => ({
    ...tag,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }))
}

export function initialState(): LocalState {
  return initialPayload()
}

export function initialPayload(siteId = DEFAULT_SITE_ID): LocalState {
  return {
    siteId,
    posts: initialPosts(),
    tags: initialTags(),
    settings: initialSettings(),
    authors: initialAuthors(),
    snapshots: [],
  }
}
