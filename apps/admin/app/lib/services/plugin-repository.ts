import {
  pluginRegistry,
  type PluginInstallation,
  type PluginInstallationState,
  type PluginValidationResult,
} from '@publisher/content'

export interface PluginInstallationView {
  readonly siteId: string
  readonly pluginId: string
  readonly definitionVersion: string
  readonly state: PluginInstallationState
  readonly revision: number
  readonly configuration: Record<string, unknown>
  readonly hasSecretReferences: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PluginRepository {
  readonly siteId: string
  list(): Promise<readonly PluginInstallation[]>
  get(pluginId: string): Promise<PluginInstallation | undefined>
  configure(
    pluginId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<PluginInstallation>
  setState(
    pluginId: string,
    state: PluginInstallationState,
    expectedRevision: number,
  ): Promise<PluginInstallation>
  validate(
    pluginId: string,
    configuration: Record<string, unknown>,
  ): Promise<PluginValidationResult<PluginInstallation>>
}

export function publicPluginInstallation(
  installation: PluginInstallation,
): PluginInstallationView {
  const { secretReferences: _secretReferences, ...visible } = installation
  return {
    ...visible,
    hasSecretReferences: installation.secretReferences.length > 0,
  }
}

export function knownPluginIds(): readonly string[] {
  return [...pluginRegistry.keys()].sort()
}
