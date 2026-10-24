import { ContentValidationError } from '../editor'
import {
  adapterCapabilities,
  type AdapterDefinition,
  type AdapterValidationResult,
} from './contracts'

export const adapterIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const semanticVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
export const secretReferencePattern = /^[A-Z][A-Z0-9_]{2,127}$/
const allowedCapabilities = new Set<string>(adapterCapabilities)
const platformScriptPathPattern = /^\/adapter-runtime\/[a-z0-9][a-z0-9.-]*\.js$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertJsonValue(value: unknown, path = 'configuration'): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, path + '[' + String(index) + ']'),
    )
    return
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor')
        throw new ContentValidationError(path + ' contains an unsafe key')
      assertJsonValue(item, path + '.' + key)
    }
    return
  }
  throw new ContentValidationError(path + ' must contain JSON-safe values only')
}

function validateOrigin(origin: string): void {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new ContentValidationError(
      'Invalid adapter provider origin: ' + origin,
    )
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.hostname.includes('*')
  )
    throw new ContentValidationError(
      'Adapter provider origin must be an HTTPS origin: ' + origin,
    )
}

function markerConfiguration(
  configuration: unknown,
): AdapterValidationResult<Record<string, unknown>> {
  if (!isRecord(configuration))
    return { ok: false, errors: ['configuration must be an object'] }
  const label = configuration.label
  if (typeof label !== 'string' || !label.trim())
    return { ok: false, errors: ['label is required'] }
  if (label.trim().length > 80)
    return { ok: false, errors: ['label must be 80 characters or fewer'] }
  if (
    Object.keys(configuration).some(
      (key) => key !== 'label' && key !== 'showInArticleFooter',
    )
  )
    return { ok: false, errors: ['configuration contains an unknown field'] }
  if (
    configuration.showInArticleFooter !== undefined &&
    typeof configuration.showInArticleFooter !== 'boolean'
  )
    return {
      ok: false,
      errors: ['showInArticleFooter must be a boolean when provided'],
    }
  return {
    ok: true,
    errors: [],
    value: {
      label: label.trim(),
      showInArticleFooter: configuration.showInArticleFooter === true,
    },
  }
}

export const staticMarkerAdapter: AdapterDefinition = {
  id: 'platform.static-marker',
  version: '1.0.0',
  capabilities: ['admin-settings', 'public-head', 'public-slot'],
  providerOrigins: [],
  validateConfiguration: markerConfiguration,
  projectPublicConfiguration: (configuration) => ({
    label: configuration.label,
    showInArticleFooter: configuration.showInArticleFooter === true,
  }),
  contribute: (configuration) => ({
    head: [
      {
        kind: 'meta',
        key: 'platform.static-marker',
        name: 'publisher-adapter-marker',
        content: String(configuration.label),
      },
    ],
    slots:
      configuration.showInArticleFooter === true
        ? [
            {
              slot: 'article-footer',
              key: 'platform.static-marker',
              label: String(configuration.label),
            },
          ]
        : [],
  }),
}

export {
  googleAnalyticsRuntimeSource,
  googleAnalyticsAdapter,
  validateGoogleAnalyticsConfiguration,
} from './google-analytics'
export type { GoogleAnalyticsConfiguration } from './google-analytics'
import { googleAnalyticsAdapter } from './google-analytics'

function assertAdapterDefinition(
  definition: AdapterDefinition,
  registry: ReadonlyMap<string, AdapterDefinition>,
): void {
  if (!adapterIdPattern.test(definition.id))
    throw new ContentValidationError('Invalid adapter ID: ' + definition.id)
  if (!semanticVersionPattern.test(definition.version))
    throw new ContentValidationError(
      'Invalid adapter version: ' + definition.id + '@' + definition.version,
    )
  if (registry.has(definition.id))
    throw new ContentValidationError('Duplicate adapter ID: ' + definition.id)
  if (definition.capabilities.length === 0)
    throw new ContentValidationError(
      'Adapter ' + definition.id + ' must declare a capability',
    )
  for (const capability of definition.capabilities)
    if (!allowedCapabilities.has(capability))
      throw new ContentValidationError(
        'Unsupported adapter capability: ' + capability,
      )
}

function assertProviderOrigins(definition: AdapterDefinition): void {
  const origins = new Set<string>()
  for (const provider of definition.providerOrigins) {
    validateOrigin(provider.origin)
    const key = provider.kind + ':' + provider.origin
    if (origins.has(key))
      throw new ContentValidationError(
        'Duplicate provider origin for ' +
          definition.id +
          ': ' +
          provider.origin,
      )
    origins.add(key)
  }
}

function assertPlatformScripts(definition: AdapterDefinition): void {
  const platformScripts = new Set<string>()
  for (const scriptPath of definition.platformScriptPaths ?? []) {
    if (!platformScriptPathPattern.test(scriptPath))
      throw new ContentValidationError(
        'Invalid platform adapter script path: ' + scriptPath,
      )
    if (platformScripts.has(scriptPath))
      throw new ContentValidationError(
        'Duplicate platform adapter script path: ' + scriptPath,
      )
    platformScripts.add(scriptPath)
  }
}

export function createAdapterRegistry(
  definitions: readonly AdapterDefinition[],
): ReadonlyMap<string, AdapterDefinition> {
  const registry = new Map<string, AdapterDefinition>()
  for (const definition of definitions) {
    assertAdapterDefinition(definition, registry)
    assertProviderOrigins(definition)
    assertPlatformScripts(definition)
    registry.set(definition.id, definition)
  }
  return registry
}

export const adapterRegistry = createAdapterRegistry([
  staticMarkerAdapter,
  googleAnalyticsAdapter,
])

export function definitionFor(
  adapterId: string,
  registry: ReadonlyMap<string, AdapterDefinition>,
): AdapterDefinition {
  const definition = registry.get(adapterId)
  if (!definition)
    throw new ContentValidationError('Unknown adapter: ' + adapterId)
  return definition
}
