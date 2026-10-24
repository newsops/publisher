import { ContentValidationError } from '../editor'
import {
  publicAdapterSlots,
  type AdapterDefinition,
  type AdapterHeadToken,
  type AdapterProviderOrigin,
  type AdapterSlotToken,
  type PublicAdapterContributions,
  type PublicAdapterInstallation,
  type PublicAdapterSnapshot,
} from './contracts'
import { adapterRegistry, definitionFor } from './registry'

function allowedScriptToken(
  token: AdapterHeadToken,
  definition: AdapterDefinition,
): boolean {
  const src = token.src
  if (
    token.kind !== 'script' ||
    !src ||
    token.name ||
    token.content !== undefined ||
    typeof src !== 'string'
  )
    return false
  const declaredProvider =
    src.startsWith('https://') &&
    definition.providerOrigins.some(
      (origin) =>
        origin.kind === 'script' && new URL(src).origin === origin.origin,
    )
  return (
    declaredProvider || (definition.platformScriptPaths ?? []).includes(src)
  )
}

function assertHeadToken(
  token: AdapterHeadToken,
  definition: AdapterDefinition,
  keys: ReadonlySet<string>,
): void {
  if (keys.has('head:' + token.key))
    throw new ContentValidationError(
      'Duplicate adapter head token: ' + token.key,
    )
  const validMeta =
    token.kind === 'meta' &&
    Boolean(token.name) &&
    typeof token.content === 'string' &&
    !token.src
  if (!validMeta && !allowedScriptToken(token, definition))
    throw new ContentValidationError('Unsafe adapter head token: ' + token.key)
}

function assertSlotToken(
  token: AdapterSlotToken,
  keys: ReadonlySet<string>,
): void {
  if (!publicAdapterSlots.includes(token.slot))
    throw new ContentValidationError('Unsupported adapter slot: ' + token.slot)
  if (keys.has('slot:' + token.slot + ':' + token.key))
    throw new ContentValidationError(
      'Duplicate adapter slot token: ' + token.key,
    )
  if (!token.label.trim() || token.label.length > 160)
    throw new ContentValidationError('Unsafe adapter slot token: ' + token.key)
}

function installationContribution(
  installation: PublicAdapterInstallation,
  registry: ReadonlyMap<string, AdapterDefinition>,
): { definition: AdapterDefinition; contribution: PublicAdapterContributions } {
  const definition = definitionFor(installation.adapterId, registry)
  if (definition.version !== installation.definitionVersion)
    throw new ContentValidationError(
      'adapter definition version is unsupported',
    )
  const valid = definition.validateConfiguration(installation.configuration)
  if (!valid.ok || !valid.value)
    throw new ContentValidationError(valid.errors.join('; '))
  const contribution = definition.contribute?.(
    definition.projectPublicConfiguration(valid.value),
  ) ?? { head: [], slots: [] }
  return { definition, contribution }
}

export function renderAdapterContributions(
  snapshot: PublicAdapterSnapshot,
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): PublicAdapterContributions {
  if (snapshot.schemaVersion !== 2)
    throw new ContentValidationError(
      'Unsupported public adapter snapshot version',
    )
  const head: AdapterHeadToken[] = []
  const slots: AdapterSlotToken[] = []
  const keys = new Set<string>()
  for (const installation of snapshot.installations) {
    const { definition, contribution } = installationContribution(
      installation,
      registry,
    )
    for (const token of contribution.head) {
      assertHeadToken(token, definition, keys)
      keys.add('head:' + token.key)
      head.push(token)
    }
    for (const token of contribution.slots) {
      assertSlotToken(token, keys)
      keys.add('slot:' + token.slot + ':' + token.key)
      slots.push(token)
    }
  }
  return { head, slots }
}

export function adapterProviderOrigins(
  snapshot: PublicAdapterSnapshot,
  kind: AdapterProviderOrigin['kind'],
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): readonly string[] {
  const origins = new Set<string>()
  for (const installation of snapshot.installations) {
    const definition = definitionFor(installation.adapterId, registry)
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
