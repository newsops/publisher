import { ContentValidationError } from './editor'

export function fail(message: string): never {
  throw new ContentValidationError(`Invalid archive: ${message}`)
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`)
  return value as Record<string, unknown>
}

export function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be text`)
  return value.trim()
}

export function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`)
  return value
}

export function relativeAsset(value: unknown, label: string): string {
  const assetPath = string(value, label)
  if (
    assetPath.startsWith('/') ||
    assetPath.includes('\\') ||
    assetPath
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  )
    fail(`${label} must be a relative non-traversing path`)
  return assetPath
}

function bodyMediaReferences(bodyHtml: string): readonly string[] {
  const references = new Set<string>()
  for (const match of bodyHtml.matchAll(
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  )) {
    const reference = match[1]
    if (reference.startsWith('/media/')) references.add(reference)
  }
  return [...references]
}

function assertBodyMediaReference(reference: string, label: string): void {
  if (
    !reference.startsWith('/media/') ||
    reference.startsWith('//') ||
    reference.includes('\\') ||
    reference.includes('?') ||
    reference.includes('#') ||
    reference
      .slice(1)
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  )
    fail(`${label} key must be a root-relative media path`)
}

export function bodyMediaAssets(
  value: unknown,
  bodyHtml: string,
  mediaPaths: ReadonlySet<string>,
  label: string,
): Readonly<Record<string, string>> | undefined {
  const references = bodyMediaReferences(bodyHtml)
  if (value === undefined) {
    if (references.length > 0)
      fail(`${label} is required for body media references`)
    return undefined
  }
  const bindings = record(value, label)
  const normalized: Record<string, string> = {}
  for (const [reference, asset] of Object.entries(bindings)) {
    assertBodyMediaReference(reference, label)
    if (!references.includes(reference))
      fail(`${label} key must occur in bodyHtml`)
    const assetPath = relativeAsset(asset, `${label}.${reference}`)
    if (!mediaPaths.has(assetPath))
      fail(`${label}.${reference} references unknown media`)
    normalized[reference] = assetPath
  }
  for (const reference of references) {
    if (!Object.hasOwn(normalized, reference))
      fail(`${label} must bind every body media reference`)
  }
  return normalized
}

export function safeHttpsOrigin(value: unknown): string {
  const origin = string(value, 'settings.canonicalOrigin')
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    fail('settings.canonicalOrigin must be a URL')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    fail('settings.canonicalOrigin must be a credential-free HTTPS origin')
  return parsed.origin
}

export function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`)
}

export function safeText(value: unknown, label: string): string {
  const result = string(value, label)
  if (
    /fixture-secret-sentinel|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(result)
  )
    fail(`${label} contains a secret sentinel`)
  return result
}
