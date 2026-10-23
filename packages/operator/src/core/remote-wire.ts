import { Buffer } from 'node:buffer'
import type {
  PreparedRemoteCommit,
  RemoteCommit,
  RemoteHead,
  RemoteIntent,
} from './remote-contract'

type JsonObject = Record<string, unknown>
const opaque = /^[a-f0-9]{32}$/
const digest = /^[a-f0-9]{64}$/
const operation = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid private protocol record')
  return value as JsonObject
}
function exact(value: JsonObject, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    throw new Error('Invalid private protocol fields')
  if (value.schema !== 1) throw new Error('Unsupported private protocol schema')
}
function text(value: unknown, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    (pattern && !pattern.test(value))
  )
    throw new Error('Invalid private protocol string')
  return value
}
function integer(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new Error('Invalid private protocol integer')
  return value
}
const nullableId = (value: unknown) =>
  value === null ? null : text(value, opaque)
export const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value))
export const encodeBody = (value: Uint8Array) =>
  Buffer.from(value).toString('base64')
export function decodeBody(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > 128 * 1024 * 1024)
    throw new Error('Invalid prepared ciphertext size')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value)
    throw new Error('Invalid prepared ciphertext encoding')
  return new Uint8Array(bytes)
}
export function decodeJson(bytes: Uint8Array): unknown {
  if (bytes.length > 32 * 1024)
    throw new Error('Private protocol record exceeds size limit')
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

export function parseHead(input: unknown): RemoteHead {
  const value = object(input)
  exact(value, [
    'schema',
    'headId',
    'commitId',
    'operationId',
    'capturedRevision',
    'sequence',
    'parentHeadId',
  ])
  const result: RemoteHead = {
    schema: 1,
    headId: text(value.headId, opaque),
    commitId: text(value.commitId, opaque),
    operationId: text(value.operationId, operation),
    capturedRevision: integer(value.capturedRevision),
    sequence: integer(value.sequence, 1),
    parentHeadId: nullableId(value.parentHeadId),
  }
  if ((result.sequence === 1) !== (result.parentHeadId === null))
    throw new Error('Invalid private history genesis')
  return result
}

export function parseCommit(input: unknown): RemoteCommit {
  const value = object(input)
  exact(value, [
    'schema',
    'commitId',
    'operationId',
    'capturedRevision',
    'sequence',
    'parentCommitId',
    'snapshotId',
    'snapshotDigest',
  ])
  const result: RemoteCommit = {
    schema: 1,
    commitId: text(value.commitId, opaque),
    operationId: text(value.operationId, operation),
    capturedRevision: integer(value.capturedRevision),
    sequence: integer(value.sequence, 1),
    parentCommitId: nullableId(value.parentCommitId),
    snapshotId: text(value.snapshotId, opaque),
    snapshotDigest: text(value.snapshotDigest, digest),
  }
  if ((result.sequence === 1) !== (result.parentCommitId === null))
    throw new Error('Invalid private commit genesis')
  return result
}

export function parseIntent(input: string): RemoteIntent {
  if (input.length > 64 * 1024)
    throw new Error('Private intent exceeds size limit')
  const value = object(JSON.parse(input))
  exact(value, [
    'schema',
    'kind',
    'siteId',
    'namespace',
    'operationId',
    'capturedRevision',
    'expectedEtag',
    'parentHead',
    'commitId',
    'snapshotId',
    'headId',
  ])
  if (value.kind !== 'remote-sync')
    throw new Error('Operation is not a remote source synchronization')
  return {
    schema: 1,
    kind: 'remote-sync',
    siteId: text(value.siteId),
    namespace: text(value.namespace, opaque),
    operationId: text(value.operationId, operation),
    capturedRevision: integer(value.capturedRevision),
    expectedEtag: value.expectedEtag === null ? null : text(value.expectedEtag),
    parentHead: value.parentHead === null ? null : parseHead(value.parentHead),
    commitId: text(value.commitId, opaque),
    snapshotId: text(value.snapshotId, opaque),
    headId: text(value.headId, opaque),
  }
}

export function parsePrepared(input: string): PreparedRemoteCommit {
  if (input.length > 128 * 1024 * 1024)
    throw new Error('Prepared synchronization exceeds size limit')
  const value = object(JSON.parse(input))
  exact(value, [
    'schema',
    'siteId',
    'namespace',
    'operationId',
    'capturedRevision',
    'expectedEtag',
    'commit',
    'head',
    'objects',
    'headBody',
  ])
  if (!Array.isArray(value.objects) || value.objects.length !== 3)
    throw new Error('Invalid private object closure')
  const objects = value.objects.map((entry) => {
    const item = object(entry)
    if (Object.keys(item).length !== 2)
      throw new Error('Invalid prepared object fields')
    decodeBody(item.body)
    if (typeof item.body !== 'string')
      throw new Error('Invalid prepared object body')
    return { key: text(item.key), body: item.body }
  })
  decodeBody(value.headBody)
  if (typeof value.headBody !== 'string')
    throw new Error('Invalid prepared HEAD body')
  return {
    schema: 1,
    siteId: text(value.siteId),
    namespace: text(value.namespace, opaque),
    operationId: text(value.operationId, operation),
    capturedRevision: integer(value.capturedRevision),
    expectedEtag: value.expectedEtag === null ? null : text(value.expectedEtag),
    commit: parseCommit(value.commit),
    head: parseHead(value.head),
    objects,
    headBody: value.headBody,
  }
}

export const rootKey = (namespace: string) => `private/${namespace}`
export const objectKey = (namespace: string, id: string) =>
  `${rootKey(namespace)}/objects/${id}`
export const historyKey = (namespace: string, id: string) =>
  `${rootKey(namespace)}/heads/${id}`
export const headKey = (namespace: string) => `${rootKey(namespace)}/HEAD`
export const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])
