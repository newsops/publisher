import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * ARCH-001: the layer scans fail red on a forbidden edge, a stale baseline
 * entry, an out-of-root `process.env`, a browser route without site
 * authorization, and an unregistered capability — and pass on the real tree.
 */

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const harness = [
  'layer-common.mjs',
  'layer-map.json',
  'surface-map.json',
  'scan-layer-imports.mjs',
  'scan-env-access.mjs',
  'scan-route-shape.mjs',
  'scan-surface-parity.mjs',
]
let sandbox

function write(relative, content = '') {
  const target = path.join(sandbox, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function run(scan, ...args) {
  const result = spawnSync(
    'node',
    [path.join(sandbox, 'scripts/harness', scan), ...args],
    { encoding: 'utf8' },
  )
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

function resetBaseline(entries = []) {
  write('scripts/harness/layer-baseline.json', JSON.stringify(entries))
}

describe('layer contract scans (ARCH-001)', () => {
  beforeAll(() => {
    sandbox = mkdtempSync(path.join(os.tmpdir(), 'publisher-layers-'))
    for (const file of harness)
      cpSync(
        path.join(repo, 'scripts/harness', file),
        path.join(sandbox, 'scripts/harness', file),
      )
    // A minimal compliant tree.
    write('packages/content/src/index.ts', 'export const a = 1\n')
    write(
      'packages/persistence/src/index.ts',
      "import pg from 'pg'\nexport { pg }\n",
    )
    write(
      'packages/publication/src/index.ts',
      "import { a } from '@publisher/content'\nexport { a }\n",
    )
    write('packages/publication/src/static-builder.ts', 'export const b = 2\n')
    write(
      'apps/admin/app/lib/repository.ts',
      "import { pg } from '@publisher/persistence'\nexport const repo = pg\n",
    )
    write(
      'apps/admin/app/lib/services/desk-review.ts',
      "import { repo } from './repository'\nexport const desk = repo\n",
    )
    write(
      'apps/admin/app/lib/http/auth.ts',
      'export function requireIdentity() {}\n',
    )
    write(
      'apps/admin/app/lib/http/request-repository.ts',
      'export function repositoryForRequest() {}\n',
    )
    write(
      'apps/admin/app/api/desk/route.ts',
      "import { requireIdentity } from '../../lib/http/auth'\nimport { repositoryForRequest } from '../../lib/http/request-repository'\nexport async function GET() { requireIdentity(); repositoryForRequest() }\n",
    )
    write(
      'apps/admin/app/api/v2/sites/[siteId]/posts/[id]/desk/route.ts',
      'export function GET() { return withSiteAutomation() }\n',
    )
    write(
      'packages/admin-client/src/index.d.ts',
      'export class PublisherApiClient {\n  getDeskReport(): void\n  decideDesk(): void\n}\n',
    )
    write(
      'packages/ops-cli/bin/publisher.mjs',
      "const usage = {\n      commands: [\n        'desk report --site <id>',\n        'desk approve --site <id>',\n      ],\n}\n",
    )
    write(
      'apps/admin/app/DeskReviewPanel.tsx',
      'export default function Panel() { return null }\n',
    )
    write(
      'docs/admin-api.openapi.yaml',
      'paths:\n  /api/v2/sites/{siteId}/posts/{id}/desk:\n    get: {}\n',
    )
    write(
      'scripts/harness/surface-map.json',
      JSON.stringify({
        sources: {
          browserRoutes: 'apps/admin/app/api',
          automationRoutes: 'apps/admin/app/api/v2',
          clientTypes: 'packages/admin-client/src/index.d.ts',
          cliUsage: 'packages/ops-cli/bin/publisher.mjs',
          uiPanels: 'apps/admin/app',
          openapi: 'docs/admin-api.openapi.yaml',
        },
        capabilities: [
          {
            id: 'desk-review',
            service: 'apps/admin/app/lib/services/desk-review.ts',
            browser: ['desk'],
            automation: ['sites/[siteId]/posts/[id]/desk'],
            client: ['getDeskReport', 'decideDesk'],
            cli: ['desk report', 'desk approve'],
            ui: ['DeskReviewPanel.tsx'],
          },
        ],
      }),
    )
    resetBaseline()
  })

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true })
  })

  it('passes on the compliant fixture and fails on a forbidden edge', () => {
    expect(run('scan-layer-imports.mjs').code).toBe(0)
    write(
      'packages/content/src/index.ts',
      "import pg from 'pg'\nexport const a = pg\n",
    )
    const failed = run('scan-layer-imports.mjs')
    expect(failed.code).toBe(1)
    expect(failed.out).toContain('packages/content/src/index.ts -> pg')
    expect(failed.out).toContain('contract may not import sdk module')
    write('packages/content/src/index.ts', 'export const a = 1\n')
  })

  it('refuses a baseline that grows or goes stale', () => {
    write(
      'packages/content/src/index.ts',
      "import pg from 'pg'\nexport const a = pg\n",
    )
    resetBaseline([
      { rule: 'layer-imports', key: 'packages/content/src/index.ts -> pg' },
    ])
    expect(run('scan-layer-imports.mjs').code).toBe(0)
    write('packages/content/src/index.ts', 'export const a = 1\n')
    const stale = run('scan-layer-imports.mjs')
    expect(stale.code).toBe(1)
    expect(stale.out).toContain('stale baseline entry')
    resetBaseline()
  })

  it('confines process.env to composition roots', () => {
    expect(run('scan-env-access.mjs').code).toBe(0)
    write(
      'packages/publication/src/static-builder.ts',
      'export const b = process.env.STATIC_ROOT\n',
    )
    const failed = run('scan-env-access.mjs')
    expect(failed.code).toBe(1)
    expect(failed.out).toContain(
      'packages/publication/src/static-builder.ts -> process.env.STATIC_ROOT',
    )
    expect(failed.out).toContain('composition root')
    write('packages/publication/src/static-builder.ts', 'export const b = 2\n')
  })

  it('requires site resolution in browser routes and forbids adapter imports', () => {
    expect(run('scan-route-shape.mjs').code).toBe(0)
    write(
      'apps/admin/app/api/desk/route.ts',
      "import { requireIdentity } from '../../lib/http/auth'\nexport async function GET() { requireIdentity() }\n",
    )
    const missing = run('scan-route-shape.mjs')
    expect(missing.code).toBe(1)
    expect(missing.out).toContain(
      'apps/admin/app/api/desk/route.ts -> missing site resolution',
    )
    write(
      'apps/admin/app/api/desk/route.ts',
      "import sharp from 'sharp'\nimport { requireIdentity } from '../../lib/http/auth'\nimport { repositoryForRequest } from '../../lib/http/request-repository'\nexport async function GET() { requireIdentity(); repositoryForRequest(); sharp }\n",
    )
    const adapter = run('scan-route-shape.mjs')
    expect(adapter.code).toBe(1)
    expect(adapter.out).toContain('apps/admin/app/api/desk/route.ts -> sharp')
    write(
      'apps/admin/app/api/desk/route.ts',
      "import { requireIdentity } from '../../lib/http/auth'\nimport { repositoryForRequest } from '../../lib/http/request-repository'\nexport async function GET() { requireIdentity(); repositoryForRequest() }\n",
    )
  })

  it('keeps every capability registered and reachable from every surface', () => {
    expect(run('scan-surface-parity.mjs').code).toBe(0)
    write(
      'apps/admin/app/api/v2/sites/[siteId]/widgets/route.ts',
      'export function GET() { return withSiteAutomation() }\n',
    )
    const unregistered = run('scan-surface-parity.mjs')
    expect(unregistered.code).toBe(1)
    expect(unregistered.out).toContain(
      'unregistered capability: automation sites/[siteId]/widgets',
    )
    expect(unregistered.out).toContain(
      'undocumented v2 route: sites/[siteId]/widgets',
    )
    rmSync(path.join(sandbox, 'apps/admin/app/api/v2/sites/[siteId]/widgets'), {
      recursive: true,
    })
    const map = JSON.parse(
      spawnSync(
        'cat',
        [path.join(sandbox, 'scripts/harness/surface-map.json')],
        { encoding: 'utf8' },
      ).stdout,
    )
    map.capabilities[0].automation = []
    write('scripts/harness/surface-map.json', JSON.stringify(map))
    const missing = run('scan-surface-parity.mjs')
    expect(missing.code).toBe(1)
    expect(missing.out).toContain('missing surface: desk-review automation')
  })

  it('passes on the real repository through the baseline', () => {
    for (const scan of [
      'scan-layer-imports.mjs',
      'scan-env-access.mjs',
      'scan-route-shape.mjs',
      'scan-surface-parity.mjs',
    ]) {
      const result = spawnSync(
        'node',
        [path.join(repo, 'scripts/harness', scan)],
        { encoding: 'utf8' },
      )
      expect(result.status, `${scan}: ${result.stderr}`).toBe(0)
    }
  })
})
