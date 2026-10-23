export const adapterCapabilities = [
  'admin-settings',
  'public-head',
  'public-slot',
] as const
export type AdapterCapability = (typeof adapterCapabilities)[number]

export const publicAdapterSlots = [
  'article-inline',
  'article-footer',
  'sidebar',
] as const
export type PublicAdapterSlot = (typeof publicAdapterSlots)[number]

export type AdapterInstallationState = 'disabled' | 'configured' | 'enabled'

export interface AdapterValidationResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly errors: readonly string[]
}

export interface AdapterProviderOrigin {
  readonly kind: 'script' | 'connect'
  readonly origin: string
}

export interface AdapterHeadToken {
  readonly kind: 'meta' | 'script'
  readonly key: string
  readonly name?: string
  readonly content?: string
  readonly src?: string
  readonly async?: boolean
}

export interface AdapterSlotToken {
  readonly slot: PublicAdapterSlot
  readonly key: string
  readonly label: string
}

export interface PublicAdapterContributions {
  readonly head: readonly AdapterHeadToken[]
  readonly slots: readonly AdapterSlotToken[]
}

export interface AdapterDefinition<
  Configuration extends Record<string, unknown> = Record<string, unknown>,
  PublicConfiguration extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string
  readonly version: string
  readonly capabilities: readonly AdapterCapability[]
  readonly providerOrigins: readonly AdapterProviderOrigin[]
  readonly platformScriptPaths?: readonly string[]
  readonly validateConfiguration: (
    configuration: unknown,
  ) => AdapterValidationResult<Configuration>
  readonly projectPublicConfiguration: (
    configuration: Configuration,
  ) => PublicConfiguration
  readonly contribute?: (
    configuration: PublicConfiguration,
  ) => PublicAdapterContributions
}

export interface AdapterInstallation {
  readonly siteId: string
  readonly adapterId: string
  readonly definitionVersion: string
  readonly state: AdapterInstallationState
  readonly revision: number
  readonly configuration: Record<string, unknown>
  readonly secretReferences: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PublicAdapterInstallation {
  readonly adapterId: string
  readonly definitionVersion: string
  readonly configuration: Record<string, unknown>
}

export interface PublicAdapterSnapshot {
  readonly schemaVersion: 2
  readonly installations: readonly PublicAdapterInstallation[]
}
