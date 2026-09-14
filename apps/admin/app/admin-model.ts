export type EditorialStatus = 'draft' | 'review' | 'scheduled' | 'published'

export interface AdminPost {
  id: string
  sourceId: string
  title: string
  slug: string
  excerpt: string
  bodyHtml: string
  author: string
  authorSlug: string
  seoTitle: string
  seoDescription: string
  publishedAt: string
  categories: string[]
  imageUrl?: string
  featured: boolean
  featuredRank?: number
  status: EditorialStatus
  revision: number
}

export type VariantStatus = EditorialStatus

export interface AdminArticleVariant {
  locale: string
  slug: string
  title: string
  excerpt: string
  bodyHtml: string
  seoTitle: string
  seoDescription: string
  status: VariantStatus
  revision: number
  publishedAt: string
  updatedAt: string
}

export interface AdminArticle {
  id: string
  sourceId: string
  author: string
  authorSlug: string
  categories: string[]
  variants: AdminArticleVariant[]
  revision: number
}

export interface AdminTag {
  slug: string
  name: string
  active: boolean
  revision: number
}

export interface AdminAuthor {
  slug: string
  name: string
  bio: string
  avatarUrl?: string
  active: boolean
  revision: number
}

export interface AdminSettings {
  name: string
  shortName: string
  description: string
  canonicalOrigin: string
  language: string
  locale: string
  publisherName: string
  themeId: string
  revision: number
}

export interface AdminAgentGuidance {
  instructions: string
  revision: number
  updatedAt?: string
}

export const emptyAgentGuidance: AdminAgentGuidance = {
  instructions: '',
  revision: 0,
}

export interface AdminPlugin {
  siteId: string
  pluginId: string
  definitionVersion: string
  state: 'disabled' | 'configured' | 'enabled'
  revision: number
  configuration: Record<string, unknown>
  hasSecretReferences: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminMediaVariant {
  publicPath: string
  sha256: string
  mimeType: string
  byteSize: number
  width: number
  height: number
}

export interface AdminMedia {
  id: string
  siteId: string
  sha256: string
  mimeType: string
  byteSize: number
  width: number
  height: number
  state: 'pending' | 'approved' | 'rejected'
  variants: AdminMediaVariant[]
}

export const emptySettings: AdminSettings = {
  name: 'Publication',
  shortName: 'Publication',
  description: '',
  canonicalOrigin: 'https://example.com',
  language: 'en',
  locale: 'en-US',
  publisherName: 'Publication',
  themeId: 'editorial',
  revision: 0,
}

export function blankPost(author?: AdminAuthor): AdminPost {
  return {
    id: '',
    sourceId: '',
    title: '',
    slug: '',
    excerpt: '',
    bodyHtml: '',
    author: author?.name ?? '',
    authorSlug: author?.slug ?? '',
    seoTitle: '',
    seoDescription: '',
    publishedAt: new Date().toISOString(),
    categories: [],
    featured: false,
    featuredRank: undefined,
    status: 'draft',
    revision: 0,
  }
}
