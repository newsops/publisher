import type {
  CommentRecord,
  CommentStatus,
  CommentStore,
  NewComment,
  RateLimiter,
} from './types'

export class MemoryCommentStore implements CommentStore {
  private readonly comments = new Map<string, CommentRecord>()

  async listApproved(
    siteId: string,
    slug: string,
  ): Promise<readonly CommentRecord[]> {
    return [...this.comments.values()]
      .filter(
        (comment) =>
          comment.siteId === siteId &&
          comment.slug === slug &&
          comment.status === 'approved',
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async createPending(comment: NewComment): Promise<void> {
    const record: CommentRecord = {
      ...comment,
      status: 'pending',
      updatedAt: comment.createdAt,
    }
    this.comments.set(record.id, record)
  }

  async listForModeration(
    siteId = 'publication',
    status?: CommentStatus,
  ): Promise<readonly CommentRecord[]> {
    if (
      siteId === 'pending' ||
      siteId === 'approved' ||
      siteId === 'rejected'
    ) {
      status = siteId
      siteId = 'publication'
    }
    return [...this.comments.values()].filter(
      (comment) =>
        comment.siteId === siteId && (!status || comment.status === status),
    )
  }

  async setStatus(
    siteId: string,
    id: string,
    status: Exclude<CommentStatus, 'pending'>,
  ): Promise<CommentRecord | undefined> {
    const current = this.comments.get(id)
    if (!current || current.siteId !== siteId) return undefined
    const updated = { ...current, status, updatedAt: new Date().toISOString() }
    this.comments.set(id, updated)
    return updated
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >()

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const now = Date.now()
    const current = this.buckets.get(key)
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
      return true
    }
    if (current.count >= limit) return false
    current.count += 1
    return true
  }
}
