import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  BuildJob,
  BuildJobRepository,
  BuildJobStatus,
  EnqueueBuildJobInput,
} from '@publisher/publication'
import {
  runPostgresTransaction,
  type PostgresPool,
  type PostgresQueryable,
} from './postgres'

/**
 * Build-job storage adapters (ARCH-002). They guarantee compare-and-swap on
 * the expected status only; the publication state machine is applied by
 * `guardBuildJobTransitions` from `@publisher/publication` at composition.
 */

function assertSameRequest(job: BuildJob, input: EnqueueBuildJobInput): void {
  if (
    job.siteId !== input.siteId ||
    job.snapshotId !== input.snapshotId ||
    job.snapshotChecksum !== input.snapshotChecksum ||
    job.snapshotKey !== input.snapshotKey
  )
    throw new Error('Idempotency key was already used for a different build')
}

export class PostgresBuildJobRepository implements BuildJobRepository {
  constructor(private readonly pool: PostgresPool) {}

  async enqueueUsing(
    database: PostgresQueryable,
    input: EnqueueBuildJobInput,
  ): Promise<BuildJob> {
    const result = await database.query<BuildJob>(
      `INSERT INTO publisher_admin.build_jobs
         (job_id, site_id, snapshot_id, snapshot_checksum, snapshot_key,
          idempotency_key, status, attempts)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued', 0)
         ON CONFLICT (site_id, idempotency_key) DO NOTHING
         RETURNING job_id AS "jobId", site_id AS "siteId",
                   snapshot_id AS "snapshotId",
                   snapshot_checksum AS "snapshotChecksum",
                   snapshot_key AS "snapshotKey",
                   idempotency_key AS "idempotencyKey", status, attempts,
                   created_at::text AS "createdAt", updated_at::text AS "updatedAt",
                   failure_reason AS "failureReason"`,
      [
        randomUUID(),
        input.siteId,
        input.snapshotId,
        input.snapshotChecksum,
        input.snapshotKey ?? null,
        input.idempotencyKey,
      ],
    )
    if (result.rows[0]) return result.rows[0]
    const existing = await this.findByIdempotencyKeyUsing(
      database,
      input.siteId,
      input.idempotencyKey,
    )
    if (!existing) throw new Error('Idempotent build job could not be resolved')
    assertSameRequest(existing, input)
    return existing
  }

  async enqueue(input: EnqueueBuildJobInput): Promise<BuildJob> {
    return runPostgresTransaction(this.pool, async (client) => {
      return this.enqueueUsing(client, input)
    })
  }

  async get(jobId: string): Promise<BuildJob | undefined> {
    const result = await this.pool.query<BuildJob>(
      `SELECT job_id AS "jobId", site_id AS "siteId",
              snapshot_id AS "snapshotId", snapshot_checksum AS "snapshotChecksum",
              snapshot_key AS "snapshotKey", idempotency_key AS "idempotencyKey",
              status, attempts, created_at::text AS "createdAt",
              updated_at::text AS "updatedAt", failure_reason AS "failureReason"
       FROM publisher_admin.build_jobs WHERE job_id = $1`,
      [jobId],
    )
    return result.rows[0]
  }

  async findByIdempotencyKey(
    siteId: string,
    idempotencyKey: string,
  ): Promise<BuildJob | undefined> {
    return this.findByIdempotencyKeyUsing(this.pool, siteId, idempotencyKey)
  }

  async findByIdempotencyKeyUsing(
    database: PostgresQueryable,
    siteId: string,
    idempotencyKey: string,
  ): Promise<BuildJob | undefined> {
    const result = await database.query<BuildJob>(
      `SELECT job_id AS "jobId", site_id AS "siteId",
              snapshot_id AS "snapshotId", snapshot_checksum AS "snapshotChecksum",
              snapshot_key AS "snapshotKey", idempotency_key AS "idempotencyKey",
              status, attempts, created_at::text AS "createdAt",
              updated_at::text AS "updatedAt", failure_reason AS "failureReason"
       FROM publisher_admin.build_jobs
       WHERE site_id = $1 AND idempotency_key = $2`,
      [siteId, idempotencyKey],
    )
    return result.rows[0]
  }

  async claimNext(siteId?: string): Promise<BuildJob | undefined> {
    return runPostgresTransaction(this.pool, async (client) => {
      const result = await client.query<BuildJob>(
        `WITH candidate AS (
           SELECT job_id FROM publisher_admin.build_jobs
           WHERE status = 'queued' AND ($1::text IS NULL OR site_id = $1)
           ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE publisher_admin.build_jobs AS jobs
         SET status = 'running', attempts = attempts + 1,
             updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE jobs.job_id = candidate.job_id
         RETURNING jobs.job_id AS "jobId", jobs.site_id AS "siteId",
                   jobs.snapshot_id AS "snapshotId",
                   jobs.snapshot_checksum AS "snapshotChecksum",
                   jobs.snapshot_key AS "snapshotKey",
                   jobs.idempotency_key AS "idempotencyKey", jobs.status,
                   jobs.attempts, jobs.created_at::text AS "createdAt",
                   jobs.updated_at::text AS "updatedAt",
                   jobs.failure_reason AS "failureReason"`,
        [siteId ?? null],
      )
      return result.rows[0]
    })
  }

  async retry(jobId: string): Promise<BuildJob> {
    const result = await this.pool.query<BuildJob>(
      `UPDATE publisher_admin.build_jobs
       SET status = 'queued', failure_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE job_id = $1 AND status = 'failed'
       RETURNING job_id AS "jobId", site_id AS "siteId",
                 snapshot_id AS "snapshotId", snapshot_checksum AS "snapshotChecksum",
                 snapshot_key AS "snapshotKey", idempotency_key AS "idempotencyKey",
                 status, attempts, created_at::text AS "createdAt",
                 updated_at::text AS "updatedAt", failure_reason AS "failureReason"`,
      [jobId],
    )
    if (!result.rows[0]) throw new Error('Build job retry conflict')
    return result.rows[0]
  }

  async transition(
    jobId: string,
    expected: BuildJobStatus,
    status: BuildJobStatus,
    failureReason?: string,
  ): Promise<BuildJob> {
    const result = await this.pool.query<BuildJob>(
      `UPDATE publisher_admin.build_jobs
       SET status = $3, failure_reason = $4, updated_at = CURRENT_TIMESTAMP
       WHERE job_id = $1 AND status = $2
       RETURNING job_id AS "jobId", site_id AS "siteId",
                 snapshot_id AS "snapshotId", snapshot_checksum AS "snapshotChecksum",
                 snapshot_key AS "snapshotKey", idempotency_key AS "idempotencyKey",
                 status, attempts, created_at::text AS "createdAt",
                 updated_at::text AS "updatedAt", failure_reason AS "failureReason"`,
      [jobId, expected, status, failureReason ?? null],
    )
    if (!result.rows[0]) throw new Error('Build job status conflict')
    return result.rows[0]
  }
}

export class FileBuildJobRepository implements BuildJobRepository {
  private readonly filePath: string

  constructor(directory: string) {
    this.filePath = path.join(directory, 'build-jobs.json')
  }

  private async read(): Promise<BuildJob[]> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as BuildJob[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  private async write(jobs: readonly BuildJob[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(jobs, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
  }

  async enqueue(input: EnqueueBuildJobInput): Promise<BuildJob> {
    const jobs = await this.read()
    const existing = jobs.find(
      (job) =>
        job.siteId === input.siteId &&
        job.idempotencyKey === input.idempotencyKey,
    )
    if (existing) {
      assertSameRequest(existing, input)
      return existing
    }
    const now = new Date().toISOString()
    const job: BuildJob = {
      ...input,
      jobId: randomUUID(),
      status: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.write([...jobs, job])
    return job
  }

  async get(jobId: string): Promise<BuildJob | undefined> {
    return (await this.read()).find((job) => job.jobId === jobId)
  }

  async findByIdempotencyKey(
    siteId: string,
    idempotencyKey: string,
  ): Promise<BuildJob | undefined> {
    return (await this.read()).find(
      (job) => job.siteId === siteId && job.idempotencyKey === idempotencyKey,
    )
  }

  async claimNext(siteId?: string): Promise<BuildJob | undefined> {
    const jobs = await this.read()
    const index = jobs.findIndex(
      (job) => job.status === 'queued' && (!siteId || job.siteId === siteId),
    )
    if (index < 0) return undefined
    const current = jobs[index]!
    const claimed: BuildJob = {
      ...current,
      status: 'running',
      attempts: current.attempts + 1,
      updatedAt: new Date().toISOString(),
    }
    jobs[index] = claimed
    await this.write(jobs)
    return claimed
  }

  async retry(jobId: string): Promise<BuildJob> {
    return this.transition(jobId, 'failed', 'queued')
  }

  async transition(
    jobId: string,
    expected: BuildJobStatus,
    status: BuildJobStatus,
    failureReason?: string,
  ): Promise<BuildJob> {
    const jobs = await this.read()
    const index = jobs.findIndex((job) => job.jobId === jobId)
    if (index < 0 || jobs[index]!.status !== expected)
      throw new Error('Build job status conflict')
    const next: BuildJob = {
      ...jobs[index]!,
      status,
      failureReason,
      updatedAt: new Date().toISOString(),
    }
    jobs[index] = next
    await this.write(jobs)
    return next
  }
}
