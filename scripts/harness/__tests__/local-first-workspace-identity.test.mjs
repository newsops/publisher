import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace,
  WorkspaceError,
} from '../../../packages/operator/src/index.ts'

const directories = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

describe('local-first publication identity boundary', () => {
  it.each(['not a URL', 'https://user:fixture-password@example.com'])(
    'rejects invalid canonical identity before creating private state: %s',
    async (canonicalOrigin) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'publisher-identity-'),
      )
      directories.push(directory)
      const file = path.join(directory, 'workspace.sqlite')
      let failure
      let workspace
      try {
        workspace = createWorkspace({
          path: file,
          siteId: 'example',
          writerId: 'writer-one',
          identity: {
            name: 'Example News',
            canonicalOrigin,
            themeId: 'editorial',
          },
        })
      } catch (error) {
        failure = error
      } finally {
        workspace?.close()
      }
      expect(failure).toBeInstanceOf(WorkspaceError)
      expect(failure.code).toBe('VALIDATION')
      expect(existsSync(file)).toBe(false)
      expect(String(failure)).not.toContain('fixture-password')
    },
  )
})
