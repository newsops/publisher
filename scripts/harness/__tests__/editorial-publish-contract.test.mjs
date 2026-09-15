import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileContentRepository } from '../../../apps/admin/app/lib/repository.ts'

function editable(post, status, publishedAt = post.publishedAt) {
  return {
    sourceId: post.sourceId,
    sourceUrl: post.sourceUrl,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    author: post.author,
    authorSlug: post.authorSlug,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status,
    publishedAt,
    categories: post.categories,
    imageUrl: post.imageUrl,
    featured: post.featured,
  }
}

describe('editorial publish privacy contract', () => {
  it('publishes only public and due scheduled posts without mutating private state', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'editorial-publish-'),
    )
    const previousNodeEnvironment = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      const repository = new FileContentRepository(directory)
      const posts = await repository.list()
      for (const post of posts)
        await repository.save(post.id, editable(post, 'draft'))

      await repository.save(posts[0].id, editable(posts[0], 'published'))
      await repository.save(posts[1].id, editable(posts[1], 'review'))
      await repository.save(
        posts[2].id,
        editable(posts[2], 'scheduled', '2020-01-01T00:00:00.000Z'),
      )
      await repository.save(
        posts[3].id,
        editable(posts[3], 'scheduled', '2099-01-01T00:00:00.000Z'),
      )

      const result = await repository.publish()
      expect(result.snapshot.schemaVersion).toBe(4)
      expect(result.snapshot.media).toEqual([])
      expect(result.snapshot.plugins).toEqual({
        schemaVersion: 1,
        installations: [],
      })
      expect(result.snapshot.settings.name).toBe('Publisher')
      expect(result.snapshot.authors.map((author) => author.slug)).toEqual([
        'example-editor',
      ])
      expect(result.snapshot.tags.every((tag) => tag.active)).toBe(true)
      expect(result.snapshot.posts.map((post) => post.slug).sort()).toEqual(
        [posts[0].slug, posts[2].slug].sort(),
      )

      const privatePosts = await repository.list()
      expect(privatePosts.find((post) => post.id === posts[1].id)?.status).toBe(
        'review',
      )
      expect(privatePosts.find((post) => post.id === posts[3].id)?.status).toBe(
        'scheduled',
      )
    } finally {
      if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnvironment
      await rm(directory, { recursive: true, force: true })
    }
  })
})
