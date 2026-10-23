import {
  adapterRegistry,
  type AdapterInstallation,
  type AdapterInstallationState,
  type AdapterValidationResult,
} from '@publisher/content'

export interface AdapterInstallationView {
  readonly siteId: string
  readonly adapterId: string
  readonly definitionVersion: string
  readonly state: AdapterInstallationState
  readonly revision: number
  readonly configuration: Record<string, unknown>
  readonly hasSecretReferences: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AdapterRepository {
  readonly siteId: string
  list(): Promise<readonly AdapterInstallation[]>
  get(adapterId: string): Promise<AdapterInstallation | undefined>
  configure(
    adapterId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<AdapterInstallation>
  setState(
    adapterId: string,
    state: AdapterInstallationState,
    expectedRevision: number,
  ): Promise<AdapterInstallation>
  validate(
    adapterId: string,
    configuration: Record<string, unknown>,
  ): Promise<AdapterValidationResult<AdapterInstallation>>
}

export function publicAdapterInstallation(
  installation: AdapterInstallation,
): AdapterInstallationView {
  const { secretReferences: _secretReferences, ...visible } = installation
  return {
    ...visible,
    hasSecretReferences: installation.secretReferences.length > 0,
  }
}

export function knownAdapterIds(): readonly string[] {
  return [...adapterRegistry.keys()].sort()
}
