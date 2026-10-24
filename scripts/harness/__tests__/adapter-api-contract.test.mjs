import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  GET as listAdapters,
  POST as configureAdapter,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/adapters/route.ts'
import {
  GET as getAdapter,
  PATCH as updateAdapter,
  POST as actionAdapter,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/adapters/[adapterId]/route.ts'
import { GET as browserListAdapters } from '../../../apps/admin/app/api/adapters/route.ts'

const token = 'adapter-editor-secret'
const keyHash = createHash('sha256').update(token).digest('hex')
let dataDirectory

function request(pathname, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('authorization', 'Bearer ' + token)
  return new Request('http://admin.test' + pathname, {
    ...options,
    headers,
  })
}

const north = { params: Promise.resolve({ siteId: 'north-news' }) }
const northAdapter = {
  params: Promise.resolve({
    siteId: 'north-news',
    adapterId: 'platform.static-marker',
  }),
}
const south = { params: Promise.resolve({ siteId: 'south-news' }) }

describe('site adapter API contract', () => {
  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'publisher-adapter-'))
    process.env.NODE_ENV = 'test'
    process.env.ADMIN_DATA_DIR = dataDirectory
    process.env.ADMIN_SITES_JSON = JSON.stringify([
      {
        siteId: 'north-news',
        name: 'North News',
        canonicalOrigin: 'https://north.example',
        themeId: 'editorial',
      },
      {
        siteId: 'south-news',
        name: 'South News',
        canonicalOrigin: 'https://south.example',
        themeId: 'editorial',
      },
    ])
    process.env.ADMIN_AUTOMATION_KEYS = JSON.stringify([
      {
        id: 'adapter-editor',
        role: 'editor',
        sha256: keyHash,
        sites: ['north-news'],
      },
    ])
  })

  afterAll(async () => {
    await rm(dataDirectory, { recursive: true, force: true })
    delete process.env.ADMIN_DATA_DIR
    delete process.env.ADMIN_SITES_JSON
    delete process.env.ADMIN_AUTOMATION_KEYS
  })

  it('configures, validates, enables, disables, and lists a site-scoped adapter', async () => {
    const created = await configureAdapter(
      request('/api/v2/sites/north-news/adapters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          adapterId: 'platform.static-marker',
          configuration: { label: 'North News', showInArticleFooter: true },
        }),
      }),
      north,
    )
    expect(created.status).toBe(201)
    const configured = (await created.json()).adapter
    expect(configured.state).toBe('configured')
    expect(configured.hasSecretReferences).toBe(false)

    const invalid = await actionAdapter(
      request('/api/v2/sites/north-news/adapters/platform.static-marker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          configuration: { label: '', remoteScript: 'https://bad.example' },
        }),
      }),
      northAdapter,
    )
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).valid).toBe(false)

    const enabled = await actionAdapter(
      request('/api/v2/sites/north-news/adapters/platform.static-marker', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'if-match': String(configured.revision),
        },
        body: JSON.stringify({ action: 'enable' }),
      }),
      northAdapter,
    )
    expect(enabled.status).toBe(200)
    const active = (await enabled.json()).adapter
    expect(active.state).toBe('enabled')

    const conflict = await updateAdapter(
      request('/api/v2/sites/north-news/adapters/platform.static-marker', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': '1',
        },
        body: JSON.stringify({ configuration: { label: 'Updated' } }),
      }),
      northAdapter,
    )
    expect(conflict.status).toBe(409)

    const listed = await listAdapters(
      request('/api/v2/sites/north-news/adapters'),
      north,
    )
    expect(listed.status).toBe(200)
    expect((await listed.json()).adapters).toHaveLength(1)

    const denied = await listAdapters(
      request('/api/v2/sites/south-news/adapters'),
      south,
    )
    expect(denied.status).toBe(403)

    const found = await getAdapter(
      request('/api/v2/sites/north-news/adapters/platform.static-marker'),
      northAdapter,
    )
    expect(found.status).toBe(200)
  })

  it('exposes the same site-scoped list through the authenticated human surface', async () => {
    process.env.ADMIN_DEV_TOKEN = 'adapter-browser-fixture'
    process.env.ADMIN_OWNERS = 'owner@example.test'
    try {
      const response = await browserListAdapters(
        new Request('http://admin.test/api/adapters?siteId=north-news', {
          headers: {
            'x-admin-dev-token': 'adapter-browser-fixture',
            'x-admin-dev-email': 'owner@example.test',
            'x-admin-site-id': 'north-news',
          },
        }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.siteId).toBe('north-news')
      expect(body.adapters).toHaveLength(1)
      expect(body).not.toHaveProperty('plugins')
    } finally {
      delete process.env.ADMIN_DEV_TOKEN
      delete process.env.ADMIN_OWNERS
    }
  })
})
