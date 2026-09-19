import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertPluginRevision as assertRevision,
  assertSiteId,
  ContentValidationError,
  configuredPluginInstallation as configuredInstallation,
  statePluginInstallation as stateInstallation,
  validatePluginInstallation,
  type PluginInstallation,
  type PluginInstallationState,
  type PluginValidationResult,
} from '@publisher/content'
import type { PluginRepository } from '../services/plugin-repository'

export class FilePluginRepository implements PluginRepository {
  readonly siteId: string
  private readonly filePath: string

  constructor(directory: string, siteId = 'default') {
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
