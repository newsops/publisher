import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluatePreflight } from '../../../scripts/deploy/preflight-core.mjs'

const now = Date.parse('2026-09-11T12:00:00.000Z')

async function evidenceFiles(overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'preflight-'))
  const billingPath = path.join(directory, 'billing.json')
  const recoveryPath = path.join(directory, 'recovery.json')
  const staticHostingPath = path.join(directory, 'static-hosting.json')
  await writeFile(
    billingPath,
    JSON.stringify({
      verifiedAt: '2026-09-11T00:00:00.000Z',
      database: {
        provider: 'portable-postgres',
        plan: 'free',
        monthlyCapUsd: 0,
      },
      objectStorage: { provider: 'local-s3', plan: 'free', monthlyCapUsd: 0 },
      staticHosting: {
        provider: 'filesystem',
        plan: 'free',
        monthlyCapUsd: 0,
      },
      paidFeaturesEnabled: [],
      ...overrides.billing,
    }),
  )
  await writeFile(
    recoveryPath,
    JSON.stringify({
      verifiedAt: '2026-09-11T00:00:00.000Z',
      admin: {
        backupDataSha256: 'a'.repeat(64),
        restoreDataSha256: 'a'.repeat(64),
      },
      comments: {
        backupDataSha256: 'b'.repeat(64),
        restoreDataSha256: 'b'.repeat(64),
      },
      ...overrides.recovery,
    }),
  )
  await writeFile(
    staticHostingPath,
    JSON.stringify({
      verifiedAt: '2026-09-11T00:00:00.000Z',
      publicOrigin: 'https://www.example.test',
      deploymentId: 'managed-deployment-123',
      candidateVerifiedAt: '2026-09-11T00:00:00.000Z',
      activationObservedAt: '2026-09-11T00:00:00.000Z',
      rollbackObservedAt: '2026-09-11T00:00:00.000Z',
      ...overrides.staticHosting,
    }),
  )
  return { directory, billingPath, recoveryPath, staticHostingPath }
}

function environment(files, overrides = {}) {
  return {
    PUBLIC_SMOKE_URL: 'https://www.example.test',
    ADMIN_PUBLIC_ORIGIN: 'https://admin.example.test',
    ADMIN_SMOKE_URL: 'https://admin.example.test',
    DATABASE_URL: 'postgresql://admin_app:a@db.example.test/publisher',
    COMMENTS_DATABASE_URL:
      'postgresql://comments_app:b@db.example.test/publisher',
    ADMIN_BOOTSTRAP_SECRET: 'test-bootstrap-secret',
    OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: 'publisher',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'fixture-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'fixture-secret',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    STATIC_DEPLOYMENT_ADAPTER: 'filesystem',
    STATIC_DEPLOYMENT_ROOT: path.join(files.directory ?? os.tmpdir(), 'static'),
    BILLING_ATTESTATION_PATH: files.billingPath,
    RECOVERY_EVIDENCE_PATH: files.recoveryPath,
    ...overrides,
  }
}

describe('INFRA-005 fail-closed free and recovery preflight', () => {
  it('accepts current $0 evidence, isolated credentials, and recovery checksums', async () => {
    const files = await evidenceFiles()
    try {
      expect(
        evaluatePreflight({
          environment: environment(files),
          production: true,
          mode: 'platform',
          now,
        }).missing,
      ).toEqual([])
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('accepts an acknowledged R2 included-usage record without inventing a hard cap', async () => {
    const files = await evidenceFiles({
      billing: {
        objectStorage: {
          provider: 'cloudflare-r2',
          plan: 'standard',
          billingMode: 'included-usage',
          includedUsage: {
            storageGbMonth: 10,
            classAOperations: 1_000_000,
            classBOperations: 10_000_000,
          },
          overagePossible: true,
          operatorAcknowledgedAt: '2026-09-11T00:00:00.000Z',
        },
      },
    })
    try {
      expect(
        evaluatePreflight({
          environment: environment(files),
          production: true,
          mode: 'platform',
          now,
        }).missing,
      ).toEqual([])
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('rejects unacknowledged, incomplete, false, and stale included-usage records', async () => {
    const invalidRecords = [
      {
        provider: 'cloudflare-r2',
        plan: 'standard',
        billingMode: 'included-usage',
        includedUsage: {
          storageGbMonth: 10,
          classAOperations: 1_000_000,
          classBOperations: 10_000_000,
        },
        overagePossible: true,
      },
      {
        provider: 'cloudflare-r2',
        plan: 'standard',
        billingMode: 'included-usage',
        includedUsage: { storageGbMonth: 10 },
        overagePossible: true,
        operatorAcknowledgedAt: '2026-09-11T00:00:00.000Z',
      },
      {
        provider: 'cloudflare-r2',
        plan: 'standard',
        billingMode: 'included-usage',
        includedUsage: {
          storageGbMonth: 10,
          classAOperations: 1_000_000,
          classBOperations: 10_000_000,
        },
        overagePossible: false,
        operatorAcknowledgedAt: '2026-09-11T00:00:00.000Z',
      },
    ]
    for (const objectStorage of invalidRecords) {
      const files = await evidenceFiles({ billing: { objectStorage } })
      try {
        expect(
          evaluatePreflight({
            environment: environment(files),
            production: true,
            mode: 'platform',
            now,
          }).missing,
        ).not.toEqual([])
      } finally {
        await rm(files.directory, { recursive: true, force: true })
      }
    }

    const stale = await evidenceFiles({
      billing: {
        verifiedAt: '2026-07-01T00:00:00.000Z',
        objectStorage: {
          provider: 'cloudflare-r2',
          plan: 'standard',
          billingMode: 'included-usage',
          includedUsage: {
            storageGbMonth: 10,
            classAOperations: 1_000_000,
            classBOperations: 10_000_000,
          },
          overagePossible: true,
          operatorAcknowledgedAt: '2026-09-11T00:00:00.000Z',
        },
      },
    })
    try {
      expect(
        evaluatePreflight({
          environment: environment(stale),
          production: true,
          mode: 'platform',
          now,
        }).missing.join('\n'),
      ).toContain('billing is older than 30 days')
    } finally {
      await rm(stale.directory, { recursive: true, force: true })
    }
  })

  it('rejects chargeable, unverifiable, shared-credential, and missing-recovery states', async () => {
    const files = await evidenceFiles({
      billing: {
        objectStorage: {
          provider: 'chargeable-store',
          plan: 'usage',
          monthlyCapUsd: 5,
        },
        paidFeaturesEnabled: ['paid-object-storage'],
      },
      recovery: {
        admin: {
          backupDataSha256: 'a'.repeat(64),
          restoreDataSha256: 'c'.repeat(64),
        },
      },
    })
    try {
      const env = environment(files)
      env.COMMENTS_DATABASE_URL = env.DATABASE_URL
      const result = evaluatePreflight({
        environment: env,
        production: true,
        mode: 'platform',
        now,
      })
      expect(result.missing.join('\n')).toContain('$0 monthly cap')
      expect(result.missing.join('\n')).toContain('paid features')
      expect(result.missing.join('\n')).toContain('database URLs must differ')
      expect(result.missing.join('\n')).toContain('checksums must match')
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('rejects absent or stale attestations', () => {
    const result = evaluatePreflight({
      environment: environment({ billingPath: '', recoveryPath: '' }),
      production: true,
      mode: 'platform',
      now,
    })
    expect(result.missing.join('\n')).toContain('billing attestation path')
    expect(result.missing.join('\n')).toContain('recovery exercise path')
  })

  it('does not report identical object-storage credentials when both are absent', () => {
    expect(
      evaluatePreflight({
        environment: {},
        production: true,
        mode: 'platform',
        now,
      }).warnings,
    ).toEqual([])
  })

  it('rejects an unimplemented static deployment adapter', async () => {
    const files = await evidenceFiles()
    try {
      const result = evaluatePreflight({
        environment: environment(files, {
          STATIC_DEPLOYMENT_ADAPTER: 'unverified-host',
        }),
        production: true,
        mode: 'platform',
        now,
      })
      expect(result.missing.join('\n')).toContain('unsupported static adapter')
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('accepts fresh managed static-host activation evidence', async () => {
    const files = await evidenceFiles()
    try {
      expect(
        evaluatePreflight({
          environment: environment(files, {
            STATIC_DEPLOYMENT_ADAPTER: 'managed-static-host',
            STATIC_HOSTING_EVIDENCE_PATH: files.staticHostingPath,
          }),
          production: true,
          mode: 'platform',
          now,
        }).missing,
      ).toEqual([])
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('preserves filesystem adapter absolute-root validation', async () => {
    const files = await evidenceFiles()
    try {
      const result = evaluatePreflight({
        environment: environment(files, {
          STATIC_DEPLOYMENT_ROOT: 'relative-root',
        }),
        production: true,
        mode: 'platform',
        now,
      })
      expect(result.missing).toContain(
        'deployment topology: STATIC_DEPLOYMENT_ROOT must be absolute',
      )
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })

  it('rejects incomplete, stale, and mismatched managed static-host evidence', async () => {
    const cases = [
      undefined,
      { deploymentId: '' },
      { publicOrigin: 'https://other.example.test' },
      { candidateVerifiedAt: 'not-a-timestamp' },
      { rollbackObservedAt: '2026-07-01T00:00:00.000Z' },
    ]
    for (const staticHosting of cases) {
      const files = await evidenceFiles({ staticHosting: staticHosting ?? {} })
      try {
        const result = evaluatePreflight({
          environment: environment(files, {
            STATIC_DEPLOYMENT_ADAPTER: 'managed-static-host',
            ...(staticHosting === undefined
              ? { STATIC_HOSTING_EVIDENCE_PATH: '' }
              : { STATIC_HOSTING_EVIDENCE_PATH: files.staticHostingPath }),
          }),
          production: true,
          mode: 'platform',
          now,
        })
        expect(result.missing).not.toEqual([])
      } finally {
        await rm(files.directory, { recursive: true, force: true })
      }
    }

    const files = await evidenceFiles()
    try {
      const result = evaluatePreflight({
        environment: environment(files, {
          STATIC_DEPLOYMENT_ADAPTER: 'managed-static-host',
          STATIC_HOSTING_EVIDENCE_PATH: path.join(
            files.directory,
            'absent.json',
          ),
        }),
        production: true,
        mode: 'platform',
        now,
      })
      expect(result.missing.join('\n')).toContain(
        'unreadable static-hosting activation file',
      )
    } finally {
      await rm(files.directory, { recursive: true, force: true })
    }
  })
})
