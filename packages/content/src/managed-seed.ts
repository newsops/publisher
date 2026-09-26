import {
  authors as seedAuthors,
  deskFixtureApproval,
  posts as seedPosts,
  publication as seedPublication,
  tags as seedTags,
  type ContentSnapshot,
  type ManagedAuthorProfile,
  type ManagedPost,
  type ManagedPublicationSettings,
  type ManagedTaxonomyTerm,
} from './index'
import type { PublishDelivery } from './content-release'
const DEFAULT_SITE_ID = 'default'

// A generic starter set; an operator creates their own categories in admin.
const FIRST_LEVEL_CATEGORIES: Readonly<
  Record<string, readonly [string, string][]>
> = {
  default: [
    ['news', 'News'],
    ['technology', 'Technology'],
    ['business', 'Business'],
    ['culture', 'Culture'],
    ['opinion', 'Opinion'],
  ],
}

export interface LocalState {
  readonly siteId: string
  readonly posts: ManagedPost[]
  readonly tags: ManagedTaxonomyTerm[]
  readonly categories: ManagedTaxonomyTerm[]
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
    // The generic starter fixture is desk-approved as shipped so a fresh
    // installation can publish; any edit invalidates this approval.
    deskReview: deskFixtureApproval(post, undefined, post.updatedAt),
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
    editorialPersona: '',
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

export function initialCategories(
  siteId = DEFAULT_SITE_ID,
): ManagedTaxonomyTerm[] {
  const now = new Date().toISOString()
  const named = FIRST_LEVEL_CATEGORIES[siteId] ?? []
  return [...named, ['General', 'General']].map(([slug, name]) => ({
    slug,
    name,
    active: true,
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
    categories: initialCategories(siteId),
    settings: initialSettings(),
    authors: initialAuthors(),
    snapshots: [],
  }
}

export function emptyPayload(
  siteId: string,
  identity: {
    readonly name: string
    readonly canonicalOrigin: string
    readonly themeId: string
  },
): LocalState {
  const now = new Date().toISOString()
  return {
    siteId,
    posts: [],
    tags: [],
    categories: [],
    authors: [],
    settings: {
      name: identity.name,
      shortName: identity.name,
      description: '',
      canonicalOrigin: identity.canonicalOrigin,
      language: 'en',
      locale: 'en-US',
      publisherName: identity.name,
      themeId: identity.themeId,
      revision: 1,
      updatedAt: now,
    },
    snapshots: [],
  }
}
