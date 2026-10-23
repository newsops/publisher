import { createHash } from 'node:crypto'
import type { DeskReview, ManagedPost } from '@publisher/content'
import type { WorkspaceContent } from '../core/workspace-types'
import { WorkspaceError, type WorkspaceErrorCode } from '../contracts/errors'

export function sqliteFailure(
  code: WorkspaceErrorCode,
  message: string,
): WorkspaceError {
  return new WorkspaceError(code, message)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => typeof value[field] === 'string')
}

function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function settings(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, [
      'name',
      'shortName',
      'description',
      'canonicalOrigin',
      'language',
      'locale',
      'publisherName',
      'themeId',
      'updatedAt',
    ]) &&
    revision(value.revision)
  )
}

function authors(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (author) =>
        record(author) &&
        strings(author, [
          'slug',
          'name',
          'bio',
          'editorialPersona',
          'createdAt',
          'updatedAt',
        ]) &&
        typeof author.active === 'boolean' &&
        revision(author.revision) &&
        (author.avatarUrl === undefined ||
          typeof author.avatarUrl === 'string'),
    )
  )
}

function taxonomy(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (term) =>
        record(term) &&
        strings(term, ['slug', 'name', 'createdAt', 'updatedAt']) &&
        typeof term.active === 'boolean' &&
        revision(term.revision),
    )
  )
}

function deskReview(value: unknown): value is DeskReview {
  if (!record(value) || !strings(value, ['contentFingerprint', 'reviewedAt']))
    return false
  if (
    value.status !== 'pending' &&
    value.status !== 'approved' &&
    value.status !== 'changes_requested'
  )
    return false
  if (!record(value.reviewer) || typeof value.reviewer.id !== 'string')
    return false
  if (
    value.reviewer.kind !== 'account' &&
    value.reviewer.kind !== 'automation' &&
    value.reviewer.kind !== 'fixture' &&
    value.reviewer.kind !== 'upgrade'
  )
    return false
  if (value.note !== undefined && typeof value.note !== 'string') return false
  return (
    Array.isArray(value.checklist) &&
    value.checklist.every(
      (item) =>
        record(item) &&
        typeof item.id === 'string' &&
        typeof item.checked === 'boolean' &&
        (item.note === undefined || typeof item.note === 'string'),
    )
  )
}

function post(value: unknown): value is ManagedPost {
  if (
    !record(value) ||
    !strings(value, [
      'id',
      'sourceId',
      'sourceUrl',
      'slug',
      'title',
      'excerpt',
      'bodyMarkdown',
      'bodyHtml',
      'author',
      'authorSlug',
      'seoTitle',
      'seoDescription',
      'publishedAt',
      'updatedAt',
      'createdAt',
    ])
  )
    return false
  if (
    !revision(value.revision) ||
    !stringArray(value.categories) ||
    !stringArray(value.tags)
  )
    return false
  if (
    value.status !== 'draft' &&
    value.status !== 'review' &&
    value.status !== 'scheduled' &&
    value.status !== 'published'
  )
    return false
  if (
    typeof value.featured !== 'boolean' ||
    (value.featuredRank !== undefined && !revision(value.featuredRank))
  )
    return false
  if (value.imageUrl !== undefined && typeof value.imageUrl !== 'string')
    return false
  return value.deskReview === undefined || deskReview(value.deskReview)
}

function isWorkspaceContent(value: unknown): value is WorkspaceContent {
  if (
    !record(value) ||
    typeof value.guidance !== 'string' ||
    !record(value.content)
  )
    return false
  const content = value.content
  if (
    typeof content.siteId !== 'string' ||
    !Array.isArray(content.posts) ||
    !content.posts.every(post)
  )
    return false
  return (
    settings(content.settings) &&
    authors(content.authors) &&
    taxonomy(content.tags) &&
    taxonomy(content.categories) &&
    Array.isArray(content.snapshots) &&
    content.snapshots.length === 0
  )
}

export function encodeContent(data: WorkspaceContent): {
  payload: string
  digest: string
} {
  const payload = JSON.stringify(data)
  return { payload, digest: createHash('sha256').update(payload).digest('hex') }
}

export function decodeContent(
  payload: unknown,
  digest: unknown,
): WorkspaceContent {
  if (
    typeof payload !== 'string' ||
    typeof digest !== 'string' ||
    createHash('sha256').update(payload).digest('hex') !== digest
  )
    throw sqliteFailure('CORRUPT', 'corrupt workspace content checksum')
  const value: unknown = JSON.parse(payload)
  if (!isWorkspaceContent(value))
    throw sqliteFailure('CORRUPT', 'corrupt workspace content schema')
  return value
}

export function rowString(value: unknown): string {
  if (typeof value !== 'string')
    throw sqliteFailure('CORRUPT', 'corrupt SQLite text field')
  return value
}

export function rowRevision(value: unknown): number {
  if (!revision(value))
    throw sqliteFailure('CORRUPT', 'corrupt SQLite revision field')
  return value
}
