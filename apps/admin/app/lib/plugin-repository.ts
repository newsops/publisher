import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ContentValidationError,
  createPluginInstallation,
  pluginRegistry,
  type PluginInstallation,
  type PluginInstallationState,
  type PluginValidationResult,
  validatePluginInstallation,
} from '@publisher/content'
import { PostgresPluginRepository } from './postgres-plugin-repository'
import { assertSiteId } from './site-registry'

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

function shouldUseIsolatedPluginRepository(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV !== 'production' && Boolean(environment.ADMIN_DATA_DIR)
  )
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

function assertRevision(
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

function configuredInstallation(
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

function stateInstallation(
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

export class FilePluginRepository implements PluginRepository {
  readonly siteId: string
  private readonly filePath: string

  constructor(
    directory = process.env.ADMIN_DATA_DIR ??
      path.join(process.cwd(), '.data/admin'),
    siteId = 'default',
  ) {
    assertSiteId(siteId)
    this.siteId = siteId
    this.filePath =
      siteId === 'default'
        ? path.join(directory, 'plugins.json')
        : path.join(directory, 'sites', siteId, 'plugins.json')
  }

  private async read(): Promise<PluginInstallation[]> {
    try {
      const contents = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as unknown
      if (!Array.isArray(contents))
        throw new ContentValidationError('Plugin state must be an array')
      return contents.map((installation) => {
        const result = validatePluginInstallation(
          installation as PluginInstallation,
          this.siteId,
        )
        if (!result.ok || !result.value)
          throw new ContentValidationError(result.errors.join('; '))
        return result.value
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  private async write(
    installations: readonly PluginInstallation[],
  ): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = this.filePath + '.' + randomUUID() + '.tmp'
    await writeFile(
      temporary,
      JSON.stringify(installations, null, 2) + '\n',
      'utf8',
    )
    await rename(temporary, this.filePath)
  }

  async list(): Promise<readonly PluginInstallation[]> {
    return this.read()
  }

  async get(pluginId: string): Promise<PluginInstallation | undefined> {
    return (await this.read()).find(
      (installation) => installation.pluginId === pluginId,
    )
  }

  async configure(
    pluginId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<PluginInstallation> {
    const installations = await this.read()
    const current = installations.find(
      (installation) => installation.pluginId === pluginId,
    )
    assertRevision(current, expectedRevision)
    const next = configuredInstallation(
      this.siteId,
      pluginId,
      configuration,
      current,
    )
    await this.write([
      ...installations.filter(
        (installation) => installation.pluginId !== pluginId,
      ),
      next,
    ])
    return next
  }

  async setState(
    pluginId: string,
    state: PluginInstallationState,
    expectedRevision: number,
  ): Promise<PluginInstallation> {
    const installations = await this.read()
    const current = installations.find(
      (installation) => installation.pluginId === pluginId,
    )
    assertRevision(current, expectedRevision)
    if (!current)
      throw new ContentValidationError('Plugin installation not found')
    const next = stateInstallation(current, state)
    await this.write(
      installations.map((installation) =>
        installation.pluginId === pluginId ? next : installation,
      ),
    )
    return next
  }

  async validate(
    pluginId: string,
    configuration: Record<string, unknown>,
  ): Promise<PluginValidationResult<PluginInstallation>> {
    const current = await this.get(pluginId)
    try {
      const candidate = configuredInstallation(
        this.siteId,
        pluginId,
        configuration,
        current,
      )
      return { ok: true, value: candidate, errors: [] }
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : 'Invalid plugin'],
      }
    }
  }
}

export function getPluginRepositoryForSite(siteId: string): PluginRepository {
  assertSiteId(siteId)
  if (
    shouldUseIsolatedPluginRepository() ||
    (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL)
  )
    return new FilePluginRepository(undefined, siteId)
  if (process.env.DATABASE_URL) {
    return new PostgresPluginRepository(siteId)
  }
  throw new Error('DATABASE_URL is required for production persistence')
}

export function knownPluginIds(): readonly string[] {
  return [...pluginRegistry.keys()].sort()
}
