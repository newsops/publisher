import { ContentValidationError } from '../editor'

export const pluginCapabilities = [
  'admin-settings',
  'public-head',
  'public-slot',
] as const
export type PluginCapability = (typeof pluginCapabilities)[number]

export const publicPluginSlots = [
  'article-inline',
  'article-footer',
  'sidebar',
] as const
export type PublicPluginSlot = (typeof publicPluginSlots)[number]

export type PluginInstallationState = 'disabled' | 'configured' | 'enabled'

export interface PluginValidationResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly errors: readonly string[]
}

export interface PluginProviderOrigin {
  readonly kind: 'script' | 'connect'
  readonly origin: string
}

export interface PluginHeadToken {
  readonly kind: 'meta' | 'script'
  readonly key: string
  readonly name?: string
  readonly content?: string
  readonly src?: string
  readonly async?: boolean
}

export interface PluginSlotToken {
  readonly slot: PublicPluginSlot
  readonly key: string
  readonly label: string
}

export interface PublicPluginContributions {
  readonly head: readonly PluginHeadToken[]
  readonly slots: readonly PluginSlotToken[]
}

export interface PluginDefinition<
  Configuration extends Record<string, unknown> = Record<string, unknown>,
  PublicConfiguration extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string
  readonly version: string
  readonly capabilities: readonly PluginCapability[]
  readonly providerOrigins: readonly PluginProviderOrigin[]
  readonly platformScriptPaths?: readonly string[]
  readonly validateConfiguration: (
    configuration: unknown,
  ) => PluginValidationResult<Configuration>
  readonly projectPublicConfiguration: (
    configuration: Configuration,
  ) => PublicConfiguration
  readonly contribute?: (
    configuration: PublicConfiguration,
  ) => PublicPluginContributions
}

export interface PluginInstallation {
  readonly siteId: string
  readonly pluginId: string
  readonly definitionVersion: string
  readonly state: PluginInstallationState
  readonly revision: number
  readonly configuration: Record<string, unknown>
  readonly secretReferences: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PublicPluginInstallation {
  readonly pluginId: string
  readonly definitionVersion: string
  readonly configuration: Record<string, unknown>
}

export interface PublicPluginSnapshot {
  readonly schemaVersion: 1
  readonly installations: readonly PublicPluginInstallation[]
}

const pluginIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const semanticVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const secretReferencePattern = /^[A-Z][A-Z0-9_]{2,127}$/
const allowedCapabilities = new Set<string>(pluginCapabilities)
const platformScriptPathPattern = /^\/plugin-runtime\/[a-z0-9][a-z0-9.-]*\.js$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertJsonValue(value: unknown, path = 'configuration'): void {
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
      'Invalid plugin provider origin: ' + origin,
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
      'Plugin provider origin must be an HTTPS origin: ' + origin,
    )
}

function markerConfiguration(
  configuration: unknown,
): PluginValidationResult<Record<string, unknown>> {
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

export const staticMarkerPlugin: PluginDefinition = {
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
        name: 'publisher-plugin-marker',
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
  googleAnalyticsPlugin,
  validateGoogleAnalyticsConfiguration,
} from './google-analytics'
export type { GoogleAnalyticsConfiguration } from './google-analytics'
import { googleAnalyticsPlugin } from './google-analytics'

export function createPluginRegistry(
  definitions: readonly PluginDefinition[],
): ReadonlyMap<string, PluginDefinition> {
  const registry = new Map<string, PluginDefinition>()
  for (const definition of definitions) {
    if (!pluginIdPattern.test(definition.id))
      throw new ContentValidationError('Invalid plugin ID: ' + definition.id)
    if (!semanticVersionPattern.test(definition.version))
      throw new ContentValidationError(
        'Invalid plugin version: ' + definition.id + '@' + definition.version,
      )
    if (registry.has(definition.id))
      throw new ContentValidationError('Duplicate plugin ID: ' + definition.id)
    if (definition.capabilities.length === 0)
      throw new ContentValidationError(
        'Plugin ' + definition.id + ' must declare a capability',
      )
    for (const capability of definition.capabilities)
      if (!allowedCapabilities.has(capability))
        throw new ContentValidationError(
          'Unsupported plugin capability: ' + capability,
        )
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
    const platformScripts = new Set<string>()
    for (const scriptPath of definition.platformScriptPaths ?? []) {
      if (!platformScriptPathPattern.test(scriptPath))
        throw new ContentValidationError(
          'Invalid platform plugin script path: ' + scriptPath,
        )
      if (platformScripts.has(scriptPath))
        throw new ContentValidationError(
          'Duplicate platform plugin script path: ' + scriptPath,
        )
      platformScripts.add(scriptPath)
    }
    registry.set(definition.id, definition)
  }
  return registry
}

export const pluginRegistry = createPluginRegistry([
  staticMarkerPlugin,
  googleAnalyticsPlugin,
])

function definitionFor(
  pluginId: string,
  registry: ReadonlyMap<string, PluginDefinition>,
): PluginDefinition {
  const definition = registry.get(pluginId)
  if (!definition)
    throw new ContentValidationError('Unknown plugin: ' + pluginId)
  return definition
}

export function validatePluginInstallation(
  installation: PluginInstallation,
  expectedSiteId?: string,
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): PluginValidationResult<PluginInstallation> {
  const errors: string[] = []
  if (expectedSiteId && installation.siteId !== expectedSiteId)
    errors.push('plugin installation belongs to another site')
  if (!pluginIdPattern.test(installation.pluginId))
    errors.push('pluginId is invalid')
  if (!Number.isInteger(installation.revision) || installation.revision < 1)
    errors.push('plugin revision must be a positive integer')
  if (!['disabled', 'configured', 'enabled'].includes(installation.state))
    errors.push('plugin state is invalid')
  if (!isRecord(installation.configuration))
    errors.push('plugin configuration must be an object')
  try {
    assertJsonValue(installation.configuration)
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : 'invalid configuration',
    )
  }
  for (const reference of installation.secretReferences)
    if (!secretReferencePattern.test(reference))
      errors.push('secret reference is invalid')
  if (
    new Set(installation.secretReferences).size !==
    installation.secretReferences.length
  )
    errors.push('secret references must be unique')
  let definition: PluginDefinition | undefined
  try {
    definition = definitionFor(installation.pluginId, registry)
    if (definition.version !== installation.definitionVersion)
      errors.push('plugin definition version is unsupported')
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'unknown plugin')
  }
  if (definition && isRecord(installation.configuration)) {
    const result = definition.validateConfiguration(installation.configuration)
    if (!result.ok) errors.push(...result.errors)
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: installation, errors: [] }
}

export function assertValidPluginInstallation(
  installation: PluginInstallation,
  expectedSiteId?: string,
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): PluginInstallation {
  const result = validatePluginInstallation(
    installation,
    expectedSiteId,
    registry,
  )
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function validatePluginInstallations(
  installations: readonly PluginInstallation[],
  expectedSiteId: string,
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): PluginValidationResult<readonly PluginInstallation[]> {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const installation of installations) {
    if (seen.has(installation.pluginId))
      errors.push('Duplicate plugin installation: ' + installation.pluginId)
    seen.add(installation.pluginId)
    const result = validatePluginInstallation(
      installation,
      expectedSiteId,
      registry,
    )
    if (!result.ok) errors.push(...result.errors)
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: installations, errors: [] }
}

export function createPluginInstallation(
  siteId: string,
  pluginId: string,
  configuration: Record<string, unknown>,
  now = new Date().toISOString(),
): PluginInstallation {
  const definition = definitionFor(pluginId, pluginRegistry)
  return assertValidPluginInstallation(
    {
      siteId,
      pluginId,
      definitionVersion: definition.version,
      state: 'configured',
      revision: 1,
      configuration,
      secretReferences: [],
      createdAt: now,
      updatedAt: now,
    },
    siteId,
  )
}

export function projectPublicPluginSnapshot(
  installations: readonly PluginInstallation[],
  siteId: string,
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): PublicPluginSnapshot {
  const validated = validatePluginInstallations(installations, siteId, registry)
  if (!validated.ok)
    throw new ContentValidationError(validated.errors.join('; '))
  return {
    schemaVersion: 1,
    installations: installations
      .filter((installation) => installation.state === 'enabled')
      .map((installation) => {
        const definition = definitionFor(installation.pluginId, registry)
        const result = definition.validateConfiguration(
          installation.configuration,
        )
        if (!result.ok || !result.value)
          throw new ContentValidationError(result.errors.join('; '))
        return {
          pluginId: installation.pluginId,
          definitionVersion: definition.version,
          configuration: definition.projectPublicConfiguration(result.value),
        }
      }),
  }
}

export const emptyPublicPluginSnapshot: PublicPluginSnapshot = {
  schemaVersion: 1,
  installations: [],
}

export function renderPluginContributions(
  snapshot: PublicPluginSnapshot,
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): PublicPluginContributions {
  const head: PluginHeadToken[] = []
  const slots: PluginSlotToken[] = []
  const keys = new Set<string>()
  for (const installation of snapshot.installations) {
    const definition = definitionFor(installation.pluginId, registry)
    if (definition.version !== installation.definitionVersion)
      throw new ContentValidationError(
        'plugin definition version is unsupported',
      )
    const valid = definition.validateConfiguration(installation.configuration)
    if (!valid.ok || !valid.value)
      throw new ContentValidationError(valid.errors.join('; '))
    const contribution = definition.contribute?.(
      definition.projectPublicConfiguration(valid.value),
    ) ?? { head: [], slots: [] }
    for (const token of contribution.head) {
      if (keys.has('head:' + token.key))
        throw new ContentValidationError(
          'Duplicate plugin head token: ' + token.key,
        )
      const validMeta =
        token.kind === 'meta' &&
        Boolean(token.name) &&
        typeof token.content === 'string' &&
        !token.src
      const validProviderScript =
        token.kind === 'script' &&
        Boolean(token.src) &&
        !token.name &&
        token.content === undefined &&
        typeof token.src === 'string' &&
        token.src.startsWith('https://') &&
        definition.providerOrigins.some(
          (origin) =>
            origin.kind === 'script' &&
            new URL(token.src as string).origin === origin.origin,
        )
      const validPlatformScript =
        token.kind === 'script' &&
        Boolean(token.src) &&
        !token.name &&
        token.content === undefined &&
        (definition.platformScriptPaths ?? []).includes(token.src as string)
      if (!validMeta && !validProviderScript && !validPlatformScript)
        throw new ContentValidationError(
          'Unsafe plugin head token: ' + token.key,
        )
      keys.add('head:' + token.key)
      head.push(token)
    }
    for (const token of contribution.slots) {
      if (!publicPluginSlots.includes(token.slot))
        throw new ContentValidationError(
          'Unsupported plugin slot: ' + token.slot,
        )
      if (keys.has('slot:' + token.slot + ':' + token.key))
        throw new ContentValidationError(
          'Duplicate plugin slot token: ' + token.key,
        )
      if (!token.label.trim() || token.label.length > 160)
        throw new ContentValidationError(
          'Unsafe plugin slot token: ' + token.key,
        )
      keys.add('slot:' + token.slot + ':' + token.key)
      slots.push(token)
    }
  }
  return { head, slots }
}

export function pluginProviderOrigins(
  snapshot: PublicPluginSnapshot,
  kind: PluginProviderOrigin['kind'],
  registry: ReadonlyMap<string, PluginDefinition> = pluginRegistry,
): readonly string[] {
  const origins = new Set<string>()
  for (const installation of snapshot.installations) {
    const definition = definitionFor(installation.pluginId, registry)
    const valid = definition.validateConfiguration(installation.configuration)
    if (!valid.ok || !valid.value)
      throw new ContentValidationError(valid.errors.join('; '))
    const contribution = definition.contribute?.(
      definition.projectPublicConfiguration(valid.value),
    ) ?? { head: [], slots: [] }
    if (!contribution.head.some((token) => token.kind === 'script')) continue
    for (const provider of definition.providerOrigins)
      if (provider.kind === kind) origins.add(provider.origin)
  }
  return [...origins].sort()
}
