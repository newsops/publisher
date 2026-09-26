import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('provider-neutral release contract', () => {
  it('exposes one common queued publication worker without a provider deployment default', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    )
    expect(packageJson.scripts['publication:worker']).toContain(
      'publication-worker.ts',
    )
    expect(packageJson.scripts['publication:next']).toContain('--next')
    expect(packageJson.scripts['publication:rollback']).toContain('--rollback')
    expect(packageJson.scripts['deploy:preflight']).toContain('preflight.mjs')
    for (const removed of [
      'deploy:platform',
      'deploy:content',
      'deploy:release',
      'deploy:rollback',
    ])
      expect(packageJson.scripts[removed]).toBeUndefined()
  })

  it('uses versioned same-origin data and non-conflicting cache directives', () => {
    const headers = fs.readFileSync(
      path.join(root, 'apps/site/public/_headers'),
      'utf8',
    )
    const metadata = fs.readFileSync(
      path.join(root, 'scripts/generate-public-metadata.mjs'),
      'utf8',
    )
    const worker = [
      'scripts/deploy/publication-worker.ts',
      'scripts/deploy/publication-worker-core.ts',
      'scripts/deploy/publication-worker-artifacts.ts',
    ]
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
      .join('\n')
    expect(headers).not.toContain('stale-while-revalidate')
    expect(headers).toContain('/data/immutable/*')
    expect(headers).not.toContain('/data/*\n')
    expect(metadata).toContain('data/immutable/search-index.${releaseId}.json')
    expect(worker).toContain(
      'manifests/${manifest.siteId}/${manifest.releaseId}.json',
    )
    expect(worker).toContain('runNextPublicationJob')
  })
})
