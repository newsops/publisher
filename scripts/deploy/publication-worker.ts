#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ContentSnapshot } from '../../packages/content/src/index'
import {
  FileSystemStaticDeployment,
  guardBuildJobTransitions,
  type ReleaseManifest,
} from '../../packages/publication/src/index'
import {
  objectStoreFromEnvironment,
  PostgresBuildJobRepository,
  postgresPool,
  type ObjectStore,
} from '../../packages/persistence/src/index'
import {
  runNextPublicationJob,
  runPublicationWorker,
  snapshotFromBytes,
} from './publication-worker-core'

export {
  publicationInputs,
  runNextPublicationJob,
  runPublicationWorker,
} from './publication-worker-core'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function loadSnapshot(store: ObjectStore): Promise<ContentSnapshot> {
  const file = argument('--snapshot-file')
  const key = argument('--snapshot-key')
  const bytes = file
    ? new Uint8Array(await readFile(file))
    : key
      ? await store.get(key)
      : (() => {
          throw new Error('Use --snapshot-file <path> or --snapshot-key <key>')
        })()
  return snapshotFromBytes(bytes)
}

async function rollback(releaseId: string): Promise<void> {
  const deploymentRoot =
    argument('--deployment-root') ?? process.env.STATIC_DEPLOYMENT_ROOT
  if (!deploymentRoot)
    throw new Error('--deployment-root or STATIC_DEPLOYMENT_ROOT is required')
  const deployment = new FileSystemStaticDeployment(deploymentRoot)
  const expectedReleaseId = await deployment.currentReleaseId()
  if (!expectedReleaseId) throw new Error('No active release to roll back')
  await deployment.verifyRelease(releaseId)
  await deployment.activate(expectedReleaseId, releaseId)
  console.log(
    JSON.stringify({
      status: 'rolled-back',
      fromReleaseId: expectedReleaseId,
      releaseId,
    }),
  )
}

async function runNext(objectStore: ObjectStore): Promise<void> {
  const deploymentRoot =
    argument('--deployment-root') ?? process.env.STATIC_DEPLOYMENT_ROOT
  if (!deploymentRoot)
    throw new Error('--deployment-root or STATIC_DEPLOYMENT_ROOT is required')
  const jobs = guardBuildJobTransitions(
    new PostgresBuildJobRepository(
      postgresPool(process.env.DATABASE_URL ?? ''),
    ),
  )
  const retryJobId = argument('--retry')
  if (retryJobId) await jobs.retry(retryJobId)
  const completed = await runNextPublicationJob({
    jobs,
    objectStore,
    deploymentRoot,
    siteId: argument('--site'),
  })
  console.log(
    completed
      ? JSON.stringify({ jobId: completed.jobId, status: completed.status })
      : JSON.stringify({ status: 'idle' }),
  )
}

async function currentManifest(): Promise<ReleaseManifest | undefined> {
  const file = argument('--current-manifest')
  return file
    ? (JSON.parse(await readFile(file, 'utf8')) as ReleaseManifest)
    : undefined
}

async function main(): Promise<void> {
  const rollbackReleaseId = argument('--rollback')
  if (rollbackReleaseId) return rollback(rollbackReleaseId)
  const objectStore = objectStoreFromEnvironment()
  if (!objectStore) throw new Error('Object storage configuration is required')
  if (process.argv.includes('--next')) return runNext(objectStore)
  const result = await runPublicationWorker({
    objectStore,
    snapshot: await loadSnapshot(objectStore),
    current: await currentManifest(),
    deploymentRoot: argument('--deployment-root'),
    activate: process.argv.includes('--activate'),
    manifestOutput: argument('--manifest-output'),
  })
  console.log(
    JSON.stringify({
      releaseId: result.manifest.releaseId,
      manifestSha256: result.manifest.sha256,
      changed: result.changed,
      metrics: result.metrics,
    }),
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
