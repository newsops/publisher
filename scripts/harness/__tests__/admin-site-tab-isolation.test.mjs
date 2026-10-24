import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adminFetch,
  getAdminSiteId,
  setAdminSiteId,
} from '../../../apps/admin/app/admin-client.ts'

const key = 'publisher.admin.site'
function storage() {
  const entries = new Map()
  return {
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => {
      entries.set(name, value)
    },
  }
}

function tabs() {
  const localStorage = storage()
  return {
    first: { localStorage, sessionStorage: storage() },
    second: { localStorage, sessionStorage: storage() },
    localStorage,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('INFRA-005 browser publication selection is tab scoped', () => {
  it('keeps every request paired with its own tab selection even when sites have equal revisions', async () => {
    const { first, second, localStorage } = tabs()
    const requests = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        requests.push({
          siteId: init.headers.get('x-admin-site-id'),
          revision: init.headers.get('if-match'),
        })
        return Response.json({ saved: true })
      }),
    )
    vi.stubGlobal('window', first)
    setAdminSiteId('default')
    vi.stubGlobal('window', second)
    setAdminSiteId('example')
    await adminFetch('/api/agent-guidance', {
      method: 'PATCH',
      headers: { 'if-match': '5' },
    })
    vi.stubGlobal('window', first)
    expect(getAdminSiteId()).toBe('default')
    await adminFetch('/api/agent-guidance', {
      method: 'PATCH',
      headers: { 'if-match': '5' },
    })
    localStorage.setItem(key, 'another-window-selection')
    await adminFetch('/api/posts')
    vi.stubGlobal('window', second)
    await adminFetch('/api/posts')
    expect(requests).toEqual([
      { siteId: 'example', revision: '5' },
      { siteId: 'default', revision: '5' },
      { siteId: 'default', revision: null },
      { siteId: 'example', revision: null },
    ])
  })

  it('ignores old shared selection and preserves this tab selection across a reload', () => {
    const { first, localStorage } = tabs()
    localStorage.setItem(key, 'other')
    vi.stubGlobal('window', first)
    expect(getAdminSiteId()).toBe('default')
    setAdminSiteId('example')
    expect(first.sessionStorage.getItem(key)).toBe('example')
    expect(localStorage.getItem(key)).toBe('other')
    vi.stubGlobal('window', { ...first })
    expect(getAdminSiteId()).toBe('example')
  })

  it('fails closed without a request when tab storage is denied rather than selecting the default site', () => {
    const denied = {
      getItem() {
        throw new DOMException('Storage denied', 'SecurityError')
      },
      setItem() {
        throw new DOMException('Storage denied', 'SecurityError')
      },
    }
    vi.stubGlobal('window', { localStorage: storage(), sessionStorage: denied })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(() => getAdminSiteId()).toThrow('Storage denied')
    expect(() => setAdminSiteId('example')).toThrow('Storage denied')
    expect(() => adminFetch('/api/posts', { method: 'PATCH' })).toThrow(
      'Storage denied',
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
