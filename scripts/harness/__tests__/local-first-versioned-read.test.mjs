import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace,
  openWorkspace,
  WorkspaceError,
} from '../../../packages/operator/src/index.ts'

const resources = []
const directories = []
afterEach(async () => {
  for (const workspace of resources.splice(0)) workspace.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-versioned-read-'),
  )
  directories.push(directory)
  const location = {
    path: path.join(directory, 'workspace.sqlite'),
    siteId: 'example',
    writerId: 'writer-one',
  }
  const first = createWorkspace({
    ...location,
    identity: {
      name: 'Example News',
      canonicalOrigin: 'https://example.com',
      themeId: 'editorial',
    },
  })
  const second = openWorkspace(location)
  resources.push(first, second)
  return { location, first, second }
}

describe('ARCH-008 version-bound local document reads', () => {
  it('returns the document version with its data and rejects a stale save after another handle changes it', async () => {
    const { first, second } = await fixture()
    const original = first.read()
    expect(original).toMatchObject({ revision: 0, guidance: '' })
    second.execute({
      operationId: 'second-save',
      expectedRevision: original.revision,
      command: {
        kind: 'guidance.update',
        markdown: 'Saved by the second handle',
      },
    })
    expect(first.status().currentRevision).toBe(1)
    expect(original).toMatchObject({ revision: 0, guidance: '' })
    const staleRequest = {
      operationId: 'stale-first-save',
      expectedRevision: original.revision,
      command: { kind: 'guidance.update', markdown: 'Unsaved first draft' },
    }
    expect(() => first.execute(staleRequest)).toThrow(WorkspaceError)
    expect(() => first.execute(staleRequest)).toThrow(/revision conflict/)
    expect(staleRequest.command.markdown).toBe('Unsaved first draft')
    const current = first.read()
    expect(current).toMatchObject({
      revision: 1,
      guidance: 'Saved by the second handle',
    })
    expect(
      first.execute({
        operationId: 'current-first-save',
        expectedRevision: current.revision,
        command: {
          kind: 'guidance.update',
          markdown: 'Explicitly revised current draft',
        },
      }),
    ).toEqual({ operationId: 'current-first-save', revision: 2 })
    expect(second.read()).toMatchObject({
      revision: 2,
      guidance: 'Explicitly revised current draft',
    })
    expect(original).toMatchObject({ revision: 0, guidance: '' })
  })

  it('keeps a versioned read available without granting another writer mutation authority', async () => {
    const { location, first } = await fixture()
    const other = openWorkspace({ ...location, writerId: 'other-writer' })
    resources.push(other)
    const read = other.read()
    expect(read).toMatchObject({ revision: 0, guidance: '' })
    expect(() =>
      other.execute({
        operationId: 'unauthorized-save',
        expectedRevision: read.revision,
        command: { kind: 'guidance.update', markdown: 'Must not persist' },
      }),
    ).toThrow(/writer authority denied/)
    expect(first.read()).toMatchObject({ revision: 0, guidance: '' })
  })
})
