import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  articleFromPost,
  articles as seedArticles,
  assertValidArticleVariant,
  assertValidArticleLocales,
  type ArticleVariant,
  type ManagedArticle,
  withCanonicalVariants,
} from '@publisher/content'
import type { ArticleRepository } from '../services/article-repository'

interface ArticleState {
  readonly articles: ManagedArticle[]
}

function cloneArticle(article: ManagedArticle): ManagedArticle {
  return {
    ...article,
    variants: article.variants.map((variant) => ({ ...variant })),
  }
}

function initialArticles(): ManagedArticle[] {
  const now = new Date().toISOString()
  return seedArticles.map((article) => ({
    ...article,
    revision: 1,
    createdAt: now,
  }))
}

export class FileArticleRepositoryAdapter implements ArticleRepository {
  private readonly filePath: string

  constructor(
    directory = process.env.ADMIN_DATA_DIR ??
      path.join(process.cwd(), '.data/admin'),
  ) {
    this.filePath = path.join(directory, 'articles.json')
  }

  private async readState(): Promise<ArticleState> {
    try {
      const value = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as ArticleState
      return {
        articles: value.articles.map((article) =>
          withCanonicalVariants(cloneArticle(article), article.id, {
            onImportError: 'lenient',
          }),
        ),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { articles: initialArticles() }
    }
  }

  private async writeState(state: ArticleState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
  }

  async list(): Promise<readonly ManagedArticle[]> {
    return (await this.readState()).articles
  }

  async get(id: string): Promise<ManagedArticle | undefined> {
    const article = (await this.readState()).articles.find(
      (item) => item.id === id,
    )
    return article ? cloneArticle(article) : undefined
  }

  async saveVariant(
    id: string,
    variant: ArticleVariant,
    expectedRevision?: number,
  ): Promise<ManagedArticle> {
    const state = await this.readState()
    const current = state.articles.find((article) => article.id === id)
    if (!current) throw new Error('Article not found')
    if (expectedRevision !== undefined && expectedRevision !== current.revision)
      throw new Error('Article revision conflict')
    const validatedVariant = assertValidArticleVariant(variant)
    const variants = current.variants.filter(
      (item) => item.locale !== variant.locale,
    )
    variants.push({
      ...validatedVariant,
      revision:
        (current.variants.find((item) => item.locale === variant.locale)
          ?.revision ?? 0) + 1,
    })
    assertValidArticleLocales(variants)
    const next: ManagedArticle = {
      ...current,
      variants,
      revision: current.revision + 1,
    }
    await this.writeState({
      articles: state.articles.map((article) =>
        article.id === id ? next : article,
      ),
    })
    return cloneArticle(next)
  }

  async removeVariant(
    id: string,
    locale: string,
    expectedRevision?: number,
  ): Promise<ManagedArticle> {
    const current = await this.get(id)
    if (!current) throw new Error('Article not found')
    if (expectedRevision !== undefined && expectedRevision !== current.revision)
      throw new Error('Article revision conflict')
    if (current.variants.length <= 1)
      throw new Error('An article requires one variant')
    if (!current.variants.some((variant) => variant.locale === locale))
      throw new Error('Variant not found')
    const next: ManagedArticle = {
      ...current,
      variants: current.variants.filter((variant) => variant.locale !== locale),
      revision: current.revision + 1,
    }
    await this.writeState({
      articles: (await this.readState()).articles.map((article) =>
        article.id === id ? next : article,
      ),
    })
    return cloneArticle(next)
  }
}
