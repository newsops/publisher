import type { PostgresPool } from '@publisher/persistence'
import {
  assertSiteId,
  ContentValidationError,
  emptyPayload,
} from '@publisher/content'

export interface SiteConfig {
  readonly siteId: string
  readonly name: string
  readonly canonicalOrigin: string
  readonly themeId: string
  readonly active: boolean
}

export interface SiteInput {
  readonly siteId: string
  readonly name: string
  readonly canonicalOrigin: string
  readonly themeId?: string
}

export { assertSiteId } from '@publisher/content'

function validate(input: SiteInput): Required<SiteInput> {
  assertSiteId(input.siteId)
  const name = input.name.trim()
  if (!name) throw new ContentValidationError('Site name is required')
  let canonicalOrigin: string
  try {
    const parsed = new URL(input.canonicalOrigin)
    if (
      parsed.protocol !== 'https:' ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('invalid')
    canonicalOrigin = parsed.origin
  } catch {
    throw new ContentValidationError(
      'canonicalOrigin must be an HTTPS origin without a path',
    )
  }
  return {
    siteId: input.siteId,
    name,
    canonicalOrigin,
    themeId: input.themeId?.trim() || 'editorial',
  }
}

function row(value: Record<string, unknown>): SiteConfig {
  return {
    siteId: String(value.siteId),
    name: String(value.name),
    canonicalOrigin: String(value.canonicalOrigin),
    themeId: String(value.themeId),
    active: Boolean(value.active),
  }
}

export class PostgresSiteRegistry {
  constructor(private readonly pool: PostgresPool) {}

  async list(): Promise<readonly SiteConfig[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT site_id AS "siteId", name, canonical_origin AS "canonicalOrigin",
              theme_id AS "themeId", active
         FROM publisher_admin.sites WHERE active = TRUE ORDER BY created_at ASC`,
    )
    return result.rows.map(row)
  }

  async require(siteId: string): Promise<SiteConfig> {
    assertSiteId(siteId)
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT site_id AS "siteId", name, canonical_origin AS "canonicalOrigin",
              theme_id AS "themeId", active
         FROM publisher_admin.sites WHERE site_id = $1 AND active = TRUE`,
      [siteId],
    )
    const found = result.rows[0]
    if (!found) throw new ContentValidationError(`Unknown site: ${siteId}`)
    return row(found)
  }

  async create(input: SiteInput): Promise<SiteConfig> {
    const site = validate(input)
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO publisher_admin.sites (site_id, name, canonical_origin, theme_id)
       VALUES ($1, $2, $3, $4)
       RETURNING site_id AS "siteId", name, canonical_origin AS "canonicalOrigin",
                 theme_id AS "themeId", active`,
      [site.siteId, site.name, site.canonicalOrigin, site.themeId],
    )
    return row(result.rows[0]!)
  }

  async update(
    siteId: string,
    input: Omit<SiteInput, 'siteId'>,
  ): Promise<SiteConfig> {
    const site = validate({ ...input, siteId })
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE publisher_admin.sites
          SET name = $2, canonical_origin = $3, theme_id = $4, updated_at = CURRENT_TIMESTAMP
        WHERE site_id = $1 AND active = TRUE
        RETURNING site_id AS "siteId", name, canonical_origin AS "canonicalOrigin",
                  theme_id AS "themeId", active`,
      [site.siteId, site.name, site.canonicalOrigin, site.themeId],
    )
    if (!result.rows[0])
      throw new ContentValidationError(`Unknown site: ${siteId}`)
    return row(result.rows[0])
  }

  async archive(siteId: string): Promise<SiteConfig> {
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE publisher_admin.sites SET active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE site_id = $1 AND active = TRUE
        RETURNING site_id AS "siteId", name, canonical_origin AS "canonicalOrigin",
                  theme_id AS "themeId", active`,
      [siteId],
    )
    if (!result.rows[0])
      throw new ContentValidationError(`Unknown site: ${siteId}`)
    return row(result.rows[0])
  }

  async bootstrap(
    siteId: string,
  ): Promise<{ site: SiteConfig; created: boolean }> {
    const site = await this.require(siteId)
    const result = await this.pool.query(
      `INSERT INTO publisher_admin.site_states (site_id, state)
       VALUES ($1, $2::jsonb) ON CONFLICT (site_id) DO NOTHING`,
      [siteId, JSON.stringify(emptyPayload(siteId, site))],
    )
    return { site, created: result.rowCount === 1 }
  }
}
