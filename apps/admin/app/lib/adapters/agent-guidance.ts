import { ContentValidationError } from '@publisher/content'
import type { PostgresPool } from '@publisher/persistence'
import { assertSiteId } from './site-registry'

export interface AgentGuidance {
  readonly instructions: string
  readonly revision: number
  readonly updatedAt: string
}

function normalized(value: unknown): string {
  if (typeof value !== 'string')
    throw new ContentValidationError('instructions must be a string')
  const instructions = value.trim()
  if (instructions.length > 12_000)
    throw new ContentValidationError(
      'instructions must be at most 12000 characters',
    )
  return instructions
}

function row(value: Record<string, unknown>): AgentGuidance {
  return {
    instructions: String(value.instructions),
    revision: Number(value.revision),
    updatedAt: new Date(String(value.updatedAt)).toISOString(),
  }
}

export class PostgresAgentGuidanceRepository {
  constructor(private readonly pool: PostgresPool) {}

  async get(siteId: string): Promise<AgentGuidance> {
    assertSiteId(siteId)
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO publisher_admin.site_agent_guidance (site_id) VALUES ($1)
       ON CONFLICT (site_id) DO UPDATE SET site_id = EXCLUDED.site_id
       RETURNING instructions, revision, updated_at AS "updatedAt"`,
      [siteId],
    )
    return row(result.rows[0]!)
  }

  async update(
    siteId: string,
    instructionsValue: unknown,
    revision: number,
  ): Promise<AgentGuidance> {
    assertSiteId(siteId)
    const instructions = normalized(instructionsValue)
    const result = await this.pool.query<Record<string, unknown>>(
      `UPDATE publisher_admin.site_agent_guidance
          SET instructions = $2, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE site_id = $1 AND revision = $3
        RETURNING instructions, revision, updated_at AS "updatedAt"`,
      [siteId, instructions, revision],
    )
    if (!result.rows[0])
      throw new ContentValidationError(
        'Agent guidance changed; reload before updating',
      )
    return row(result.rows[0])
  }
}

export function parseAgentGuidanceInput(value: unknown): string {
  if (!value || typeof value !== 'object')
    throw new ContentValidationError('Guidance input is required')
  return normalized((value as { instructions?: unknown }).instructions)
}

/** Guidance text for desk reports; absent without a repository. */
export async function siteGuidanceText(
  repository: PostgresAgentGuidanceRepository | undefined,
  siteId: string,
): Promise<string | undefined> {
  if (!repository) return undefined
  try {
    const guidance = await repository.get(siteId)
    return guidance.instructions || undefined
  } catch {
    return undefined
  }
}
