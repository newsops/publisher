import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertAdapterRevision as assertRevision,
  assertSiteId,
  ContentValidationError,
  configuredAdapterInstallation as configuredInstallation,
  stateAdapterInstallation as stateInstallation,
  validateAdapterInstallation,
  type AdapterInstallation,
  type AdapterInstallationState,
  type AdapterValidationResult,
} from '@publisher/content'
import type { AdapterRepository } from '../services/adapter-repository'

export class FileAdapterRepository implements AdapterRepository {
  readonly siteId: string
  private readonly filePath: string

  constructor(directory: string, siteId = 'default') {
    assertSiteId(siteId)
    this.siteId = siteId
    this.filePath =
      siteId === 'default'
        ? path.join(directory, 'adapters.json')
        : path.join(directory, 'sites', siteId, 'adapters.json')
  }

  private async read(): Promise<AdapterInstallation[]> {
    try {
      const contents = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as unknown
      if (!Array.isArray(contents))
        throw new ContentValidationError('Adapter state must be an array')
      return contents.map((installation) => {
        const result = validateAdapterInstallation(
          installation as AdapterInstallation,
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
    installations: readonly AdapterInstallation[],
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

  async list(): Promise<readonly AdapterInstallation[]> {
    return this.read()
  }

  async get(adapterId: string): Promise<AdapterInstallation | undefined> {
    return (await this.read()).find(
      (installation) => installation.adapterId === adapterId,
    )
  }

  async configure(
    adapterId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<AdapterInstallation> {
    const installations = await this.read()
    const current = installations.find(
      (installation) => installation.adapterId === adapterId,
    )
    assertRevision(current, expectedRevision)
    const next = configuredInstallation(
      this.siteId,
      adapterId,
      configuration,
      current,
    )
    await this.write([
      ...installations.filter(
        (installation) => installation.adapterId !== adapterId,
      ),
      next,
    ])
    return next
  }

  async setState(
    adapterId: string,
    state: AdapterInstallationState,
    expectedRevision: number,
  ): Promise<AdapterInstallation> {
    const installations = await this.read()
    const current = installations.find(
      (installation) => installation.adapterId === adapterId,
    )
    assertRevision(current, expectedRevision)
    if (!current)
      throw new ContentValidationError('Adapter installation not found')
    const next = stateInstallation(current, state)
    await this.write(
      installations.map((installation) =>
        installation.adapterId === adapterId ? next : installation,
      ),
    )
    return next
  }

  async validate(
    adapterId: string,
    configuration: Record<string, unknown>,
  ): Promise<AdapterValidationResult<AdapterInstallation>> {
    const current = await this.get(adapterId)
    try {
      const candidate = configuredInstallation(
        this.siteId,
        adapterId,
        configuration,
        current,
      )
      return { ok: true, value: candidate, errors: [] }
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : 'Invalid adapter'],
      }
    }
  }
}
