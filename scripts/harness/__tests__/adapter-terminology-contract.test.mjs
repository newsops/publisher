import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as content from '../../../packages/content/src/index.ts'
import { cliFixture } from './cli-fixture.mjs'

const root = path.resolve(import.meta.dirname, '../../..')

describe('ARCH-007 breaking adapter contract', () => {
  it('removes both old route trees rather than retaining aliases', () => {
    for (const route of [
      'apps/admin/app/api/plugins',
      'apps/admin/app/api/v2/sites/[siteId]/plugins',
    ])
      expect(existsSync(path.join(root, route)), route).toBe(false)
    for (const route of [
      'apps/admin/app/api/adapters/route.ts',
      'apps/admin/app/api/v2/sites/[siteId]/adapters/route.ts',
    ])
      expect(existsSync(path.join(root, route)), route).toBe(true)
  })

  it('rejects the removed CLI group before any HTTP request', async () => {
    await cliFixture(
      () => ({ body: {} }),
      async ({ run, calls }) => {
        for (const action of [undefined, 'list', 'get', 'enable']) {
          const args = [
            'plugin',
            ...(action ? [action] : []),
            '--site',
            'example',
            '--id',
            'google.analytics',
            '--non-interactive',
          ]
          const result = await run(args)
          expect(result.status).toBe(10)
          expect(result.body.code).toBe('USAGE')
        }
        expect(calls).toEqual([])
      },
    )
  })

  it('accepts only adapter snapshot v2 and rejects old schema and fields', () => {
    expect(content.parsePublicAdapterSnapshot).toBeTypeOf('function')
    const parse = content.parsePublicAdapterSnapshot
    expect(() => parse({ schemaVersion: 1, installations: [] })).toThrow()
    expect(() =>
      parse({
        schemaVersion: 2,
        installations: [
          {
            pluginId: 'platform.static-marker',
            definitionVersion: '1.0.0',
            configuration: { label: 'Example' },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      parse({
        schemaVersion: 2,
        installations: [
          {
            adapterId: 'platform.static-marker',
            pluginId: 'platform.static-marker',
            definitionVersion: '1.0.0',
            configuration: { label: 'Example' },
          },
        ],
      }),
    ).toThrow()
    expect(parse({ schemaVersion: 2, installations: [] })).toEqual({
      schemaVersion: 2,
      installations: [],
    })
    expect(content).not.toHaveProperty('pluginRegistry')
    expect(content).not.toHaveProperty('parsePublicPluginSnapshot')
  })

  it('rejects domain naming while allowing explicit Desk Plugin references', () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'publisher-adapter-scan-'),
    )
    const file = path.join(directory, 'packages/content/src/example.ts')
    const scan = () =>
      spawnSync(
        process.execPath,
        [
          path.join(root, 'scripts/harness/scan-adapter-contract.mjs'),
          '--root',
          directory,
        ],
        { encoding: 'utf8' },
      )
    try {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, 'export interface PluginInstallation {}\n')
      expect(scan().status).toBe(1)
      writeFileSync(
        file,
        'export interface AdapterInstallation {}\n// Desk Plugin consumes the CLI.\n',
      )
      expect(scan().status).toBe(0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps the immutable initial migration and adds a forward rename', async () => {
    const initial = await readFile(
      path.join(root, 'packages/persistence/migrations/admin/0001_initial.sql'),
      'utf8',
    )
    expect(initial).toContain('publisher_admin.plugin_installations')
    const migration = await readFile(
      path.join(
        root,
        'packages/persistence/migrations/admin/0006_adapter_terminology.sql',
      ),
      'utf8',
    )
    expect(migration).toContain('RENAME TO adapter_installations')
    expect(migration).toContain('RENAME COLUMN plugin_id TO adapter_id')
    expect(migration).toContain("'adapterId'")
  })
})
