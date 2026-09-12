export type CommentStatus = 'pending' | 'approved' | 'rejected'

export interface CommentRecord {
  readonly id: string
  readonly slug: string
  readonly authorName: string
  readonly body: string
  readonly status: CommentStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface NewComment {
  readonly id: string
  readonly slug: string
  readonly authorName: string
  readonly body: string
  readonly createdAt: string
}

export interface CommentStore {
  listApproved(slug: string): Promise<readonly CommentRecord[]>
  createPending(comment: NewComment): Promise<void>
  listForModeration(status?: CommentStatus): Promise<readonly CommentRecord[]>
  setStatus(
    id: string,
    status: Exclude<CommentStatus, 'pending'>,
  ): Promise<CommentRecord | undefined>
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>
}

export interface HumanVerifier {
  verify(token: string, remoteIp: string | undefined): Promise<boolean>
}

export interface CommentEnv {
  readonly COMMENTS_DATABASE_URL?: string
  readonly HUMAN_VERIFICATION_URL?: string
  readonly HUMAN_VERIFICATION_SECRET?: string
  readonly COMMENTS_MODERATION_TOKEN?: string
  readonly PUBLIC_ORIGIN?: string
  readonly MAX_COMMENT_BODY_BYTES?: string
  readonly RATE_LIMIT_WINDOW_SECONDS?: string
  readonly RATE_LIMIT_PER_IP?: string
  readonly RATE_LIMIT_PER_THREAD?: string
}

export interface CommentCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete?(request: Request): Promise<boolean>
}
