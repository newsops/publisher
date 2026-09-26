import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

async function source(path) {
  return readFile(resolve(root, path), 'utf8')
}

describe('admin media management contract', () => {
  it('returns a site-scoped browser view with no object-store internals', async () => {
    const route = await source('apps/admin/app/api/media/route.ts')
    const view = await source('apps/admin/app/lib/http/media-view.ts')

    expect(route).toContain("requireIdentity(request, 'publisher')")
    expect(route).toContain('repositoryForRequest(request, identity)')
    expect(route).toContain('browserMediaView')
    expect(view).toContain('objectKey: _objectKey')
    expect(view).toContain("media.state === 'approved'")
    expect(view).not.toContain('endpoint')
  })

  it('serves previews only through the authenticated admin route', async () => {
    const preview = await source(
      'apps/admin/app/api/media/[id]/preview/route.ts',
    )
    const panel = await source('apps/admin/app/MediaLibraryPanel.tsx')

    expect(preview).toContain("requireIdentity(request, 'publisher')")
    expect(preview).toContain('repositoryForRequest(request, identity)')
    expect(preview).toContain("'cache-control': 'private, no-store'")
    expect(preview).toContain("'x-content-type-options': 'nosniff'")
    expect(panel).toContain('/api/media/${encodeURIComponent(item.id)}/preview')
    expect(panel).toContain('Uploading image…')
  })

  it('offers approved library media in the attributed-image Markdown form', async () => {
    const editor = await source('apps/admin/app/PostEditor.tsx')
    const variants = await source('apps/admin/app/ArticleVariantEditor.tsx')

    expect(editor).toContain('Select approved media…')
    expect(editor).toContain('approvedMedia.map')
    expect(editor).toContain('Alternative text')
    expect(editor).toContain('Caption')
    expect(editor).toContain('Source name')
    expect(editor).toContain('Source URL')
    expect(editor).toContain("'bodyMarkdown'")
    expect(variants).toContain("'bodyMarkdown'")
    expect(variants).not.toContain("'bodyHtml',")
  })
})
