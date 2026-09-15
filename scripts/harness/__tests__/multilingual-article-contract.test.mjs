import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertValidArticleLocales,
  isValidLocale,
  validateArticleLocales,
} from '../../../packages/content/src/article-adapter.ts'
import { FileArticleRepositoryAdapter } from '../../../apps/admin/app/lib/article-repository-adapter.ts'
import {
  GET,
  PUT,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/articles/[id]/route.ts'

let apiDirectory
const originalEnvironment = {}

describe('POST-001 multilingual article contract', () => {
  it('validates canonical unique locales and persists variant revisions atomically', async () => {
    expect(isValidLocale('ko-KR')).toBe(true)
    expect(isValidLocale('not a locale')).toBe(false)
    expect(
      validateArticleLocales([{ locale: 'en-US' }, { locale: 'en-US' }]),
    ).toHaveLength(1)
    expect(() =>
      assertValidArticleLocales([{ locale: 'en-US' }, { locale: 'en-US' }]),
    ).toThrow('unique')
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-articles-'),
    )
    try {
      const repository = new FileArticleRepositoryAdapter(directory)
      const [article] = await repository.list()
      const updated = await repository.saveVariant(
        article.id,
        {
          locale: 'ko-KR',
          slug: 'korean-article',
          title: '한국어 기사',
          excerpt: '요약',
          bodyMarkdown: '본문',
          seoTitle: '한국어 기사',
          seoDescription: '설명',
          status: 'published',
          revision: 0,
          publishedAt: '2026-08-22T00:00:00.000Z',
          updatedAt: '2026-08-22T00:00:00.000Z',
        },
        article.revision,
      )
      expect(updated.variants.map(({ locale }) => locale)).toEqual([
        'en-US',
        'ko-KR',
      ])
      await expect(
        repository.saveVariant(
          article.id,
          updated.variants[1],
          article.revision,
        ),
      ).rejects.toThrow('conflict')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('POST-001 article API', () => {
  beforeEach(async () => {
    apiDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'publisher-article-api-'),
    )
    for (const name of ['ADMIN_DATA_DIR', 'ADMIN_AUTOMATION_KEYS', 'NODE_ENV'])
      originalEnvironment[name] = process.env[name]
    process.env.ADMIN_DATA_DIR = apiDirectory
    process.env.NODE_ENV = 'test'
    process.env.ADMIN_AUTOMATION_KEYS = JSON.stringify([
      {
        id: 'editor',
        role: 'editor',
        sha256: createHash('sha256').update('editor-token').digest('hex'),
        sites: ['default'],
      },
    ])
  })

  afterEach(async () => {
    await rm(apiDirectory, { recursive: true, force: true })
    for (const name of [
      'ADMIN_DATA_DIR',
      'ADMIN_AUTOMATION_KEYS',
      'NODE_ENV',
    ]) {
      if (originalEnvironment[name] === undefined) delete process.env[name]
      else process.env[name] = originalEnvironment[name]
    }
  })

  it('requires automation and rejects stale aggregate revisions', async () => {
    const articleId = 'article-sample-01'
    const context = {
      params: Promise.resolve({ siteId: 'default', id: articleId }),
    }
    const unauthorized = await GET(
      new Request(
        `https://admin.example/api/v2/sites/default/articles/${articleId}`,
      ),
      context,
    )
    expect(unauthorized.status).toBe(401)

    const headers = { Authorization: 'Bearer editor-token' }
    const first = await GET(
      new Request(
        `https://admin.example/api/v2/sites/default/articles/${articleId}`,
        {
          headers,
        },
      ),
      context,
    )
    expect(first.status).toBe(200)
    const current = (await first.json()).article
    const response = await PUT(
      new Request(
        `https://admin.example/api/v2/sites/default/articles/${articleId}`,
        {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'If-Match': String(current.revision),
          },
          body: JSON.stringify({
            locale: 'ko-KR',
            slug: 'korean-article',
            title: '한국어 기사',
            excerpt: '요약',
            bodyMarkdown: '본문',
            seoTitle: '한국어 기사',
            seoDescription: '설명',
            status: 'published',
            publishedAt: '2026-08-22T00:00:00.000Z',
          }),
        },
      ),
      context,
    )
    expect(response.status).toBe(200)
    expect((await response.json()).article.variants).toHaveLength(2)

    const stale = await PUT(
      new Request(
        'https://admin.example/api/v2/sites/default/articles/article-source-1',
        {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'If-Match': String(current.revision),
          },
          body: JSON.stringify({
            locale: 'ko-KR',
            slug: 'korean-article',
            title: 'stale',
            excerpt: 'stale',
            bodyMarkdown: 'stale',
            seoTitle: 'stale',
            seoDescription: 'stale',
            status: 'draft',
            publishedAt: '2026-08-22T00:00:00.000Z',
          }),
        },
      ),
      context,
    )
    expect(stale.status).toBe(409)
  })
})
