import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import {
  createWorkspace as createPublicWorkspace,
  openWorkspace as openPublicWorkspace,
} from '../../../packages/operator/src/index.ts'
import { workspaceSyncPort } from '../../../packages/operator/src/core/workspace-ports.ts'

const createWorkspace = (input) =>
  workspaceSyncPort(createPublicWorkspace(input))
const openWorkspace = (input) => workspaceSyncPort(openPublicWorkspace(input))

const resources = []
const directories = []
afterEach(async () => {
  for (const workspace of resources.splice(0)) workspace.close()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'publisher-local-domain-'),
  )
  directories.push(directory)
  const database = path.join(directory, 'workspace.sqlite')
  const workspace = createWorkspace({
    path: database,
    siteId: 'example',
    writerId: 'writer-one',
    identity: {
      name: 'Example News',
      canonicalOrigin: 'https://example.com',
      themeId: 'editorial',
    },
  })
  resources.push(workspace)
  const execute = (operationId, command) =>
    workspace.execute({
      operationId,
      expectedRevision: workspace.status().currentRevision,
      command,
    })
  return { directory, database, workspace, execute }
}

const article = {
  sourceId: 'example-article',
  sourceUrl: 'https://example.com/source',
  slug: 'example-article',
  title: 'A carefully sourced example article',
  excerpt: 'A concise description of a general example article.',
  bodyMarkdown:
    '# A real Markdown source\n\nThe article source remains Markdown.',
  author: 'Example Reporter',
  authorSlug: 'reporter',
  seoTitle: 'A carefully sourced example article',
  seoDescription:
    'An example article used to verify the local editorial authority.',
  status: 'draft',
  publishedAt: '2026-10-24T00:00:00.000Z',
  categories: ['news'],
  tags: ['analysis'],
}

async function authorAndTaxonomy(execute) {
  execute('author', {
    kind: 'author.upsert',
    input: {
      slug: 'reporter',
      name: 'Example Reporter',
      bio: 'Reports general news.',
      editorialPersona: 'Write precise sourced reporting.',
    },
  })
  execute('category', {
    kind: 'taxonomy.upsert',
    collection: 'categories',
    input: { slug: 'news', name: 'News' },
  })
  execute('tag', {
    kind: 'taxonomy.upsert',
    collection: 'tags',
    input: { slug: 'analysis', name: 'Analysis' },
  })
}

describe('ARCH-008 local editorial and capture boundaries', () => {
  it('persists actual news editing with private personas, Markdown and revision-checked settings', async () => {
    const { database, workspace, execute } = await fixture()
    await authorAndTaxonomy(execute)
    execute('article', { kind: 'post.upsert', input: article })
    const id = workspace.read().content.posts[0].id
    execute('article-edit', {
      kind: 'post.upsert',
      id,
      input: { ...article, title: 'A revised example article' },
    })
    execute('settings', {
      kind: 'settings.update',
      input: {
        ...workspace.read().content.settings,
        description: 'Independent general news.',
      },
    })
    expect(workspace.status().currentRevision).toBe(6)
    workspace.close()
    const reopened = openWorkspace({
      path: database,
      siteId: 'example',
      writerId: 'writer-one',
    })
    resources.push(reopened)
    expect(reopened.read().content.posts[0]).toMatchObject({
      title: 'A revised example article',
      revision: 2,
      bodyMarkdown: article.bodyMarkdown,
      categories: ['news'],
      tags: ['analysis'],
    })
    expect(reopened.read().content.authors[0].editorialPersona).toBe(
      'Write precise sourced reporting.',
    )
    expect(reopened.read().content.settings.description).toBe(
      'Independent general news.',
    )
  })

  it('rolls invalid changes back and retains the existing publication desk gate', async () => {
    const { workspace, execute } = await fixture()
    await authorAndTaxonomy(execute)
    execute('article', { kind: 'post.upsert', input: article })
    expect(() =>
      execute('duplicate', { kind: 'post.upsert', input: article }),
    ).toThrow(/identity.*exists/i)
    expect(() =>
      execute('invalid-tag', {
        kind: 'post.upsert',
        input: {
          ...article,
          sourceId: 'invalid',
          slug: 'invalid',
          tags: ['unknown'],
        },
      }),
    ).toThrow(/unsupported tag/i)
    const id = workspace.read().content.posts[0].id
    expect(() =>
      execute('publish-without-review', {
        kind: 'post.upsert',
        id,
        input: { ...article, status: 'published' },
      }),
    ).toThrow(/desk approval/i)
    expect(() =>
      execute('archive-author', {
        kind: 'author.upsert',
        slug: 'reporter',
        input: {
          name: 'Example Reporter',
          bio: 'Reports general news.',
          active: false,
        },
      }),
    ).toThrow(/reassign/i)
    expect(workspace.status().currentRevision).toBe(4)
    expect(workspace.read().content.posts).toHaveLength(1)
  })

  it('refuses an incomplete local media closure instead of falsely producing a complete snapshot', async () => {
    const { directory, execute, workspace } = await fixture()
    await authorAndTaxonomy(execute)
    execute('article-media', {
      kind: 'post.upsert',
      input: { ...article, imageUrl: '/media/example.png' },
    })
    await expect(
      workspace.capture({
        destination: path.join(directory, 'capture.sqlite'),
      }),
    ).rejects.toThrow(/media closure/i)
  })

  it('reads capture revision from the real backup image while local changes continue', async () => {
    const { directory, workspace, execute } = await fixture()
    execute('one', { kind: 'guidance.update', markdown: 'First source' })
    const capture = workspace.capture({
      destination: path.join(directory, 'concurrent.sqlite'),
    })
    execute('two', { kind: 'guidance.update', markdown: 'Second source' })
    const snapshot = await capture
    const restored = openWorkspace({
      path: snapshot.path,
      siteId: 'example',
      writerId: 'writer-one',
    })
    resources.push(restored)
    expect(snapshot.revision).toBe(restored.status().currentRevision)
    expect(workspace.preparationMayResume()).toBe(true)
    expect(restored.preparationMayResume()).toBe(false)
    expect(restored.read().guidance).toBe(
      snapshot.revision === 1 ? 'First source' : 'Second source',
    )
    expect(workspace.status().currentRevision).toBe(2)
  })

  it('keeps ciphertext out of snapshots and reports missing original spool without regenerating it', async () => {
    const { database, directory, workspace } = await fixture()
    workspace.prepareOperation({
      operationId: 'external-spool',
      intent: 'pinned source intent',
    })
    workspace.recordPreparedPayload({
      operationId: 'external-spool',
      payload: 'PRIVATE CIPHERTEXT SENTINEL',
    })
    const captured = await workspace.capture({
      destination: path.join(directory, 'spool-free.sqlite'),
    })
    expect(
      Buffer.from(captured.bytes).includes(
        Buffer.from('PRIVATE CIPHERTEXT SENTINEL'),
      ),
    ).toBe(false)
    const spoolDirectory = `${database}.operations`
    const [filename] = await readdir(spoolDirectory)
    expect(
      JSON.parse(await readFile(path.join(spoolDirectory, filename), 'utf8'))
        .payload,
    ).toBe('PRIVATE CIPHERTEXT SENTINEL')
    await rm(path.join(spoolDirectory, filename))
    expect(workspace.operation('external-spool')).toMatchObject({
      kind: 'prepared',
      stage: 'unavailable',
    })
    expect(() =>
      workspace.recordPreparedPayload({
        operationId: 'external-spool',
        payload: 'regenerated bytes',
      }),
    ).toThrow(/conflict/i)
    expect(workspace.operation('external-spool')).toMatchObject({
      stage: 'unavailable',
    })
  })

  it('rejects modified content without resetting or repairing the source database', async () => {
    const { database, workspace } = await fixture()
    workspace.close()
    const raw = new DatabaseSync(database)
    raw.prepare('UPDATE workspace SET payload=?').run('{"modified":true}')
    raw.close()
    expect(() =>
      openWorkspace({
        path: database,
        siteId: 'example',
        writerId: 'writer-one',
      }),
    ).toThrow(/corrupt/i)
    const observer = new DatabaseSync(database)
    expect(
      observer.prepare('SELECT payload FROM workspace').get().payload,
    ).toBe('{"modified":true}')
    observer.close()
  })
})
