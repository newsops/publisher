export interface NewsPost {
  readonly sourceId: string
  readonly sourceUrl: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  /** Canonical, versioned editorial source. */
  readonly bodyMarkdown: string
  /** Derived, sanitized static-publication representation. */
  readonly bodyHtml: string
  readonly author: string
  readonly authorSlug: string
  readonly seoTitle: string
  readonly seoDescription: string
  readonly publishedAt: string
  readonly updatedAt: string
  readonly categories: readonly string[]
  readonly tags: readonly string[]
  readonly imageUrl: string | undefined
  readonly featured: boolean
  readonly featuredRank: number | undefined
}

export type ArticleVariantStatus =
  'draft' | 'review' | 'scheduled' | 'published'

export interface ArticleVariant {
  readonly locale: string
  readonly slug: string
  readonly title: string
  readonly excerpt: string
  readonly bodyMarkdown: string
  readonly bodyHtml: string
  readonly seoTitle: string
  readonly seoDescription: string
  readonly status: ArticleVariantStatus
  readonly revision: number
  readonly publishedAt: string
  readonly updatedAt: string
}

export interface Article {
  readonly id: string
  readonly sourceId: string
  readonly sourceUrl: string
  readonly author: string
  readonly authorSlug: string
  readonly categories: readonly string[]
  readonly tags: readonly string[]
  readonly imageUrl: string | undefined
  readonly featured: boolean
  readonly featuredRank: number | undefined
  readonly variants: readonly ArticleVariant[]
}

export interface PublicationSettings {
  readonly name: string
  readonly shortName: string
  readonly description: string
  readonly canonicalOrigin: string
  readonly language: string
  readonly locale: string
  readonly publisherName: string
  readonly themeId: string
}

export interface ManagedPublicationSettings extends PublicationSettings {
  readonly revision: number
  readonly updatedAt: string
}

export interface AuthorProfile {
  readonly slug: string
  readonly name: string
  readonly bio: string
  readonly avatarUrl: string | undefined
  readonly active: boolean
}

export interface ManagedAuthorProfile extends AuthorProfile {
  /** Private authoring guidance; never part of AuthorProfile/public snapshots. */
  readonly editorialPersona: string
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TaxonomyTerm {
  readonly slug: string
  readonly name: string
  readonly active: boolean
}

export interface ManagedTaxonomyTerm extends TaxonomyTerm {
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type ManagedCategoryTerm = ManagedTaxonomyTerm

export interface SitePage {
  readonly slug: 'about' | 'contact'
  readonly title: string
  readonly body: string
}
