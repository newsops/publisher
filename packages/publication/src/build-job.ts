import { randomUUID } from 'node:crypto'

export type BuildJobStatus =
  'queued' | 'running' | 'verifying' | 'ready' | 'published' | 'failed'

export interface BuildJob {
  readonly jobId: string
  readonly siteId: string
  readonly snapshotId: string
  readonly snapshotChecksum: string
  readonly snapshotKey?: string
  readonly idempotencyKey: string
  readonly status: BuildJobStatus
  readonly attempts: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly failureReason?: string
}

export interface EnqueueBuildJobInput {
  readonly siteId: string
  readonly snapshotId: string
  readonly snapshotChecksum: string
  readonly snapshotKey?: string
  readonly idempotencyKey: string
}

export interface BuildJobRepository {
  enqueue(input: EnqueueBuildJobInput): Promise<BuildJob>
  get(jobId: string): Promise<BuildJob | undefined>
  findByIdempotencyKey(
    siteId: string,
    idempotencyKey: string,
  ): Promise<BuildJob | undefined>
  claimNext(siteId?: string): Promise<BuildJob | undefined>
  retry(jobId: string): Promise<BuildJob>
  transition(
    jobId: string,
    expected: BuildJobStatus,
    status: BuildJobStatus,
    failureReason?: string,
  ): Promise<BuildJob>
}

/**
 * Applies the job state machine in front of a storage adapter (ARCH-002):
 * adapters only compare-and-swap on the expected status, this wrapper
 * refuses transitions the table does not allow.
 */
export function guardBuildJobTransitions(
  repository: BuildJobRepository,
): BuildJobRepository {
  return {
    enqueue: (input) => repository.enqueue(input),
    get: (jobId) => repository.get(jobId),
    findByIdempotencyKey: (siteId, key) =>
      repository.findByIdempotencyKey(siteId, key),
    claimNext: (siteId) => repository.claimNext(siteId),
    retry: (jobId) => repository.retry(jobId),
    transition: async (jobId, expected, status, failureReason) => {
      assertBuildJobTransition(expected, status)
      return repository.transition(jobId, expected, status, failureReason)
    },
  }
}

const allowedTransitions: Readonly<
  Record<BuildJobStatus, readonly BuildJobStatus[]>
> = {
  queued: ['running', 'failed'],
  running: ['verifying', 'failed'],
  verifying: ['ready', 'failed'],
  ready: ['published', 'failed'],
  published: [],
  failed: ['queued'],
}

export function assertBuildJobTransition(
  expected: BuildJobStatus,
  status: BuildJobStatus,
): void {
  if (!allowedTransitions[expected].includes(status))
    throw new Error(`Invalid build job transition: ${expected} -> ${status}`)
}

function assertSameRequest(job: BuildJob, input: EnqueueBuildJobInput): void {
  if (
    job.siteId !== input.siteId ||
    job.snapshotId !== input.snapshotId ||
    job.snapshotChecksum !== input.snapshotChecksum ||
    job.snapshotKey !== input.snapshotKey
  )
    throw new Error('Idempotency key was already used for a different build')
}

export class InMemoryBuildJobRepository implements BuildJobRepository {
  private readonly jobs = new Map<string, BuildJob>()
  private readonly idempotency = new Map<string, string>()

  async enqueue(input: EnqueueBuildJobInput): Promise<BuildJob> {
    const key = `${input.siteId}:${input.idempotencyKey}`
    const existingId = this.idempotency.get(key)
    if (existingId) {
      const existing = this.jobs.get(existingId)!
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
    this.jobs.set(job.jobId, job)
    this.idempotency.set(key, job.jobId)
    return job
  }

  async get(jobId: string): Promise<BuildJob | undefined> {
    return this.jobs.get(jobId)
  }

  async findByIdempotencyKey(
    siteId: string,
    idempotencyKey: string,
  ): Promise<BuildJob | undefined> {
    const jobId = this.idempotency.get(`${siteId}:${idempotencyKey}`)
    return jobId ? this.jobs.get(jobId) : undefined
  }

  async claimNext(siteId?: string): Promise<BuildJob | undefined> {
    const queued = [...this.jobs.values()]
      .filter(
        (job) => job.status === 'queued' && (!siteId || job.siteId === siteId),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0]
    if (!queued) return undefined
    const claimed: BuildJob = {
      ...queued,
      status: 'running',
      attempts: queued.attempts + 1,
      updatedAt: new Date().toISOString(),
    }
    this.jobs.set(claimed.jobId, claimed)
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
    assertBuildJobTransition(expected, status)
    const current = this.jobs.get(jobId)
    if (!current) throw new Error('Build job not found')
    if (current.status !== expected)
      throw new Error('Build job status conflict')
    const next: BuildJob = {
      ...current,
      status,
      failureReason,
      updatedAt: new Date().toISOString(),
    }
    this.jobs.set(jobId, next)
    return next
  }
}
