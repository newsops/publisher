const SITE_STORAGE_KEY = 'publisher.admin.site'

export function getAdminSiteId(): string {
  if (typeof window === 'undefined') return 'default'
  return window.localStorage.getItem(SITE_STORAGE_KEY) ?? 'default'
}

export function setAdminSiteId(siteId: string): void {
  window.localStorage.setItem(SITE_STORAGE_KEY, siteId)
}

export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('x-admin-site-id', getAdminSiteId())
  return fetch(input, { ...init, headers, credentials: 'include' })
}
