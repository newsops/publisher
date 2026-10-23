import {
  assertAuthorUnassigned,
  assertUniqueFeaturedRanks,
  ContentValidationError,
  validatedAuthor,
  validatedPost,
  validatedSettings,
  validatedTag,
} from '@publisher/content'
import type { WorkspaceCommand, WorkspaceContent } from './workspace-types'

function upsertAuthor(
  data: WorkspaceContent,
  command: Extract<WorkspaceCommand, { kind: 'author.upsert' }>,
): WorkspaceContent {
  const content = data.content
  const slug = command.slug ?? command.input.slug
  const current = content.authors.find((author) => author.slug === slug)
  const author = validatedAuthor(command.slug, command.input, current)
  if (!author.active) assertAuthorUnassigned(content.posts, author.slug)
  return {
    ...data,
    content: {
      ...content,
      authors: [
        ...content.authors.filter((item) => item.slug !== author.slug),
        author,
      ],
    },
  }
}

function upsertTaxonomy(
  data: WorkspaceContent,
  command: Extract<WorkspaceCommand, { kind: 'taxonomy.upsert' }>,
): WorkspaceContent {
  const content = data.content
  const collection = command.collection
  const slug = command.slug ?? command.input.slug
  const current = content[collection].find((term) => term.slug === slug)
  const term = validatedTag(command.slug, command.input, current)
  if (
    !term.active &&
    content.posts.some((post) => post[collection].includes(term.slug))
  )
    throw new ContentValidationError('reassign posts before archiving taxonomy')
  return {
    ...data,
    content: {
      ...content,
      [collection]: [
        ...content[collection].filter((item) => item.slug !== term.slug),
        term,
      ],
    },
  }
}

function upsertPost(
  data: WorkspaceContent,
  command: Extract<WorkspaceCommand, { kind: 'post.upsert' }>,
): WorkspaceContent {
  const content = data.content
  const current = content.posts.find((post) => post.id === command.id)
  if (command.id && !current)
    throw new ContentValidationError('post does not exist')
  const post = validatedPost(
    command.id,
    current,
    command.input,
    content.categories.filter((item) => item.active).map((item) => item.slug),
    content.authors.filter((item) => item.active).map((item) => item.slug),
    content.settings.canonicalOrigin,
    content.tags.filter((item) => item.active).map((item) => item.slug),
  )
  if (!current && content.posts.some((item) => item.id === post.id))
    throw new ContentValidationError(
      'post identity already exists; supply its id to update',
    )
  const others = content.posts.filter((item) => item.id !== post.id)
  if (
    others.some(
      (item) => item.slug === post.slug || item.sourceId === post.sourceId,
    )
  )
    throw new ContentValidationError('post slug and sourceId must be unique')
  const posts = [...others, post]
  assertUniqueFeaturedRanks(posts)
  return { ...data, content: { ...content, posts } }
}

export function applyWorkspaceCommand(
  data: WorkspaceContent,
  command: WorkspaceCommand,
): WorkspaceContent {
  const content = structuredClone(data.content)
  switch (command.kind) {
    case 'guidance.update': {
      if (
        typeof command.markdown !== 'string' ||
        command.markdown.length > 20_000
      )
        throw new ContentValidationError(
          'guidance must be Markdown text of at most 20000 characters',
        )
      return { content, guidance: command.markdown }
    }
    case 'settings.update':
      return {
        ...data,
        content: {
          ...content,
          settings: validatedSettings(command.input, content.settings),
        },
      }
    case 'author.upsert':
      return upsertAuthor({ ...data, content }, command)
    case 'taxonomy.upsert':
      return upsertTaxonomy({ ...data, content }, command)
    case 'post.upsert':
      return upsertPost({ ...data, content }, command)
    default: {
      const unreachable: never = command
      throw new ContentValidationError(
        `unknown workspace command: ${unreachable}`,
      )
    }
  }
}
