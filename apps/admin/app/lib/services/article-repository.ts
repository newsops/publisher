import type { ArticleVariant, ManagedArticle } from '@publisher/content'

export interface ArticleRepository {
  list(): Promise<readonly ManagedArticle[]>
  get(id: string): Promise<ManagedArticle | undefined>
  saveVariant(
    id: string,
    variant: ArticleVariant,
    expectedRevision?: number,
  ): Promise<ManagedArticle>
  removeVariant(
    id: string,
    locale: string,
    expectedRevision?: number,
  ): Promise<ManagedArticle>
}
