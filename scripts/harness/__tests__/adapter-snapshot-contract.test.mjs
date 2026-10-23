import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileContentRepository } from '../../../apps/admin/app/lib/adapters/file-content-repository.ts'
import { FileAdapterRepository } from '../../../apps/admin/app/lib/adapters/file-adapter-repository.ts'
import { cloneAdapterInstallations } from '../../../packages/content/src/index.ts'

describe('adapter snapshot secrecy and clone contract', () => {
  it('publishes only enabled public configuration and removes secret references on clone', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-adapter-snapshot-'),
    )
    try {
      const adapters = new FileAdapterRepository(directory, 'default')
      const configured = await adapters.configure('platform.static-marker', {
        label: 'Published marker',
        showInArticleFooter: true,
      })
      await adapters.setState(
        configured.adapterId,
        'enabled',
        configured.revision,
      )

      const published = await new FileContentRepository(directory).publish()
      expect(published.snapshot.schemaVersion).toBe(4)
      expect(published.snapshot.adapters).toEqual({
        schemaVersion: 2,
        installations: [
          {
            adapterId: 'platform.static-marker',
            definitionVersion: '1.0.0',
            configuration: {
              label: 'Published marker',
              showInArticleFooter: true,
            },
          },
        ],
      })
      expect(JSON.stringify(published.snapshot)).not.toContain(
        'secretReferences',
      )

      const cloned = cloneAdapterInstallations(
        [
          {
            ...(await adapters.get('platform.static-marker')),
            secretReferences: ['ADAPTER_SECRET_REFERENCE'],
          },
        ],
        'default',
        ['platform.static-marker'],
      )
      expect(cloned[0].state).toBe('disabled')
      expect(cloned[0].secretReferences).toEqual([])
      expect(JSON.stringify(cloned)).not.toContain('ADAPTER_SECRET_REFERENCE')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
