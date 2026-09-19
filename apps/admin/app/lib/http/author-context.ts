import type { ManagedAuthorProfile } from '@publisher/content'

/** Private authoring input returned only from authenticated operator APIs. */
export interface AuthorContext {
  readonly authorSlug: string
  readonly displayName: string
  readonly editorialPersona: string
}

export function authorContext(author: ManagedAuthorProfile): AuthorContext {
  return {
    authorSlug: author.slug,
    displayName: author.name,
    editorialPersona: author.editorialPersona,
  }
}
