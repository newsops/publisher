import { createPrivateKey, createPublicKey } from 'node:crypto'
import type { PrivateProtectionOptions } from './private-protection'

function validateWriterPolicy(options: PrivateProtectionOptions) {
  const authorities = new Set<string>()
  if (options.trustedWriters.length === 0 || options.trustedWriters.length > 64)
    throw new Error('Invalid private author policy')
  for (const writer of options.trustedWriters) {
    const publicKey =
      typeof writer.publicKey === 'string'
        ? createPublicKey(writer.publicKey)
        : writer.publicKey
    const identity = `${writer.writerId}:${writer.writerEpoch}`
    if (
      !writer.writerId ||
      writer.writerId.length > 128 ||
      !Number.isSafeInteger(writer.writerEpoch) ||
      writer.writerEpoch < 1 ||
      publicKey.type !== 'public' ||
      publicKey.asymmetricKeyType !== 'ed25519' ||
      authorities.has(identity)
    )
      throw new Error('Invalid private author policy')
    authorities.add(identity)
  }
}

export function validateProtectionOptions(options: PrivateProtectionOptions) {
  const privateKey =
    typeof options.signingKey === 'string'
      ? createPrivateKey(options.signingKey)
      : options.signingKey
  if (
    privateKey.type !== 'private' ||
    privateKey.asymmetricKeyType !== 'ed25519'
  )
    throw new Error('An Ed25519 private signing key is required')
  if (new Set(options.recipients).size < 2 || options.recipients.length > 16)
    throw new Error(
      'An independent recovery recipient is required within recipient limits',
    )
  if (
    options.recipients.some((recipient) => !/^age1[0-9a-z]+$/.test(recipient))
  )
    throw new Error('Native age X25519 recipients are required')
  if (
    !options.siteId ||
    options.siteId.length > 128 ||
    !options.writerId ||
    options.writerId.length > 128 ||
    !Number.isSafeInteger(options.keyEpoch) ||
    options.keyEpoch < 1 ||
    !Number.isSafeInteger(options.writerEpoch) ||
    options.writerEpoch < 1
  )
    throw new Error('Invalid private authority')
  validateWriterPolicy(options)
}
