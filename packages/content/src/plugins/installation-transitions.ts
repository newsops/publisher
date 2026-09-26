import { ContentValidationError } from '../editor'
import type { PluginInstallation, PluginInstallationState } from './index'
import { createPluginInstallation, validatePluginInstallation } from './index'

/**
 * Installation state transitions shared by every plugin repository
 * implementation: each returns a validated candidate or throws.
 */
export function assertRevision(
  current: PluginInstallation | undefined,
  expectedRevision: number | undefined,
): void {
  if (!current && expectedRevision !== undefined)
    throw new ContentValidationError('Plugin installation not found')
  if (
    current &&
    (expectedRevision === undefined || current.revision !== expectedRevision)
  )
    throw new ContentValidationError('plugin revision conflict')
}

export function configuredInstallation(
  siteId: string,
  pluginId: string,
  configuration: Record<string, unknown>,
  current: PluginInstallation | undefined,
): PluginInstallation {
  if (!current) return createPluginInstallation(siteId, pluginId, configuration)
  const candidate: PluginInstallation = {
    ...current,
    configuration,
    state: current.state === 'disabled' ? 'configured' : current.state,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  }
  const result = validatePluginInstallation(candidate, siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function stateInstallation(
  current: PluginInstallation,
  state: PluginInstallationState,
): PluginInstallation {
  const candidate: PluginInstallation = {
    ...current,
    state,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  }
  const result = validatePluginInstallation(candidate, current.siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export function clonePluginInstallations(
  source: readonly PluginInstallation[],
  destinationSiteId: string,
  approvedPluginIds: readonly string[],
): readonly PluginInstallation[] {
  const approved = new Set(approvedPluginIds)
  return source
    .filter((installation) => approved.has(installation.pluginId))
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
