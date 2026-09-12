import {
  createCommentHandler,
  handlerDependencies,
  type CommentHandlerDependencies,
} from './app'
import type { CommentEnv } from './types'

export type WorkerCommentEnv = CommentEnv & {
  readonly COMMENTS_DATABASE_URL: string
}

function commentEnvironment(env: WorkerCommentEnv): CommentEnv {
  return {
    COMMENTS_DATABASE_URL: env.COMMENTS_DATABASE_URL,
    COMMENTS_MODERATION_TOKEN: env.COMMENTS_MODERATION_TOKEN,
    HUMAN_VERIFICATION_SECRET: env.HUMAN_VERIFICATION_SECRET,
    HUMAN_VERIFICATION_URL: env.HUMAN_VERIFICATION_URL,
    MAX_COMMENT_BODY_BYTES: env.MAX_COMMENT_BODY_BYTES,
    PUBLIC_ORIGIN: env.PUBLIC_ORIGIN,
    RATE_LIMIT_PER_IP: env.RATE_LIMIT_PER_IP,
    RATE_LIMIT_PER_THREAD: env.RATE_LIMIT_PER_THREAD,
    RATE_LIMIT_WINDOW_SECONDS: env.RATE_LIMIT_WINDOW_SECONDS,
  }
}

export function requestWithoutCallerClientIp(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete('x-client-ip')
  return new Request(request, { headers })
}

export function createWorkerCommentHandler(
  env: WorkerCommentEnv,
  dependencies = handlerDependencies(commentEnvironment(env)),
): (request: Request) => Promise<Response> {
  return createCommentHandler(dependencies)
}

export function createWorkerFetchHandler(
  env: WorkerCommentEnv,
  dependencies?: CommentHandlerDependencies,
): (request: Request) => Promise<Response> {
  const handler = createWorkerCommentHandler(env, dependencies)
  return (request: Request): Promise<Response> =>
    handler(requestWithoutCallerClientIp(request))
}

export default {
  async fetch(request: Request, env: WorkerCommentEnv): Promise<Response> {
    return createWorkerFetchHandler(env)(request)
  },
}
