import {
  articles as seedArticles,
  assertValidArticleLocales,
  assertValidArticleVariant,
  type ArticleVariant,
  type ManagedArticle,
} from '@publisher/content'
import {
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import type { ArticleRepository } from './article-repository'

function clone(article: ManagedArticle): ManagedArticle {
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

export class PostgresArticleRepository implements ArticleRepository {
  constructor(
    readonly siteId = 'default',
    private readonly pool: PostgresPool = postgresPool(
      process.env.DATABASE_URL ?? '',
    ),
  ) {}

  async seedCheckedInFixture(): Promise<void> {
    await runPostgresTransaction(this.pool, async (client) => {
      for (const article of initialArticles())
        await client.query(
          `INSERT INTO publisher_admin.articles
           (site_id, id, payload, revision, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           ON CONFLICT (site_id, id) DO NOTHING`,
          [
            this.siteId,
            article.id,
            JSON.stringify(article),
            article.revision,
            new Date().toISOString(),
          ],
        )
    })
  }

  async list(): Promise<readonly ManagedArticle[]> {
    return this.listUsing(this.pool)
  }

  async listUsing(
    database: PostgresQueryable,
  ): Promise<readonly ManagedArticle[]> {
    const result = await database.query<{ payload: ManagedArticle }>(
      'SELECT payload FROM publisher_admin.articles WHERE site_id = $1 ORDER BY updated_at DESC',
      [this.siteId],
    )
    return result.rows.map((row) => clone(row.payload))
  }

  async get(id: string): Promise<ManagedArticle | undefined> {
    const result = await this.pool.query<{ payload: ManagedArticle }>(
      'SELECT payload FROM publisher_admin.articles WHERE site_id = $1 AND id = $2',
      [this.siteId, id],
    )
    return result.rows[0] ? clone(result.rows[0].payload) : undefined
  }

  async saveVariant(
    id: string,
    variant: ArticleVariant,
    expectedRevision?: number,
  ): Promise<ManagedArticle> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<{ payload: ManagedArticle }>(
        `SELECT payload FROM publisher_admin.articles
         WHERE site_id = $1 AND id = $2 FOR UPDATE`,
        [this.siteId, id],
      )
      const current = result.rows[0]?.payload
      if (!current) throw new Error('Article not found')
      if (
        expectedRevision !== undefined &&
        expectedRevision !== current.revision
      )
        throw new Error('Article revision conflict')
      const validated = assertValidArticleVariant(variant)
      const previous = current.variants.find(
        (item) => item.locale === validated.locale,
      )
      const variants = [
        ...current.variants.filter((item) => item.locale !== validated.locale),
        { ...validated, revision: (previous?.revision ?? 0) + 1 },
      ]
      assertValidArticleLocales(variants)
      const next: ManagedArticle = {
        ...current,
        variants,
        revision: current.revision + 1,
      }
      await client.query(
        `UPDATE publisher_admin.articles
         SET payload = $3::jsonb, revision = $4, updated_at = $5
         WHERE site_id = $1 AND id = $2`,
        [
          this.siteId,
          id,
          JSON.stringify(next),
          next.revision,
          new Date().toISOString(),
        ],
      )
      return clone(next)
    })
  }

  async removeVariant(
    id: string,
    locale: string,
    expectedRevision?: number,
  ): Promise<ManagedArticle> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<{ payload: ManagedArticle }>(
        `SELECT payload FROM publisher_admin.articles
         WHERE site_id = $1 AND id = $2 FOR UPDATE`,
        [this.siteId, id],
      )
      const current = result.rows[0]?.payload
      if (!current) throw new Error('Article not found')
      if (
        expectedRevision !== undefined &&
        expectedRevision !== current.revision
      )
        throw new Error('Article revision conflict')
      if (current.variants.length <= 1)
        throw new Error('An article requires one variant')
      if (!current.variants.some((variant) => variant.locale === locale))
        throw new Error('Variant not found')
      const variants = current.variants.filter(
        (variant) => variant.locale !== locale,
      )
      assertValidArticleLocales(variants)
      const next: ManagedArticle = {
        ...current,
        variants,
        revision: current.revision + 1,
      }
      await client.query(
        `UPDATE publisher_admin.articles
         SET payload = $3::jsonb, revision = $4, updated_at = $5
         WHERE site_id = $1 AND id = $2`,
        [
          this.siteId,
          id,
          JSON.stringify(next),
          next.revision,
          new Date().toISOString(),
        ],
      )
      return clone(next)
    })
  }
}
