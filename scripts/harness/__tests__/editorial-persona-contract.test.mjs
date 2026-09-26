import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'
import { deskFixtureApproval } from '../../../packages/content/src/index.ts'

let directory

describe('DATA-001 editorial taxonomy and private author persona', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-persona-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps categories, tags, and private personas separate in a public snapshot', async () => {
    const repository = new FileContentRepository(directory, 'second-site')
    // A second site starts with only the General category.
    await repository.saveCategory(undefined, {
      slug: 'analysis',
      name: 'Analysis',
    })
    await repository.saveTag(undefined, { slug: 'openai', name: 'OpenAI' })
    await repository.saveAuthor(undefined, {
      slug: 'reporter',
      name: 'Reporter',
      bio: 'Technology reporter.',
      editorialPersona: 'PRIVATE PERSONA SENTINEL',
    })
    const post = await repository.save(undefined, {
      sourceId: 'persona-contract',
      sourceUrl: 'https://www.publisher.com/source',
      slug: 'persona-contract',
      title: 'Persona contract',
      excerpt: 'A focused contract fixture.',
      bodyMarkdown: 'Body.',
      author: 'Reporter',
      authorSlug: 'reporter',
      seoTitle: 'Persona contract',
      seoDescription: 'A focused contract fixture.',
      status: 'review',
      publishedAt: '2026-09-15T00:00:00.000Z',
      categories: ['analysis'],
      tags: ['openai'],
    })
    expect(post.categories).toEqual(['analysis'])
    expect(post.tags).toEqual(['openai'])
    // Publication requires a desk approval bound to this content (EDIT-001).
    const approved = await repository.reviewPost(
      post.id,
      deskFixtureApproval(post),
    )
    await repository.save(post.id, { ...approved, status: 'published' })

    const published = await repository.publish('persona-contract-publication')
    expect(published.snapshot.categories.map((item) => item.slug)).toContain(
      'analysis',
    )
    expect(published.snapshot.tags.map((item) => item.slug)).toContain('openai')
    expect(
      published.snapshot.posts.find((item) => item.slug === 'persona-contract'),
    ).toMatchObject({
      categories: ['analysis'],
      tags: ['openai'],
    })
    expect(JSON.stringify(published.snapshot)).not.toContain(
      'PRIVATE PERSONA SENTINEL',
    )
  })

  it('rejects a post tag from a different taxonomy collection', async () => {
    const repository = new FileContentRepository(directory, 'second-site')
    await expect(
      repository.save(undefined, {
        sourceId: 'invalid-tag',
        sourceUrl: 'https://www.publisher.com/invalid',
        slug: 'invalid-tag',
        title: 'Invalid tag',
        excerpt: 'Invalid.',
        bodyMarkdown: 'Invalid.',
        author: 'Reporter',
        authorSlug: 'reporter',
        seoTitle: 'Invalid tag',
        seoDescription: 'Invalid.',
        status: 'draft',
        publishedAt: '2026-09-15T00:00:00.000Z',
        categories: ['analysis'],
        tags: ['analysis'],
      }),
    ).rejects.toThrow('unsupported tag')
  })
})
