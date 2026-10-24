import { mkdtemp, rm } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace,
  openWorkspace,
} from '../../../packages/operator/src/index.ts'
import { createPrivateProtector } from '../../../packages/operator/src/adapters/private-protection.ts'
import { createRemoteSynchronizer } from '../../../packages/operator/src/core/remote-sync.ts'
import { workspaceSyncPort } from '../../../packages/operator/src/core/workspace-ports.ts'

const require = createRequire(
  new URL('../../../packages/operator/package.json', import.meta.url),
)
const age = await import(require.resolve('age-encryption'))

class FaultStore {
  objects = new Map()
  attempts = []
  version = 0
  negativeHeads = 0
  loseHeadResponse = false
  neverStoreHead = false
  async read(key) {
    const value = this.objects.get(key)
    if (value && key.endsWith('/HEAD') && this.negativeHeads-- > 0)
      return undefined
    return value && { body: value.body.slice(), etag: value.etag }
  }
  async create(key, body) {
    return this.write(key, body, null)
  }
  async replace(key, body, etag) {
    return this.write(key, body, etag)
  }
  write(key, body, expected) {
    this.attempts.push({ key, body: Buffer.from(body).toString('base64') })
    const old = this.objects.get(key)
    if (expected === null ? Boolean(old) : old?.etag !== expected)
      return { kind: 'precondition-failed' }
    if (key.endsWith('/HEAD') && this.neverStoreHead) return { kind: 'unknown' }
    const etag = String(++this.version)
    this.objects.set(key, { body: body.slice(), etag })
    if (key.endsWith('/HEAD') && this.loseHeadResponse) {
      this.loseHeadResponse = false
      return { kind: 'unknown' }
    }
    return { kind: 'stored', etag }
  }
}

async function protector() {
  const identity = await age.generateIdentity()
  const recovery = await age.generateIdentity()
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return createPrivateProtector({
    siteId: 'example',
    keyEpoch: 1,
    writerId: 'writer-one',
    writerEpoch: 1,
    identities: [identity],
    recipients: [
      await age.identityToRecipient(identity),
      await age.identityToRecipient(recovery),
    ],
    signingKey: privateKey,
    trustedWriters: [{ writerId: 'writer-one', writerEpoch: 1, publicKey }],
  })
}

function workspaceFactory(directory, workspaces) {
  return (name, reopen = false) => {
    const location = {
      path: path.join(directory, `${name}.sqlite`),
      siteId: 'example',
      writerId: 'writer-one',
    }
    const domain = reopen
      ? openWorkspace(location)
      : createWorkspace({
          ...location,
          identity: {
            name: 'Example News',
            canonicalOrigin: 'https://example.com',
            themeId: 'editorial',
          },
        })
    const workspace = workspaceSyncPort(domain)
    workspaces.push(workspace)
    return workspace
  }
}

export async function scenario(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-sync-'))
  const workspaces = []
  const codec = await protector()
  const store = new FaultStore()
  const local = workspaceFactory(directory, workspaces)
  const sync = (workspace) =>
    createRemoteSynchronizer({
      workspace,
      store,
      codec,
      namespace: 'a'.repeat(32),
      captureDestination: path.join(directory, 'capture'),
    })
  try {
    await run({ local, sync, store, codec, directory })
  } finally {
    for (const workspace of workspaces) workspace.close()
    await rm(directory, { recursive: true, force: true })
  }
}

export const edit = (workspace, id, markdown) =>
  workspace.execute({
    operationId: id,
    expectedRevision: workspace.status().currentRevision,
    command: { kind: 'guidance.update', markdown },
  })
