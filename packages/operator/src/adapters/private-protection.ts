import { Decrypter, Encrypter } from 'age-encryption'
import { randomBytes } from 'node:crypto'
import type {
  PrivateContext,
  PrivateObjectCodec,
} from '../core/remote-contract'
import {
  decodeSignedRecord,
  digest,
  encodeSignedRecord,
  type ProtectionAuthority,
} from './private-record'
import { validateProtectionOptions } from './private-policy'

export type PrivateProtectionOptions = ProtectionAuthority & {
  recipients: readonly string[]
  identities: readonly string[]
  maxBodyBytes?: number
}

function validateContext(context: PrivateContext) {
  if (!['snapshot', 'media', 'commit', 'head'].includes(context.purpose))
    throw new Error('Invalid private object purpose')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(context.objectId))
    throw new Error('Invalid private object identity')
}

export function createPrivateProtector(
  options: PrivateProtectionOptions,
): PrivateObjectCodec {
  const maximum = options.maxBodyBytes ?? 32 * 1024 * 1024
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 64 * 1024 * 1024
  )
    throw new Error('Invalid private object size limit')
  validateProtectionOptions(options)
  return {
    siteId: options.siteId,
    newId: () => randomBytes(16).toString('hex'),
    digest,
    async protect(input) {
      validateContext(input)
      if (input.body.length > maximum)
        throw new Error('Private body exceeds size limit')
      const encrypter = new Encrypter()
      for (const recipient of options.recipients)
        encrypter.addRecipient(recipient)
      return encrypter.encrypt(encodeSignedRecord(input, options))
    },
    async open(input) {
      validateContext(input)
      if (input.ciphertext.length > maximum * 2 + 2048)
        throw new Error('Private ciphertext exceeds size limit')
      const decrypter = new Decrypter()
      for (const identity of options.identities) decrypter.addIdentity(identity)
      const plaintext = await decrypter.decrypt(input.ciphertext)
      if (plaintext.length > maximum * 2 + 1024)
        throw new Error('Private plaintext exceeds size limit')
      return decodeSignedRecord(plaintext, input, options, maximum)
    },
  }
}
