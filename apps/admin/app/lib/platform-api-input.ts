import type {
  AuthorProfileInput,
  PublicationSettingsInput,
} from '@publisher/content'
import { ApiRequestError } from './api-error'
import { booleanField, objectValue, stringField } from './api-input'

const AutomationApiError = ApiRequestError

export type AuthorPatchInput = Partial<AuthorProfileInput>

function rejectUnknown(
  object: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unknown.length > 0)
    throw new AutomationApiError(
      'unknown_fields',
      `Unknown fields: ${unknown.join(', ')}`,
      400,
    )
}

export function parseSettingsInput(value: unknown): PublicationSettingsInput {
  const object = objectValue(value)
  rejectUnknown(object, [
    'name',
    'shortName',
    'description',
    'canonicalOrigin',
    'language',
    'locale',
    'publisherName',
    'themeId',
  ])
  return {
    name: stringField(object, 'name', false) ?? '',
    shortName: stringField(object, 'shortName', false) ?? '',
    description: stringField(object, 'description', false) ?? '',
    canonicalOrigin: stringField(object, 'canonicalOrigin', false) ?? '',
    language: stringField(object, 'language', false) ?? '',
    locale: stringField(object, 'locale', false) ?? '',
    publisherName: stringField(object, 'publisherName', false) ?? '',
    themeId: stringField(object, 'themeId', true) ?? 'editorial',
  }
}

export function parseAuthorInput(value: unknown): AuthorProfileInput {
  const object = objectValue(value)
  rejectUnknown(object, ['slug', 'name', 'bio', 'avatarUrl', 'active'])
  return {
    slug: stringField(object, 'slug', true),
    name: stringField(object, 'name', false) ?? '',
    bio: stringField(object, 'bio', false) ?? '',
    avatarUrl: stringField(object, 'avatarUrl', true),
    active: booleanField(object, 'active', true),
  }
}

export function parseAuthorPatch(value: unknown): AuthorPatchInput {
  const object = objectValue(value)
  rejectUnknown(object, ['name', 'bio', 'avatarUrl', 'active', 'slug'])
  const slug = stringField(object, 'slug', true)
  const name = stringField(object, 'name', true)
  const bio = stringField(object, 'bio', true)
  const avatarUrl = stringField(object, 'avatarUrl', true)
  const active = booleanField(object, 'active', true)
  return {
    ...(slug === undefined ? {} : { slug }),
    ...(name === undefined ? {} : { name }),
    ...(bio === undefined ? {} : { bio }),
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
    ...(active === undefined ? {} : { active }),
  }
}
