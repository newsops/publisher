import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const read = (file) =>
  existsSync(path.join(root, file))
    ? readFileSync(path.join(root, file), 'utf8')
    : ''
const source = read('infra/local/Dockerfile')
const compose = read('infra/local/compose.yml')
const server =
  source
    .split('FROM fixture-base AS minio-server')[1]
    ?.split('FROM fixture-base AS minio-client')[0] ?? ''
const client = source.split('FROM fixture-base AS minio-client')[1] ?? ''

describe('TC12 clean-room fixture provenance', () => {
  it('builds the same three-service fixture without pulling removed MinIO images', () => {
    expect(compose.match(/^  [a-z][a-z-]+:/gm)).toEqual([
      '  postgres:',
      '  object-storage:',
      '  object-storage-init:',
    ])
    expect(compose).toContain('target: minio-server')
    expect(compose).toContain('target: minio-client')
    expect(compose.match(/dockerfile: Dockerfile/g)).toHaveLength(2)
    expect(compose).not.toMatch(
      /image:.*(?:quay\.io\/minio|docker\.io\/minio|minio\/minio|minio\/mc)/,
    )
    for (const contract of [
      'server /data --console-address :9001',
      "'55432:5432'",
      "'59000:9000'",
      "'59001:9001'",
      'mc mb --ignore-existing local/publisher-fixture',
    ])
      expect(compose).toContain(contract)
  })

  it('pins the official multi-architecture base by exact version and digest', () => {
    expect(source).toContain(
      'FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS fixture-base',
    )
    expect(source).not.toContain(':latest')
  })

  it.each([
    [
      'amd64',
      '7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f',
      '01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891',
    ],
    [
      'arm64',
      '5c83cd2cf151717ba0243f73e1c7802ff36e272b67144bdd7f1f7d684fd6f03d',
      '14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c',
    ],
  ])(
    'binds %s to independently verified server and client digests',
    (architecture, serverHash, clientHash) => {
      expect(server).toContain(`${architecture}) checksum=${serverHash}`)
      expect(client).toContain(`${architecture}) checksum=${clientHash}`)
    },
  )

  it('uses only exact official releases and checks downloaded bytes before installation', () => {
    expect(server).toContain(
      'https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z/minio.linux-${TARGETARCH}.RELEASE.2025-09-07T16-13-09Z',
    )
    expect(client).toContain(
      'https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.linux-${TARGETARCH}.RELEASE.2025-08-13T08-35-41Z',
    )
    for (const stage of [server, client]) {
      expect(stage).toContain('timeout 120 wget -q -T 30')
      expect(stage).toContain('timeout 30 wget -q -T 15')
      expect(stage).toContain('sha256sum -c -')
      expect(stage.indexOf('sha256sum -c -')).toBeLessThan(
        stage.indexOf('chmod 755'),
      )
      expect(stage).toContain('Unsupported fixture architecture')
      expect(stage).toContain('exit 1')
      expect(stage).not.toMatch(/sha256sum[^\n]*(?:\|\| true|; true)/)
    }
  })

  it('retains upstream licensing and immutable source provenance', () => {
    for (const [stage, repository, commit] of [
      [server, 'minio', '07c3a429bfed433e49018cb0f78a52145d4bedeb'],
      [client, 'mc', '7394ce0dd2a80935aded936b09fa12cbb3cb8096'],
    ])
      for (const file of ['LICENSE', 'CREDITS', 'NOTICE']) {
        expect(stage).toContain(
          `https://raw.githubusercontent.com/minio/${repository}/${commit}/${file}`,
        )
        expect(stage).toContain(`/licenses/${repository}/${file}`)
      }
    expect(read('infra/local/README.md')).toContain('test fixture')
  })
})
