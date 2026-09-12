import {
  ContentValidationError,
  createPluginInstallation,
  validatePluginInstallation,
  type PluginInstallation,
  type PluginInstallationState,
  type PluginValidationResult,
} from '@publisher/content'
import {
  postgresPool,
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from '@publisher/persistence'
import type { PluginRepository } from './plugin-repository'
import { assertKnownSite } from './site-catalog'

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

function configured(
  siteId: string,
  pluginId: string,
  configuration: Record<string, unknown>,
  current: PluginInstallation | undefined,
): PluginInstallation {
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
    : createPluginInstallation(siteId, pluginId, configuration)
  const result = validatePluginInstallation(candidate, siteId)
  if (!result.ok || !result.value)
    throw new ContentValidationError(result.errors.join('; '))
  return result.value
}

export class PostgresPluginRepository implements PluginRepository {
  constructor(
    readonly siteId: string,
    private readonly pool: PostgresPool = postgresPool(
      process.env.DATABASE_URL ?? '',
    ),
  ) {
    assertKnownSite(siteId)
  }

  async list(): Promise<readonly PluginInstallation[]> {
    return this.listUsing(this.pool)
  }

  async listUsing(
    database: PostgresQueryable,
  ): Promise<readonly PluginInstallation[]> {
    const result = await database.query<{ payload: PluginInstallation }>(
      `SELECT payload FROM publisher_admin.plugin_installations
       WHERE site_id = $1 ORDER BY plugin_id ASC`,
      [this.siteId],
    )
    return result.rows.map((row) => {
      const validation = validatePluginInstallation(row.payload, this.siteId)
      if (!validation.ok || !validation.value)
        throw new ContentValidationError(validation.errors.join('; '))
      return validation.value
    })
  }

  async get(pluginId: string): Promise<PluginInstallation | undefined> {
    return (await this.list()).find(
      (installation) => installation.pluginId === pluginId,
    )
  }

  private async mutate(
    pluginId: string,
    expectedRevision: number | undefined,
    callback: (current: PluginInstallation | undefined) => PluginInstallation,
  ): Promise<PluginInstallation> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<{ payload: PluginInstallation }>(
        `SELECT payload FROM publisher_admin.plugin_installations
         WHERE site_id = $1 AND plugin_id = $2 FOR UPDATE`,
        [this.siteId, pluginId],
      )
      const current = result.rows[0]?.payload
      assertRevision(current, expectedRevision)
      const next = callback(current)
      await client.query(
        `INSERT INTO publisher_admin.plugin_installations
         (site_id, plugin_id, payload, revision, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (site_id, plugin_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             revision = EXCLUDED.revision,
             updated_at = EXCLUDED.updated_at`,
        [
          this.siteId,
          pluginId,
          JSON.stringify(next),
          next.revision,
          next.updatedAt,
        ],
      )
      return next
    })
  }

  configure(
    pluginId: string,
    configuration: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<PluginInstallation> {
    return this.mutate(pluginId, expectedRevision, (current) =>
      configured(this.siteId, pluginId, configuration, current),
    )
  }

  setState(
    pluginId: string,
    state: PluginInstallationState,
    expectedRevision: number,
  ): Promise<PluginInstallation> {
    return this.mutate(pluginId, expectedRevision, (current) => {
      if (!current)
        throw new ContentValidationError('Plugin installation not found')
      const candidate = {
        ...current,
        state,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      const result = validatePluginInstallation(candidate, this.siteId)
      if (!result.ok || !result.value)
        throw new ContentValidationError(result.errors.join('; '))
      return result.value
    })
  }

  async validate(
    pluginId: string,
    configuration: Record<string, unknown>,
  ): Promise<PluginValidationResult<PluginInstallation>> {
    try {
      return {
        ok: true,
        value: configured(
          this.siteId,
          pluginId,
          configuration,
          await this.get(pluginId),
        ),
        errors: [],
      }
    } catch (error) {
      return {
        ok: false,
        errors: [error instanceof Error ? error.message : 'Invalid plugin'],
      }
    }
  }
}
