import { describe, expect, it } from 'vitest'

import {
  archiveSummary,
  validateEditorialArchive,
} from '../../../packages/content/src/archive.ts'

function fixture() {
  return {
    schemaVersion: 1,
    settings: {
      name: 'Generic News',
      shortName: 'Generic',
      description: 'A generic archive fixture.',
      canonicalOrigin: 'https://archive.example.test',
      language: 'en',
      locale: 'en-US',
      publisherName: 'Generic News',
      themeId: 'editorial',
    },
    authors: [{ slug: 'editor', name: 'Editor', bio: 'Fixture editor.' }],
    tags: [{ slug: 'General', name: 'General' }],
    media: [
      {
        assetPath: 'media/pixel.png',
        sha256: 'a'.repeat(64),
        mimeType: 'image/png',
        byteSize: 68,
      },
    ],
    posts: [
      {
        sourceId: 'archive-1',
        sourceUrl: 'https://archive.example.test/2026/09/archive-story.html',
        slug: 'archive-story',
        title: 'Archive story',
        excerpt: 'A generic archive summary.',
        bodyHtml: '<p>Generic archive body.</p>',
        author: 'Editor',
        authorSlug: 'editor',
        seoTitle: 'Archive story',
        seoDescription: 'A generic archive summary.',
        publishedAt: '2026-09-13T00:00:00.000Z',
        categories: ['General'],
        imageAsset: 'media/pixel.png',
      },
    ],
  }
}

describe('archive restore contract', () => {
  it('accepts a generic versioned archive and exposes only a summary', () => {
    const archive = validateEditorialArchive(fixture())
    expect(archiveSummary(archive)).toEqual({
      schemaVersion: 1,
      counts: { authors: 1, tags: 1, posts: 1, media: 1 },
    })
  })

  it.each([
    ['traversal', (value) => (value.media[0].assetPath = '../private.png')],
    ['absolute asset', (value) => (value.media[0].assetPath = '/private.png')],
    [
      'credential origin',
      (value) =>
        (value.settings.canonicalOrigin =
          'https://name:password@archive.example.test'),
    ],
    ['unknown author', (value) => (value.posts[0].authorSlug = 'unknown')],
    ['unknown tag', (value) => (value.posts[0].categories = ['Unknown'])],
    ['invalid checksum', (value) => (value.media[0].sha256 = 'bad')],
    [
      'secret sentinel',
      (value) => (value.posts[0].bodyHtml = 'fixture-secret-sentinel'),
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = fixture()
    mutate(value)
    expect(() => validateEditorialArchive(value)).toThrow('Invalid archive')
  })
})
