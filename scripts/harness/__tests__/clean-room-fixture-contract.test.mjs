import {
  readFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const read = (file) =>
  existsSync(path.join(root, file))
    ? readFileSync(path.join(root, file), 'utf8')
    : ''
const source = read('infra/local/Dockerfile')
const compose = read('infra/local/compose.yml')
const cleanRoom = read('.github/workflows/verify.yml').split(
  '\n  clean-room:\n',
)[1]
const server =
  source
    .split('FROM fixture-base AS minio-server')[1]
    ?.split('FROM fixture-base AS minio-client')[0] ?? ''
const client = source.split('FROM fixture-base AS minio-client')[1] ?? ''

const fixtureEnvironment = {
  COMPOSE_PROJECT_NAME: 'publisher-fixture-123-2-clean-room',
  PUBLISHER_FIXTURE_POSTGRES_PORT: '0',
  PUBLISHER_FIXTURE_OBJECT_PORT: '0',
  PUBLISHER_FIXTURE_CONSOLE_PORT: '0',
}
const mappings = {
  POSTGRES: '127.0.0.1:41001\n',
  OBJECT: '127.0.0.1:41002\n',
  CONSOLE: '127.0.0.1:41003\n',
}

function runDiscovery(overrides = {}) {
  const step = cleanRoom
    ?.split('      - name: Discover fixture endpoints\n')[1]
    ?.split('\n      - ')[0]
  const block = step?.split('        run: |\n')[1]
  expect(
    block,
    'the workflow must expose its actual discovery shell',
  ).toBeDefined()
  const shell = block
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
  const directory = mkdtempSync(path.join(tmpdir(), 'publisher-fixture-ports-'))
  const environmentFile = path.join(directory, 'github-env')
  const logFile = path.join(directory, 'docker-calls')
  const sideEffect = path.join(directory, 'must-not-exist')
  writeFileSync(environmentFile, 'EXISTING_ENV=preserved\n')
  writeFileSync(
    path.join(directory, 'docker'),
    `#!/bin/sh
printf '%s|%s\\n' "$COMPOSE_PROJECT_NAME" "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  'compose -f infra/local/compose.yml port postgres 5432')
    printf '%s' "$FAKE_POSTGRES_OUTPUT"; exit "$FAKE_POSTGRES_STATUS" ;;
  'compose -f infra/local/compose.yml port object-storage 9000')
    printf '%s' "$FAKE_OBJECT_OUTPUT"; exit "$FAKE_OBJECT_STATUS" ;;
  'compose -f infra/local/compose.yml port object-storage 9001')
    printf '%s' "$FAKE_CONSOLE_OUTPUT"; exit "$FAKE_CONSOLE_STATUS" ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o700 },
  )
  try {
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...fixtureEnvironment,
        PATH: `${directory}${path.delimiter}${process.env.PATH}`,
        GITHUB_ENV: environmentFile,
        FAKE_DOCKER_LOG: logFile,
        FAKE_SIDE_EFFECT: sideEffect,
        ...Object.fromEntries(
          Object.entries(mappings).flatMap(([service, mapping]) => [
            [`FAKE_${service}_OUTPUT`, mapping],
            [`FAKE_${service}_STATUS`, '0'],
          ]),
        ),
        ...overrides,
      },
    })
    return {
      ...result,
      environment: readFileSync(environmentFile, 'utf8'),
      calls: existsSync(logFile)
        ? readFileSync(logFile, 'utf8').trim().split('\n')
        : [],
      sideEffect: existsSync(sideEffect),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(null)
      else reject(error)
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

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
      "'127.0.0.1:${PUBLISHER_FIXTURE_POSTGRES_PORT:-55432}:5432'",
      "'127.0.0.1:${PUBLISHER_FIXTURE_OBJECT_PORT:-59000}:9000'",
      "'127.0.0.1:${PUBLISHER_FIXTURE_CONSOLE_PORT:-59001}:9001'",
      'http://object-storage:9000 publisher-local publisher-local-secret',
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

describe('INFRA-008 clean-room fixture isolation', () => {
  it('requests Docker-assigned ports in one run, attempt and job-specific project', () => {
    for (const variable of Object.keys(fixtureEnvironment).slice(1))
      expect(cleanRoom).toContain(`${variable}: '0'`)
    expect(cleanRoom).toContain(
      'COMPOSE_PROJECT_NAME: publisher-fixture-${{ github.run_id }}-${{ github.run_attempt }}-clean-room',
    )
    expect(cleanRoom).toContain(
      'docker compose -f infra/local/compose.yml up -d --wait postgres object-storage',
    )
    expect(cleanRoom).toContain(
      'docker compose -f infra/local/compose.yml run --rm object-storage-init',
    )
    expect(cleanRoom).toContain(
      '- if: always()\n        run: docker compose -f infra/local/compose.yml down -v',
    )
    expect(cleanRoom).not.toMatch(/127\.0\.0\.1:(?:55432|59000|59001)/)
  })

  it('derives all fixture consumer URLs from the actual Docker mappings', () => {
    const result = runDiscovery()
    expect(result.status, result.stderr).toBe(0)
    expect(result.environment.trim().split('\n')).toEqual([
      'EXISTING_ENV=preserved',
      'PUBLISHER_RECOVERY_TEST_DATABASE_URL=postgresql://postgres:postgres-local-only@127.0.0.1:41001/postgres',
      'DATABASE_URL=postgresql://publisher_admin_app:admin-local-only@127.0.0.1:41001/publisher_admin',
      'COMMENTS_DATABASE_URL=postgresql://publisher_comments_app:comments-local-only@127.0.0.1:41001/publisher_comments',
      'RESTORE_DATABASE_URL=postgresql://publisher_admin_app:admin-local-only@127.0.0.1:41001/publisher_admin_restore',
      'COMMENTS_RESTORE_DATABASE_URL=postgresql://publisher_comments_app:comments-local-only@127.0.0.1:41001/publisher_comments_restore',
      'OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:41002',
    ])
    expect(result.calls).toEqual(
      [
        'port postgres 5432',
        'port object-storage 9000',
        'port object-storage 9001',
      ].map(
        (command) =>
          `${fixtureEnvironment.COMPOSE_PROJECT_NAME}|compose -f infra/local/compose.yml ${command}`,
      ),
    )
  })

  it.each([1, 65535])('accepts the valid port boundary %s', (port) => {
    const result = runDiscovery(
      Object.fromEntries(
        Object.keys(mappings).map((service) => [
          `FAKE_${service}_OUTPUT`,
          `127.0.0.1:${port}\n`,
        ]),
      ),
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.environment).toContain(
      `OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:${port}\n`,
    )
    expect(result.environment).toContain(
      `PUBLISHER_RECOVERY_TEST_DATABASE_URL=postgresql://postgres:postgres-local-only@127.0.0.1:${port}/postgres\n`,
    )
  })

  it.each(
    Object.keys(mappings).flatMap((service) =>
      [
        ['failed query', '127.0.0.1:41001\n', '1'],
        ['empty', '', '0'],
        ['multiple mappings', '127.0.0.1:41001\n127.0.0.1:41002\n', '0'],
        ['extra blank line', '127.0.0.1:41001\n\n', '0'],
        ['wildcard', '0.0.0.0:41001\n', '0'],
        ['IPv6', '[::1]:41001\n', '0'],
        ['malformed', '127.0.0.1:not-a-port\n', '0'],
        ['zero', '127.0.0.1:0\n', '0'],
        ['out of range', '127.0.0.1:65536\n', '0'],
        ['shell injection', '127.0.0.1:$(touch "$FAKE_SIDE_EFFECT")\n', '0'],
      ].map(([label, output, status]) => [service, label, output, status]),
    ),
  )(
    'rejects %s %s without exporting endpoints or executing output',
    (service, _label, output, status) => {
      const result = runDiscovery({
        [`FAKE_${service}_OUTPUT`]: output,
        [`FAKE_${service}_STATUS`]: status,
      })
      expect(result.status, result.stderr).not.toBe(0)
      expect(result.environment).toBe('EXISTING_ENV=preserved\n')
      expect(result.sideEffect).toBe(false)
    },
  )

  it('discovers endpoints while default ports remain occupied', async () => {
    const ports = [55432, 59000, 59001]
    const listeners = await Promise.all(ports.map(occupyPort))
    try {
      expect(runDiscovery().status).toBe(0)
      for (const [index, port] of ports.entries()) {
        if (listeners[index]) expect(listeners[index].listening).toBe(true)
        const unexpectedListener = await occupyPort(port)
        if (unexpectedListener) await closeServer(unexpectedListener)
        expect(
          unexpectedListener,
          `port ${port} must remain occupied`,
        ).toBeNull()
      }
    } finally {
      await Promise.all(listeners.filter(Boolean).map(closeServer))
    }
  })
})
