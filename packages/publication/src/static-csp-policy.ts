import { BASELINE_CSP } from './static-policy'
import { isExactPublicOrigin } from './static-runtime-config'

function cspDirectives(value: string): Map<string, Set<string>> {
  const directives = new Map<string, Set<string>>()
  for (const part of value.split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/)
    if (!name) continue
    if (directives.has(name))
      throw new Error('Candidate CSP contains duplicate directives')
    directives.set(name, new Set(tokens))
  }
  return directives
}

function allowedPolicyOrigins(
  body: Uint8Array | undefined,
): Map<string, Set<string>> {
  const policy: unknown = body
    ? JSON.parse(new TextDecoder().decode(body))
    : undefined
  if (!policy || typeof policy !== 'object' || !('allowedOrigins' in policy))
    throw new Error('Candidate release policy requires exact allowed origins')
  const origins = policy.allowedOrigins
  if (
    !origins ||
    typeof origins !== 'object' ||
    Array.isArray(origins) ||
    Object.keys(origins).some(
      (key) => !['script', 'connect', 'frame'].includes(key),
    )
  )
    throw new Error('Candidate release policy origins are invalid')
  const result = new Map<string, Set<string>>()
  for (const [key, directive] of Object.entries({
    script: 'script-src',
    connect: 'connect-src',
    frame: 'frame-src',
  })) {
    const values: unknown = Reflect.get(origins, key)
    if (!Array.isArray(values) || !values.every(isExactPublicOrigin))
      throw new Error('Candidate release policy origins are invalid')
    result.set(directive, new Set(values))
  }
  return result
}

function isSafeCsp(
  value: string,
  allowedExtras: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const baseline = cspDirectives(BASELINE_CSP)
  if (allowedExtras.get('frame-src')?.size)
    baseline.set('frame-src', new Set(["'self'"]))
  const actual = cspDirectives(value)
  for (const [directive, tokens] of baseline) {
    const observed = actual.get(directive)
    if (!observed) return false
    for (const token of tokens) if (!observed.has(token)) return false
    for (const token of observed) {
      if (tokens.has(token)) continue
      if (!allowedExtras.get(directive)?.has(token)) return false
    }
  }
  for (const [directive, tokens] of actual) {
    if (!baseline.has(directive)) return false
    for (const token of tokens)
      if (token === '*' || token.includes('unsafe-')) return false
  }
  return true
}

export function verifyCandidateCsp(
  value: string,
  policy: Uint8Array | undefined,
): void {
  if (!isSafeCsp(value, allowedPolicyOrigins(policy)))
    throw new Error('Candidate static-host policy is missing or invalid')
}
