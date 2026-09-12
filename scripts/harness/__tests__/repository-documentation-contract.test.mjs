import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function requireFile(relativePath) {
  expect(fs.existsSync(path.join(root, relativePath))).toBe(true)
}

describe('repository handoff documentation contract', () => {
  it('provides a clean-checkout entry point with runnable commands', () => {
    const readme = read('README.md')
    for (const heading of [
      '# Publisher',
      '## Prerequisites',
      '## Local development',
      '## Useful commands',
      '## Repository layout',
      '## Public search model',
      '## Security and deployment boundaries',
    ])
      expect(readme).toContain(heading)
    for (const command of [
      'corepack pnpm install',
      'corepack pnpm dev',
      'corepack pnpm build',
      'corepack pnpm build:admin',
      'corepack pnpm typecheck',
      'corepack pnpm test',
      'corepack pnpm harness:scan',
    ])
      expect(readme).toContain(command)
  })

  it('keeps canonical specification links resolvable', () => {
    const files = [
      'AGENTS.md',
      'CLAUDE.md',
      '.agents/project-structure.md',
      'docs/development-spec.md',
      'docs/admin-api.md',
      'docs/admin-api.openapi.yaml',
      'docs/deployment.md',
      '.agents/spec-docs/done/WEB-001-static-public-site-and-admin.md',
    ]
    for (const file of files) requireFile(file)

    expect(read('README.md')).not.toContain('.agents/spec-docs/draft/')
    expect(read('specs/README.md')).not.toContain('.agents/spec-docs/draft/')
    expect(read('docs/development-spec.md')).not.toContain(
      '.agents/spec-docs/draft/',
    )
  })

  it('documents automation setup without tracking a real secret', () => {
    const content = [read('README.md'), read('docs/admin-api.md')].join('\n')
    for (const required of [
      'admin:api-key',
      'ADMIN_AUTOMATION_KEYS',
      'Authorization: Bearer',
      'publisher',
      'If-Match',
      'SHA-256',
    ])
      expect(content).toContain(required)
    expect(content).not.toMatch(/xrtn_[A-Za-z0-9_-]{20,}/)
    expect(content).not.toMatch(/ADMIN_AUTOMATION_KEYS=.*[a-f0-9]{64}/)
  })

  it('documents the public/admin deployment boundary and release guard', () => {
    const deployment = read('docs/deployment.md')
    for (const required of [
      'apps/site/out',
      'apps/admin',
      'admin.publisher.com',
      'deploy:preflight',
      'publication:worker',
      'DATABASE_URL',
      'OBJECT_STORAGE_BUCKET',
    ])
      expect(deployment).toContain(required)
  })

  it('documents honest included-usage billing without a fictitious R2 hard cap', () => {
    const content = [
      read('docs/deployment.md'),
      read('docs/ai-assisted-deployment.ko.md'),
    ].join('\n')
    for (const required of [
      'billingMode: "included-usage"',
      'overagePossible',
      'operatorAcknowledgedAt',
      'free-allowance-with-billing',
    ])
      expect(content).toContain(required)
  })

  it('documents portable managed static-host activation evidence', () => {
    const content = [
      read('docs/deployment.md'),
      read('docs/ai-assisted-deployment.ko.md'),
    ].join('\n')
    for (const required of [
      'managed-static-host',
      'STATIC_HOSTING_EVIDENCE_PATH',
      'candidateVerifiedAt',
      'activationObservedAt',
      'rollbackObservedAt',
      'Cloudflare Pages',
    ])
      expect(content).toContain(required)
  })

  it('keeps the agent-first direction and human authority boundary explicit', () => {
    const plan = read('docs/publication-platform-plan.ko.md')
    for (const required of [
      '에이전트 우선 운영 방향',
      'schema version',
      'idempotency key',
      'operation ID',
      'AUTHORITY_REQUIRED',
      'Device Authorization Grant',
    ])
      expect(plan).toContain(required)
  })
})
