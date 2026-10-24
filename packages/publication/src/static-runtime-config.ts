import type { PublicationInputs } from './static-types'

function publicUrl(value: string, field: string): URL {
  if (typeof value !== 'string')
    throw new Error(`${field} requires a public URL string`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${field} requires an absolute public URL`)
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash ||
    value.includes('*') ||
    /[\s\\]/.test(value)
  )
    throw new Error(
      `${field} requires a credential-free HTTPS URL or loopback HTTP URL`,
    )
  return url
}

function exactOrigin(value: string, field: string): void {
  const url = publicUrl(value, field)
  if (value !== url.origin)
    throw new Error(`${field} requires an exact origin without a path or query`)
}

export function isExactPublicOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    exactOrigin(value, 'public origin')
    return true
  } catch {
    return false
  }
}

function origins(values: readonly string[], field: string): void {
  if (!Array.isArray(values))
    throw new Error(
      `${field} requires an explicit origin array (empty is allowed)`,
    )
  for (const value of values) exactOrigin(value, field)
}

export function validateCommentRuntime(input: PublicationInputs): void {
  const runtime = input.commentRuntime
  if (!runtime) return
  exactOrigin(runtime.origin, 'comment origin')
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runtime.siteId))
    throw new Error('comment siteId is invalid')
  if (typeof runtime.submissionEnabled !== 'boolean')
    throw new Error('comment submissionEnabled must be boolean')
  const verification = runtime.humanVerification
  if (!verification) {
    if (runtime.submissionEnabled)
      throw new Error(
        'comment submission requires human verification configuration',
      )
    return
  }
  publicUrl(verification.scriptUrl, 'verification script URL')
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(verification.globalName))
    throw new Error(
      'verification globalName must be a browser global identifier',
    )
  if (!verification.siteKey?.trim() || verification.siteKey.length > 256)
    throw new Error('verification siteKey must be a nonempty public key')
  origins(verification.frameOrigins, 'verification frame origins')
  origins(verification.connectOrigins, 'verification connect origins')
}

export function commentRuntimeOrigins(input: PublicationInputs): {
  readonly script: readonly string[]
  readonly frame: readonly string[]
  readonly connect: readonly string[]
} {
  const runtime = input.commentRuntime
  const verification = runtime?.submissionEnabled
    ? runtime.humanVerification
    : undefined
  return {
    script: verification ? [new URL(verification.scriptUrl).origin] : [],
    frame: verification?.frameOrigins ?? [],
    connect: [
      ...(runtime ? [runtime.origin] : []),
      ...(verification?.connectOrigins ?? []),
    ],
  }
}
