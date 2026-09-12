import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('COMMENT-001 isolated comment contract', () => {
  it('keeps the comment service separate and article loading lazy', () => {
    const worker = fs.readFileSync(
      path.join(root, 'apps/comments/src/app.ts'),
      'utf8',
    )
    const packageJson = fs.readFileSync(
      path.join(root, 'apps/comments/package.json'),
      'utf8',
    )
    const environment = fs.readFileSync(
      path.join(root, 'apps/comments/.env.example'),
      'utf8',
    )
    const component = fs.readFileSync(
      path.join(root, 'apps/site/app/components/CommentSection.tsx'),
      'utf8',
    )
    const headers = fs.readFileSync(
      path.join(root, 'apps/site/public/_headers'),
      'utf8',
    )
    const edgeSmoke = fs.readFileSync(
      path.join(root, 'scripts/harness/edge-smoke.mjs'),
      'utf8',
    )
    const article = [
      'apps/site/app/[year]/[month]/[slug]/page.tsx',
      'apps/site/app/components/StaticArticlePage.tsx',
    ]
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
      .join('\n')
    const runtime = fs.readFileSync(
      path.join(root, 'apps/site/public/site-runtime/comments.v1.js'),
      'utf8',
    )
    expect(packageJson).toContain('src/node.ts')
    expect(environment).toContain('COMMENTS_DATABASE_URL')
    expect(environment).toContain('HUMAN_VERIFICATION_URL')
    expect(worker).toContain(
      's-maxage=60, stale-while-revalidate=600, stale-if-error=86400',
    )
    expect(worker).toContain('Human verification failed')
    expect(worker).toContain('COMMENTS_MODERATION_TOKEN')
    expect(runtime).toContain('IntersectionObserver')
    expect(runtime).toContain('AbortController')
    expect(component).toContain('Comments are temporarily unavailable.')
    expect(component).toContain('NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED')
    expect(runtime).toContain('publisher:verification-token')
    expect(runtime).toContain('verificationToken')
    expect(component).toContain('NEXT_PUBLIC_TURNSTILE_SITE_KEY')
    expect(component).toContain('/site-runtime/turnstile.v1.js')
    expect(runtime).not.toMatch(/challenges\.cloudflare\.com/i)
    expect(headers).toContain('Content-Security-Policy:')
    expect(headers).toContain("connect-src 'self'")
    expect(edgeSmoke).toContain('COMMENTS_RATE_LIMIT_SMOKE_URL')
    expect(edgeSmoke).toContain('__VERIFICATION_TOKEN__')
    expect(article).toContain('commentSlug: post.slug')
    expect(article).toContain('<CommentSection slug={article.commentSlug} />')
    expect(environment).not.toMatch(/^DATABASE_URL=/m)
    expect(environment).not.toContain('OBJECT_STORAGE_')
  })

  it('keeps comment reads out of synchronous static article HTML', () => {
    const output = path.join(root, 'apps/site/out')
    if (!fs.existsSync(output)) return
    const htmlFiles = []
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name)
        if (entry.isDirectory()) visit(target)
        else if (entry.name.endsWith('.html')) htmlFiles.push(target)
      }
    }
    visit(output)
    expect(htmlFiles.length).toBeGreaterThan(0)
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8')
      expect(html).not.toMatch(
        /<script[^>]+(?:comments\.publisher\.com|\/v1\/threads)/i,
      )
      expect(html).not.toContain('A useful comment.')
      expect(html).not.toContain('Submitted text')
      expect(html).not.toMatch(/admin\.publisher\.com/i)
    }
  })
})
