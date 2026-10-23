import {
  ContentValidationError,
  createAdapterInstallation,
  validateAdapterInstallation,
  type AdapterInstallation,
  type AdapterInstallationState,
  type AdapterValidationResult,
} from '@publisher/content'
import {
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import type { AdapterRepository } from '../services/adapter-repository'
import { assertSiteId } from './site-registry'

function assertRevision(
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

function configured(
  siteId: string,
  adapterId: string,
  configuration: Record<string, unknown>,
  current: AdapterInstallation | undefined,
): AdapterInstallation {
  const candidate = current
    ? {
        ...current,
        configuration,
        state:
          current.state === 'disabled'
            ? ('configured' as const)
            : current.state,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
    : createAdapterInstallation(siteId, adapterId, configuration)
  const result = validateAdapterInstallation(candidate, siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export class PostgresAdapterRepository implements AdapterRepository {
  constructor(
    readonly siteId: string,
    private readonly pool: PostgresPool,
  ) {
    assertSiteId(siteId)
  }

  async list(): Promise<readonly AdapterInstallation[]> {
    return this.listUsing(this.pool)
  }

  async listUsing(
    database: PostgresQueryable,
  ): Promise<readonly AdapterInstallation[]> {
    const result = await database.query<{ payload: AdapterInstallation }>(
      `SELECT payload FROM publisher_admin.adapter_installations
       WHERE site_id = $1 ORDER BY adapter_id ASC`,
      [this.siteId],
    )
    return result.rows.map((row) => {
      const validation = validateAdapterInstallation(row.payload, this.siteId)
      if (!validation.ok || !validation.value)
        throw new ContentValidationError(validation.errors.join('; '))
      return validation.value
    })
  }

  async get(adapterId: string): Promise<AdapterInstallation | undefined> {
    return (await this.list()).find(
      (installation) => installation.adapterId === adapterId,
    )
  }

  private async mutate(
    adapterId: string,
    expectedRevision: number | undefined,
    callback: (current: AdapterInstallation | undefined) => AdapterInstallation,
  ): Promise<AdapterInstallation> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<{ payload: AdapterInstallation }>(
        `SELECT payload FROM publisher_admin.adapter_installations
         WHERE site_id = $1 AND adapter_id = $2 FOR UPDATE`,
        [this.siteId, adapterId],
      )
      const current = result.rows[0]?.payload
      assertRevision(current, expectedRevision)
      const next = callback(current)
      await client.query(
        `INSERT INTO publisher_admin.adapter_installations
         (site_id, adapter_id, payload, revision, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (site_id, adapter_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             revision = EXCLUDED.revision,
             updated_at = EXCLUDED.updated_at`,
        [
          this.siteId,
          adapterId,
          JSON.stringify(next),
          next.revision,
          next.updatedAt,
        ],
      )
      return next
    })
  }

  configure(
    adapterId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<AdapterInstallation> {
    return this.mutate(adapterId, expectedRevision, (current) =>
      configured(this.siteId, adapterId, configuration, current),
    )
  }

  setState(
    adapterId: string,
    state: AdapterInstallationState,
    expectedRevision: number,
  ): Promise<AdapterInstallation> {
    return this.mutate(adapterId, expectedRevision, (current) => {
      if (!current)
        throw new ContentValidationError('Adapter installation not found')
      const candidate = {
        ...current,
        state,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      const result = validateAdapterInstallation(candidate, this.siteId)
      if (!result.ok || !result.value)
        throw new ContentValidationError(result.errors.join('; '))
      return result.value
    })
  }

  async validate(
    adapterId: string,
    configuration: Record<string, unknown>,
  ): Promise<AdapterValidationResult<AdapterInstallation>> {
    try {
      return {
        ok: true,
        value: configured(
          this.siteId,
          adapterId,
          configuration,
          await this.get(adapterId),
        ),
        errors: [],
      }
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : 'Invalid adapter'],
      }
    }
  }
}
