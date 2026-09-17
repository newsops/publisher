import type { ArtifactRecipe } from './release-manifest'
import type { PublicPluginSnapshot } from '@publisher/content'

export interface ArticleDocument {
  readonly id: string
  readonly path: string
  readonly slug: string
  readonly title: string
  readonly seoTitle: string
  readonly description: string
  readonly bodyHtml: string
  readonly authorName: string
  readonly authorPath: string
  readonly category: string
  readonly categoryPath: string
  readonly tags?: readonly string[]
  readonly archivePath: string
  readonly publishedAt: string
  readonly updatedAt: string
  readonly imageUrl?: string
  readonly imageAlt?: string
}

export interface PublicationProjection {
  readonly generatedAt: string
  readonly slugs: readonly string[]
  readonly source?: string
  readonly window?: string
  readonly policyApproved?: boolean
}

export interface ThemeBundle {
  readonly id: string
  readonly version: string
  readonly css: string
}

export interface MaterializedMedia {
  readonly id: string
  readonly publicPath: string
  readonly sha256: string
  readonly mimeType: string
  readonly body: Uint8Array
}

export interface PublicationInputs {
  readonly siteId: string
  readonly origin: string
  readonly publicationName: string
  readonly language: string
  readonly semanticVersion: string
  readonly runtimeVersion: string
  readonly baselineVersion: string
  readonly baselineCss?: string
  readonly articles: readonly ArticleDocument[]
  readonly recent: PublicationProjection
  readonly popular?: PublicationProjection
  readonly theme: ThemeBundle
  readonly plugins?: PublicPluginSnapshot
  readonly media?: readonly MaterializedMedia[]
  readonly comments?: Readonly<
    Record<
      string,
      readonly {
        readonly id: string
        readonly authorName: string
        readonly body: string
        readonly status: 'pending' | 'approved' | 'rejected'
        readonly createdAt: string
      }[]
    >
  >
  readonly embedApprovedComments?: boolean
  /** Public-only comment runtime configuration. No credential belongs here. */
  readonly commentRuntime?: {
    readonly origin: string
    readonly siteId: string
    readonly submissionEnabled: boolean
    readonly humanVerification?: {
      readonly siteKey: string
      readonly scriptUrl: string
      readonly globalName: string
    }
  }
}

export interface PublicationGraph {
  readonly dependencies: Readonly<Record<string, string>>
  readonly recipes: readonly ArtifactRecipe[]
}
