import { describe, expect, it } from 'vitest'
import {
  parseCanonicalXStatusUrl,
  resolveXPostOEmbed,
} from '../../../apps/admin/app/lib/x-oembed.ts'
import { sanitizeBodyHtml } from '../../../packages/content/src/editor.ts'
import { getTheme } from '../../../packages/content/src/themes.ts'
import { createPublisherAdminClient } from '../../../packages/admin-client/src/client.js'

const canonical = 'https://x.com/thsottiaux/status/2097559315150426222'
const fixture = {
  author_name: 'Tibo',
  author_url: 'https://x.com/thsottiaux',
  html: '<blockquote class="twitter-tweet"><p lang="en">Demand is unprecedented &amp; existing users come first.</p><a href="https://x.com/thsottiaux/status/2097559315150426222">September 9, 2026</a></blockquote>',
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('X oEmbed editorial contract', () => {
  it('only accepts canonical numeric X status URLs', () => {
    expect(parseCanonicalXStatusUrl(`${canonical}?s=20`).url).toBe(canonical)
    for (const invalid of [
      'https://twitter.com/thsottiaux/status/2097559315150426222',
      'https://example.com/thsottiaux/status/2097559315150426222',
      'https://x.com/thsottiaux/status/not-a-number',
    ])
      expect(() => parseCanonicalXStatusUrl(invalid)).toThrow('canonical')
  })

  it('turns oEmbed data into a static, sanitized source card', async () => {
    const embed = await resolveXPostOEmbed(canonical, {
      fetch: async () => response(fixture),
    })
    const output = sanitizeBodyHtml(`<p>Reporting context.</p>${embed.html}`)
    expect(output).toContain('data-publisher-x-post="true"')
    expect(output).toContain(
      'Demand is unprecedented &amp; existing users come first.',
    )
    expect(output).toContain(canonical)
    expect(output).not.toContain('platform.twitter.com')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('<iframe')
  })

  it('reports provider failure and unsafe provider markup', async () => {
    await expect(
      resolveXPostOEmbed(canonical, { fetch: async () => response({}, 503) }),
    ).rejects.toMatchObject({ code: 'x_oembed_unavailable', status: 503 })
    await expect(
      resolveXPostOEmbed(canonical, {
        fetch: async () =>
          response({
            ...fixture,
            html: '<iframe src="https://evil.example"></iframe>',
          }),
      }),
    ).rejects.toMatchObject({ code: 'x_oembed_unsafe_response', status: 502 })
  })

  it('keeps the card stylesheet in the shared theme contract', () => {
    expect(getTheme('editorial').css).toContain('.publisher-x-post')
  })

  it('gives automation clients the same resolver endpoint and diagnostics', async () => {
    const calls = []
    const client = createPublisherAdminClient({
      origin: 'https://admin.example.test/',
      token: 'test-token',
      fetch: async (url, init) => {
        calls.push({ url, init })
        return response({
          siteId: 'demo',
          embed: { url: canonical, html: '<figure></figure>' },
        })
      },
    })

    await expect(client.resolveXPostEmbed('demo', canonical)).resolves.toEqual({
      status: 200,
      data: {
        siteId: 'demo',
        embed: { url: canonical, html: '<figure></figure>' },
      },
    })
    expect(calls).toEqual([
      {
        url: 'https://admin.example.test/api/v2/sites/demo/embeds/x',
        init: expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-token',
            'content-type': 'application/json',
          }),
          body: JSON.stringify({ url: canonical }),
        }),
      },
    ])

    const unavailable = createPublisherAdminClient({
      origin: 'https://admin.example.test',
      token: 'test-token',
      fetch: async () => response({ code: 'x_oembed_unavailable' }, 503),
    })
    await expect(
      unavailable.resolveXPostEmbed('demo', canonical),
    ).rejects.toMatchObject({
      code: 'REMOTE_ERROR',
      status: 503,
    })
  })
})
