import { postgresPool, type PostgresPool } from '@publisher/persistence'
import type {
  CommentRecord,
  CommentStatus,
  CommentStore,
  NewComment,
  RateLimiter,
} from './types'

interface CommentRow {
  readonly id: string
  readonly slug: string
  readonly author_name: string
  readonly body: string
  readonly status: CommentStatus
  readonly created_at: Date | string
  readonly updated_at: Date | string
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function mapComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    slug: row.slug,
    authorName: row.author_name,
    body: row.body,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export class PostgresCommentStore implements CommentStore {
  constructor(
    connectionString = process.env.COMMENTS_DATABASE_URL ?? '',
    private readonly pool: PostgresPool = postgresPool(connectionString),
  ) {}

  async listApproved(slug: string): Promise<readonly CommentRecord[]> {
    const result = await this.pool.query<CommentRow>(
      `SELECT id::text, slug, author_name, body, status, created_at, updated_at
       FROM publisher_comments.comments
       WHERE slug = $1 AND status = 'approved'
       ORDER BY created_at ASC`,
      [slug],
    )
    return result.rows.map(mapComment)
  }

  async createPending(comment: NewComment): Promise<void> {
    await this.pool.query(
      `INSERT INTO publisher_comments.comments
       (id, slug, author_name, body, status, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, 'pending', $5, $5)`,
      [
        comment.id,
        comment.slug,
        comment.authorName,
        comment.body,
        comment.createdAt,
      ],
    )
  }

  async listForModeration(
    status?: CommentStatus,
  ): Promise<readonly CommentRecord[]> {
    const result = status
      ? await this.pool.query<CommentRow>(
          `SELECT id::text, slug, author_name, body, status, created_at, updated_at
           FROM publisher_comments.comments WHERE status = $1
           ORDER BY created_at ASC LIMIT 100`,
          [status],
        )
      : await this.pool.query<CommentRow>(
          `SELECT id::text, slug, author_name, body, status, created_at, updated_at
           FROM publisher_comments.comments ORDER BY created_at ASC LIMIT 100`,
        )
    return result.rows.map(mapComment)
  }

  async setStatus(
    id: string,
    status: Exclude<CommentStatus, 'pending'>,
  ): Promise<CommentRecord | undefined> {
    const result = await this.pool.query<CommentRow>(
      `UPDATE publisher_comments.comments
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING id::text, slug, author_name, body, status, created_at, updated_at`,
      [id, status],
    )
    return result.rows[0] ? mapComment(result.rows[0]) : undefined
  }
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(
    connectionString = process.env.COMMENTS_DATABASE_URL ?? '',
    private readonly pool: PostgresPool = postgresPool(connectionString),
  ) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000)
    const result = await this.pool.query<{ count: number }>(
      `INSERT INTO publisher_comments.rate_limits
       (bucket_key, count, reset_at) VALUES ($1, 1, $2)
       ON CONFLICT (bucket_key) DO UPDATE SET
         count = CASE
           WHEN publisher_comments.rate_limits.reset_at <= $3 THEN 1
           ELSE publisher_comments.rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN publisher_comments.rate_limits.reset_at <= $3 THEN $2
           ELSE publisher_comments.rate_limits.reset_at
         END
       RETURNING count`,
      [key, now + windowSeconds, now],
    )
    return (result.rows[0]?.count ?? limit + 1) <= limit
  }
}
