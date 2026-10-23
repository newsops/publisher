import canonicalize from 'canonicalize'
import { createHash, sign, verify, type KeyObject } from 'node:crypto'
import type { PrivateContext, PrivatePurpose } from '../core/remote-contract'

export type WriterAuthority = {
  writerId: string
  writerEpoch: number
  publicKey: KeyObject | string
}
export type ProtectionAuthority = {
  siteId: string
  keyEpoch: number
  writerId: string
  writerEpoch: number
  signingKey: KeyObject | string
  trustedWriters: readonly WriterAuthority[]
}

type SignedRecord = {
  schema: 1
  siteId: string
  purpose: PrivatePurpose
  objectId: string
  keyEpoch: number
  writerId: string
  writerEpoch: number
  digest: string
  body: string
}

const domain = 'publisher/private-object/v1\0'
const fields = [
  'schema',
  'siteId',
  'purpose',
  'objectId',
  'keyEpoch',
  'writerId',
  'writerEpoch',
  'digest',
  'body',
]
export const digest = (body: Uint8Array) =>
  createHash('sha256').update(body).digest('hex')
export const canonicalBytes = (value: unknown) => {
  const text = canonicalize(value)
  if (text === undefined)
    throw new Error('Private record cannot be canonicalized')
  return Buffer.from(text, 'utf8')
}

function record(value: unknown): SignedRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid private record')
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !(key in value))
  )
    throw new Error('Invalid private record fields')
  const v = value as Record<string, unknown>
  if (
    v.schema !== 1 ||
    typeof v.siteId !== 'string' ||
    typeof v.objectId !== 'string' ||
    typeof v.writerId !== 'string'
  )
    throw new Error('Invalid private record identity')
  if (
    v.purpose !== 'snapshot' &&
    v.purpose !== 'media' &&
    v.purpose !== 'commit' &&
    v.purpose !== 'head'
  )
    throw new Error('Invalid private record purpose')
  if (
    !Number.isSafeInteger(v.keyEpoch) ||
    Number(v.keyEpoch) < 1 ||
    !Number.isSafeInteger(v.writerEpoch) ||
    Number(v.writerEpoch) < 1
  )
    throw new Error('Invalid private record epoch')
  if (
    typeof v.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.digest) ||
    typeof v.body !== 'string'
  )
    throw new Error('Invalid private record payload')
  return {
    schema: 1,
    siteId: v.siteId,
    purpose: v.purpose,
    objectId: v.objectId,
    keyEpoch: Number(v.keyEpoch),
    writerId: v.writerId,
    writerEpoch: Number(v.writerEpoch),
    digest: v.digest,
    body: v.body,
  }
}

export function encodeSignedRecord(
  input: PrivateContext & { body: Uint8Array },
  authority: ProtectionAuthority,
) {
  const data: SignedRecord = {
    schema: 1,
    siteId: authority.siteId,
    purpose: input.purpose,
    objectId: input.objectId,
    body: Buffer.from(input.body).toString('base64'),
    keyEpoch: authority.keyEpoch,
    writerId: authority.writerId,
    writerEpoch: authority.writerEpoch,
    digest: digest(input.body),
  }
  const signature = sign(
    null,
    Buffer.concat([Buffer.from(domain), canonicalBytes(data)]),
    authority.signingKey,
  )
  return canonicalBytes({
    record: data,
    signature: signature.toString('base64'),
  })
}

function signedEnvelope(bytes: Uint8Array) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const envelope: unknown = JSON.parse(text)
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !('record' in envelope) ||
    !('signature' in envelope) ||
    typeof envelope.signature !== 'string' ||
    Object.keys(envelope).length !== 2
  )
    throw new Error('Invalid private envelope')
  if (canonicalBytes(envelope).toString() !== text)
    throw new Error('Private envelope must have canonical encoding')
  return { data: record(envelope.record), signature: envelope.signature }
}

function authenticateRecord(
  data: SignedRecord,
  encodedSignature: string,
  context: PrivateContext,
  authority: ProtectionAuthority,
) {
  if (
    data.siteId !== authority.siteId ||
    data.keyEpoch !== authority.keyEpoch ||
    data.purpose !== context.purpose ||
    data.objectId !== context.objectId
  )
    throw new Error('Private record context or epoch mismatch')
  const writer = authority.trustedWriters.find(
    (entry) =>
      entry.writerId === data.writerId &&
      entry.writerEpoch === data.writerEpoch,
  )
  if (!writer) throw new Error('Unauthorized private record author or epoch')
  const signature = Buffer.from(encodedSignature, 'base64')
  if (
    signature.length !== 64 ||
    signature.toString('base64') !== encodedSignature ||
    !verify(
      null,
      Buffer.concat([Buffer.from(domain), canonicalBytes(data)]),
      writer.publicKey,
      signature,
    )
  )
    throw new Error('Invalid private record signature')
}

export function decodeSignedRecord(
  bytes: Uint8Array,
  context: PrivateContext,
  authority: ProtectionAuthority,
  maxBodyBytes: number,
) {
  const { data, signature } = signedEnvelope(bytes)
  authenticateRecord(data, signature, context, authority)
  const body = Buffer.from(data.body, 'base64')
  if (
    body.length > maxBodyBytes ||
    body.toString('base64') !== data.body ||
    digest(body) !== data.digest
  )
    throw new Error('Invalid private record body or size limit')
  return new Uint8Array(body)
}
