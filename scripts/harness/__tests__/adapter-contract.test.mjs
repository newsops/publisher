import { describe, expect, it } from 'vitest'
import {
  createAdapterInstallation,
  createAdapterRegistry,
  adapterRegistry,
  projectPublicAdapterSnapshot,
  renderAdapterContributions,
  staticMarkerAdapter,
  validateAdapterInstallation,
} from '../../../packages/content/src/index.ts'

describe('adapter registry contract', () => {
  it('rejects duplicate IDs and unsupported capabilities before an adapter can run', () => {
    const definition = adapterRegistry.get('platform.static-marker')
    expect(definition).toBeDefined()
    expect(() => createAdapterRegistry([definition, definition])).toThrow(
      'Duplicate adapter ID',
    )
    expect(() =>
      createAdapterRegistry([
        {
          ...definition,
          id: 'invalid-capability',
          capabilities: ['request-time-server'],
        },
      ]),
    ).toThrow('Unsupported adapter capability')
  })

  it('rejects unknown, invalid, and cross-site installation configuration', () => {
    const valid = createAdapterInstallation(
      'north-news',
      'platform.static-marker',
      {
        label: 'North News',
      },
    )
    expect(validateAdapterInstallation(valid, 'north-news').ok).toBe(true)
    expect(
      validateAdapterInstallation(
        { ...valid, siteId: 'south-news' },
        'north-news',
      ).errors,
    ).toContain('adapter installation belongs to another site')
    expect(
      validateAdapterInstallation(
        { ...valid, adapterId: 'unknown.adapter' },
        'north-news',
      ).errors,
    ).toContain('Unknown adapter: unknown.adapter')
    expect(
      validateAdapterInstallation(
        {
          ...valid,
          configuration: { label: '', remoteScript: 'https://bad.test' },
        },
        'north-news',
      ).ok,
    ).toBe(false)
  })

  it('projects only enabled public-safe configuration and emits typed tokens', () => {
    const enabled = {
      ...createAdapterInstallation('north-news', 'platform.static-marker', {
        label: 'North News',
        showInArticleFooter: true,
      }),
      state: 'enabled',
      secretReferences: ['ANALYTICS_WRITE_TOKEN'],
    }
    const disabled = createAdapterInstallation(
      'north-news',
      'platform.static-marker',
      {
        label: 'Disabled duplicate is rejected before projection',
      },
    )
    const projection = projectPublicAdapterSnapshot([enabled], 'north-news')
    const serialized = JSON.stringify(projection)
    expect(serialized).toContain('North News')
    expect(serialized).not.toContain('ANALYTICS_WRITE_TOKEN')
    expect(() =>
      projectPublicAdapterSnapshot([enabled, disabled], 'north-news'),
    ).toThrow('Duplicate adapter installation')
    expect(renderAdapterContributions(projection)).toEqual({
      head: [
        {
          kind: 'meta',
          key: 'platform.static-marker',
          name: 'publisher-adapter-marker',
          content: 'North News',
        },
      ],
      slots: [
        {
          slot: 'article-footer',
          key: 'platform.static-marker',
          label: 'North News',
        },
      ],
    })
  })

  it('rejects wildcard and undeclared script contributions before static rendering', () => {
    expect(() =>
      createAdapterRegistry([
        {
          ...staticMarkerAdapter,
          id: 'fixture.wildcard-origin',
          providerOrigins: [{ kind: 'script', origin: 'https://*.invalid' }],
        },
      ]),
    ).toThrow('HTTPS origin')

    const definition = {
      ...staticMarkerAdapter,
      id: 'fixture.undeclared-script',
      providerOrigins: [{ kind: 'script', origin: 'https://allowed.invalid' }],
      contribute: () => ({
        head: [
          {
            kind: 'script',
            key: 'fixture.undeclared-script',
            src: 'https://not-allowed.invalid/adapter.js',
          },
        ],
        slots: [],
      }),
    }
    const registry = createAdapterRegistry([definition])
    expect(() =>
      renderAdapterContributions(
        {
          schemaVersion: 2,
          installations: [
            {
              adapterId: definition.id,
              definitionVersion: definition.version,
              configuration: { label: 'Fixture' },
            },
          ],
        },
        registry,
      ),
    ).toThrow('Unsafe adapter head token')
  })
})
