import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  GET as listPlugins,
  POST as configurePlugin,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/plugins/route.ts'
import {
  GET as getPlugin,
  PATCH as updatePlugin,
  POST as actionPlugin,
} from '../../../apps/admin/app/api/v2/sites/[siteId]/plugins/[pluginId]/route.ts'

const token = 'plugin-editor-secret'
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
const northPlugin = {
  params: Promise.resolve({
    siteId: 'north-news',
    pluginId: 'platform.static-marker',
  }),
}
const south = { params: Promise.resolve({ siteId: 'south-news' }) }

describe('site plugin API contract', () => {
  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'publisher-plugin-'))
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
        id: 'plugin-editor',
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

  it('configures, validates, enables, disables, and lists a site-scoped plugin', async () => {
    const created = await configurePlugin(
      request('/api/v2/sites/north-news/plugins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pluginId: 'platform.static-marker',
          configuration: { label: 'North News', showInArticleFooter: true },
        }),
      }),
      north,
    )
    expect(created.status).toBe(201)
    const configured = (await created.json()).plugin
    expect(configured.state).toBe('configured')
    expect(configured.hasSecretReferences).toBe(false)

    const invalid = await actionPlugin(
      request('/api/v2/sites/north-news/plugins/platform.static-marker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          configuration: { label: '', remoteScript: 'https://bad.example' },
        }),
      }),
      northPlugin,
    )
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).valid).toBe(false)

    const enabled = await actionPlugin(
      request('/api/v2/sites/north-news/plugins/platform.static-marker', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'if-match': String(configured.revision),
        },
        body: JSON.stringify({ action: 'enable' }),
      }),
      northPlugin,
    )
    expect(enabled.status).toBe(200)
    const active = (await enabled.json()).plugin
    expect(active.state).toBe('enabled')

    const conflict = await updatePlugin(
      request('/api/v2/sites/north-news/plugins/platform.static-marker', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': '1',
        },
        body: JSON.stringify({ configuration: { label: 'Updated' } }),
      }),
      northPlugin,
    )
    expect(conflict.status).toBe(409)

    const listed = await listPlugins(
      request('/api/v2/sites/north-news/plugins'),
      north,
    )
    expect(listed.status).toBe(200)
    expect((await listed.json()).plugins).toHaveLength(1)

    const denied = await listPlugins(
      request('/api/v2/sites/south-news/plugins'),
      south,
    )
    expect(denied.status).toBe(403)

    const found = await getPlugin(
      request('/api/v2/sites/north-news/plugins/platform.static-marker'),
      northPlugin,
    )
    expect(found.status).toBe(200)
  })
})
