import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { S3ConditionalByteStore } from '../../../packages/persistence/src/conditional-object-storage.ts'

const resources = []

async function fixture(replies) {
  const requests = []
  const server = http.createServer(async (request, response) => {
    const parts = []
    for await (const part of request) parts.push(part)
    requests.push({
      method: request.method,
      headers: request.headers,
      body: Buffer.concat(parts),
    })
    const reply = replies.shift()
    if (!reply || reply.lost) {
      request.socket.destroy()
      return
    }
    response.writeHead(reply.status ?? 200, reply.headers ?? {})
    response.end(reply.body ?? '')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const store = new S3ConditionalByteStore({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    bucket: 'private-fixture',
    accessKeyId: 'fixture-access',
    secretAccessKey: 'fixture-secret',
    forcePathStyle: true,
  })
  resources.push({ server, store })
  return { requests, store }
}

afterEach(async () => {
  for (const { server, store } of resources.splice(0)) {
    store.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

describe('local-first conditional S3 byte boundary', () => {
  it('reads body and opaque ETag from the same GET', async () => {
    const bytes = Buffer.from([0, 255, 14, 123])
    const { store, requests } = await fixture([
      { headers: { etag: '"opaque-not-a-hash"' }, body: bytes },
    ])
    const value = await store.read('objects/opaque')
    expect(value.etag).toBe('"opaque-not-a-hash"')
    expect(Buffer.from(value.body)).toEqual(bytes)
    expect(requests.map((request) => request.method)).toEqual(['GET'])
  })

  it('sends atomic create and exact-ETag replace preconditions', async () => {
    const { store, requests } = await fixture([
      { headers: { etag: '"first"' } },
      { headers: { etag: '"next"' } },
    ])
    const bytes = new Uint8Array([3, 9, 0, 255])
    expect(await store.create('objects/value', bytes)).toEqual({
      kind: 'stored',
      etag: '"first"',
    })
    expect(await store.replace('head', bytes, '"opaque-etag"')).toEqual({
      kind: 'stored',
      etag: '"next"',
    })
    expect(requests[0].headers['if-none-match']).toBe('*')
    expect(requests[1].headers['if-match']).toBe('"opaque-etag"')
    expect(requests.map((request) => request.method)).toEqual(['PUT', 'PUT'])
    expect(requests[0].body).toEqual(Buffer.from(bytes))
    expect(requests[0].headers['cache-control']).toContain('no-store')
  })

  it('does not turn a conditional rejection into logical-operation failure', async () => {
    const { store } = await fixture([
      { status: 412, body: '<Error><Code>PreconditionFailed</Code></Error>' },
    ])
    expect(await store.replace('head', new Uint8Array([1]), '"old"')).toEqual({
      kind: 'precondition-failed',
    })
  })

  it('preserves unknown outcome when the write response is lost', async () => {
    const { store, requests } = await fixture([{ lost: true }])
    expect(
      await store.create('objects/uncertain', new Uint8Array([1])),
    ).toEqual({
      kind: 'unknown',
    })
    expect(requests).toHaveLength(1)
  })

  it('does not invent an ETag for an acknowledged write', async () => {
    const { store } = await fixture([{ status: 200 }])
    expect(await store.create('objects/no-etag', new Uint8Array([1]))).toEqual({
      kind: 'unknown',
    })
  })

  it('distinguishes absence, denied access and unsupported conditional writes', async () => {
    const { store } = await fixture([
      { status: 404, body: '<Error><Code>NoSuchKey</Code></Error>' },
      { status: 403, body: '<Error><Code>AccessDenied</Code></Error>' },
      { status: 501, body: '<Error><Code>NotImplemented</Code></Error>' },
    ])
    expect(await store.read('missing')).toBeUndefined()
    await expect(store.read('denied')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    })
    await expect(store.create('head', new Uint8Array())).rejects.toMatchObject({
      code: 'UNSUPPORTED_CONDITIONS',
    })
  })

  it('rejects a read without a usable concurrency token', async () => {
    const { store } = await fixture([{ body: 'ciphertext' }])
    await expect(store.read('head')).rejects.toMatchObject({
      code: 'MISSING_ETAG',
    })
  })
})
