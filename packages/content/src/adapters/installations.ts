import { ContentValidationError } from '../editor'
import type {
  AdapterDefinition,
  AdapterInstallation,
  AdapterValidationResult,
  PublicAdapterSnapshot,
} from './contracts'
import {
  adapterIdPattern,
  adapterRegistry,
  assertJsonValue,
  definitionFor,
  isRecord,
  secretReferencePattern,
} from './registry'

export function validateAdapterInstallation(
  installation: AdapterInstallation,
  expectedSiteId?: string,
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): AdapterValidationResult<AdapterInstallation> {
  const errors: string[] = []
  if (expectedSiteId && installation.siteId !== expectedSiteId)
    errors.push('adapter installation belongs to another site')
  if (!adapterIdPattern.test(installation.adapterId))
    errors.push('adapterId is invalid')
  if (!Number.isInteger(installation.revision) || installation.revision < 1)
    errors.push('adapter revision must be a positive integer')
  if (!['disabled', 'configured', 'enabled'].includes(installation.state))
    errors.push('adapter state is invalid')
  if (!isRecord(installation.configuration))
    errors.push('adapter configuration must be an object')
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
  let definition: AdapterDefinition | undefined
  try {
    definition = definitionFor(installation.adapterId, registry)
    if (definition.version !== installation.definitionVersion)
      errors.push('adapter definition version is unsupported')
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'unknown adapter')
  }
  if (definition && isRecord(installation.configuration)) {
    const result = definition.validateConfiguration(installation.configuration)
    if (!result.ok) errors.push(...result.errors)
  }
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: installation, errors: [] }
}

export function assertValidAdapterInstallation(
  installation: AdapterInstallation,
  expectedSiteId?: string,
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): AdapterInstallation {
  const result = validateAdapterInstallation(
    installation,
    expectedSiteId,
    registry,
  )
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function validateAdapterInstallations(
  installations: readonly AdapterInstallation[],
  expectedSiteId: string,
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): AdapterValidationResult<readonly AdapterInstallation[]> {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const installation of installations) {
    if (seen.has(installation.adapterId))
      errors.push('Duplicate adapter installation: ' + installation.adapterId)
    seen.add(installation.adapterId)
    const result = validateAdapterInstallation(
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

export function createAdapterInstallation(
  siteId: string,
  adapterId: string,
  configuration: Record<string, unknown>,
  now = new Date().toISOString(),
): AdapterInstallation {
  const definition = definitionFor(adapterId, adapterRegistry)
  return assertValidAdapterInstallation(
    {
      siteId,
      adapterId,
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

export function projectPublicAdapterSnapshot(
  installations: readonly AdapterInstallation[],
  siteId: string,
  registry: ReadonlyMap<string, AdapterDefinition> = adapterRegistry,
): PublicAdapterSnapshot {
  const validated = validateAdapterInstallations(
    installations,
    siteId,
    registry,
  )
  if (!validated.ok)
    throw new ContentValidationError(validated.errors.join('; '))
  return {
    schemaVersion: 2,
    installations: installations
      .filter((installation) => installation.state === 'enabled')
      .map((installation) => {
        const definition = definitionFor(installation.adapterId, registry)
        const result = definition.validateConfiguration(
          installation.configuration,
        )
        if (!result.ok || !result.value)
          throw new ContentValidationError(result.errors.join('; '))
        return {
          adapterId: installation.adapterId,
          definitionVersion: definition.version,
          configuration: definition.projectPublicConfiguration(result.value),
        }
      }),
  }
}

export const emptyPublicAdapterSnapshot: PublicAdapterSnapshot = {
  schemaVersion: 2,
  installations: [],
}
