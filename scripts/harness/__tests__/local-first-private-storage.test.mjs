import { describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { createPrivateProtector } from '../../../packages/operator/src/adapters/private-protection.ts'

const require = createRequire(
  new URL('../../../packages/operator/package.json', import.meta.url),
)
const age = await import(require.resolve('age-encryption'))

async function fixture(overrides = {}) {
  const identity = await age.generateIdentity()
  const recovery = await age.generateIdentity()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const options = {
    siteId: 'example',
    keyEpoch: 1,
    writerId: 'writer-one',
    writerEpoch: 1,
    recipients: [
      await age.identityToRecipient(identity),
      await age.identityToRecipient(recovery),
    ],
    identities: [identity],
    signingKey: privateKey,
    trustedWriters: [{ writerId: 'writer-one', writerEpoch: 1, publicKey }],
    ...overrides,
  }
  return {
    options,
    identity,
    recovery,
    protector: createPrivateProtector(options),
  }
}

const context = { purpose: 'snapshot', objectId: 'a'.repeat(32) }
const body = new TextEncoder().encode(
  'PRIVATE ARTICLE DRAFT /media/original.jpg',
)

describe('local-first private object protection', () => {
  it('uses real age ciphertext and independently decrypts with the offline recovery identity', async () => {
    const { protector, options, recovery } = await fixture()
    const ciphertext = await protector.protect({ ...context, body })
    expect(new TextDecoder().decode(ciphertext.slice(0, 22))).toBe(
      'age-encryption.org/v1\n',
    )
    expect(Buffer.from(ciphertext).includes(body)).toBe(false)
    expect(await protector.open({ ...context, ciphertext })).toEqual(body)
    const restored = createPrivateProtector({
      ...options,
      identities: [recovery],
    })
    expect(await restored.open({ ...context, ciphertext })).toEqual(body)
  })

  it('rejects tampering, truncation, wrong keys and site, purpose or object substitution', async () => {
    const { protector, options } = await fixture()
    const ciphertext = await protector.protect({ ...context, body })
    const changed = ciphertext.slice()
    changed[changed.length - 1] ^= 1
    await expect(
      protector.open({ ...context, ciphertext: changed }),
    ).rejects.toThrow()
    await expect(
      protector.open({ ...context, ciphertext: ciphertext.slice(0, -1) }),
    ).rejects.toThrow()
    await expect(
      protector.open({ ...context, purpose: 'media', ciphertext }),
    ).rejects.toThrow()
    await expect(
      protector.open({ ...context, objectId: 'b'.repeat(32), ciphertext }),
    ).rejects.toThrow()
    const wrongSite = createPrivateProtector({ ...options, siteId: 'other' })
    await expect(wrongSite.open({ ...context, ciphertext })).rejects.toThrow()
    const wrongKey = createPrivateProtector({
      ...options,
      identities: [await age.generateIdentity()],
    })
    await expect(wrongKey.open({ ...context, ciphertext })).rejects.toThrow()
  })

  it('does not confuse public-recipient encryption with authorized editorial authorship', async () => {
    const { protector, options } = await fixture()
    const attacker = generateKeyPairSync('ed25519')
    const untrusted = createPrivateProtector({
      ...options,
      signingKey: attacker.privateKey,
    })
    const ciphertext = await untrusted.protect({ ...context, body })
    await expect(protector.open({ ...context, ciphertext })).rejects.toThrow(
      /signature|author/i,
    )
    const stale = createPrivateProtector({ ...options, writerEpoch: 2 })
    await expect(
      protector.open({
        ...context,
        ciphertext: await stale.protect({ ...context, body }),
      }),
    ).rejects.toThrow(/author|epoch/i)
  })

  it('rejects oversized encrypted input before invoking its parser', async () => {
    const { options } = await fixture()
    const bounded = createPrivateProtector({ ...options, maxBodyBytes: 128 })
    await expect(
      bounded.open({ ...context, ciphertext: new Uint8Array(4096) }),
    ).rejects.toThrow(/limit|size/i)
    await expect(
      bounded.protect({ ...context, body: new Uint8Array(129) }),
    ).rejects.toThrow(/limit|size/i)
  })

  it('rejects noncanonical or duplicate JSON even when someone can encrypt to its public recipients', async () => {
    const { protector, options, identity } = await fixture()
    const ciphertext = await protector.protect({ ...context, body })
    const decrypter = new age.Decrypter()
    decrypter.addIdentity(identity)
    const signed = await decrypter.decrypt(ciphertext, 'text')
    const encrypter = new age.Encrypter()
    encrypter.addRecipient(options.recipients[0])
    const duplicate = signed.replace(
      '{',
      '{"signature":"not-the-signed-value",',
    )
    await expect(
      protector.open({
        ...context,
        ciphertext: await encrypter.encrypt(duplicate),
      }),
    ).rejects.toThrow(/canonical/i)
    await expect(
      protector.open({
        ...context,
        ciphertext: await encrypter.encrypt(` ${signed}`),
      }),
    ).rejects.toThrow(/canonical/i)
  })

  it('requires independent recovery recipients and an unambiguous Ed25519 author policy', async () => {
    const { options } = await fixture()
    expect(() =>
      createPrivateProtector({
        ...options,
        recipients: [options.recipients[0], options.recipients[0]],
      }),
    ).toThrow(/recovery/i)
    expect(() =>
      createPrivateProtector({
        ...options,
        trustedWriters: [...options.trustedWriters, options.trustedWriters[0]],
      }),
    ).toThrow(/policy/i)
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
    expect(() =>
      createPrivateProtector({ ...options, signingKey: rsa.privateKey }),
    ).toThrow(/Ed25519/i)
    const ciphertext = await createPrivateProtector(options).protect({
      ...context,
      body,
    })
    await expect(
      createPrivateProtector({ ...options, keyEpoch: 2 }).open({
        ...context,
        ciphertext,
      }),
    ).rejects.toThrow(/epoch/i)
  })
})
