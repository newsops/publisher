import { ContentValidationError } from '../editor'
import type { AdapterInstallation, AdapterInstallationState } from './index'
import { createAdapterInstallation, validateAdapterInstallation } from './index'

/**
 * Installation state transitions shared by every adapter repository
 * implementation: each returns a validated candidate or throws.
 */
export function assertRevision(
  current: AdapterInstallation | undefined,
  expectedRevision: number | undefined,
): void {
  if (!current && expectedRevision !== undefined)
    throw new ContentValidationError('Adapter installation not found')
  if (
    current &&
    (expectedRevision === undefined || current.revision !== expectedRevision)
  )
    throw new ContentValidationError('adapter revision conflict')
}

export function configuredInstallation(
  siteId: string,
  adapterId: string,
  configuration: Record<string, unknown>,
  current: AdapterInstallation | undefined,
): AdapterInstallation {
  if (!current)
    return createAdapterInstallation(siteId, adapterId, configuration)
  const candidate: AdapterInstallation = {
    ...current,
    configuration,
    state: current.state === 'disabled' ? 'configured' : current.state,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  }
  const result = validateAdapterInstallation(candidate, siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function stateInstallation(
  current: AdapterInstallation,
  state: AdapterInstallationState,
): AdapterInstallation {
  const candidate: AdapterInstallation = {
    ...current,
    state,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  }
  const result = validateAdapterInstallation(candidate, current.siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function cloneAdapterInstallations(
  source: readonly AdapterInstallation[],
  destinationSiteId: string,
  approvedAdapterIds: readonly string[],
): readonly AdapterInstallation[] {
  const approved = new Set(approvedAdapterIds)
  return source
    .filter((installation) => approved.has(installation.adapterId))
    .map((installation) => {
      const now = new Date().toISOString()
      return {
        ...installation,
        siteId: destinationSiteId,
        state: 'disabled' as const,
        revision: 1,
        secretReferences: [],
        createdAt: now,
        updatedAt: now,
      }
    })
}
