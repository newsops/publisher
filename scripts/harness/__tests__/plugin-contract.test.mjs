import { describe, expect, it } from 'vitest'
import {
  createPluginInstallation,
  createPluginRegistry,
  pluginRegistry,
  projectPublicPluginSnapshot,
  renderPluginContributions,
  staticMarkerPlugin,
  validatePluginInstallation,
} from '../../../packages/content/src/index.ts'

describe('plugin registry contract', () => {
  it('rejects duplicate IDs and unsupported capabilities before an adapter can run', () => {
    const definition = pluginRegistry.get('platform.static-marker')
    expect(definition).toBeDefined()
    expect(() => createPluginRegistry([definition, definition])).toThrow(
      'Duplicate plugin ID',
    )
    expect(() =>
      createPluginRegistry([
        {
          ...definition,
          id: 'invalid-capability',
          capabilities: ['request-time-server'],
        },
      ]),
    ).toThrow('Unsupported plugin capability')
  })

  it('rejects unknown, invalid, and cross-site installation configuration', () => {
    const valid = createPluginInstallation(
      'north-news',
      'platform.static-marker',
      {
        label: 'North News',
      },
    )
    expect(validatePluginInstallation(valid, 'north-news').ok).toBe(true)
    expect(
      validatePluginInstallation(
        { ...valid, siteId: 'south-news' },
        'north-news',
      ).errors,
    ).toContain('plugin installation belongs to another site')
    expect(
      validatePluginInstallation(
        { ...valid, pluginId: 'unknown.plugin' },
        'north-news',
      ).errors,
    ).toContain('Unknown plugin: unknown.plugin')
    expect(
      validatePluginInstallation(
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
      ...createPluginInstallation('north-news', 'platform.static-marker', {
        label: 'North News',
        showInArticleFooter: true,
      }),
      state: 'enabled',
      secretReferences: ['ANALYTICS_WRITE_TOKEN'],
    }
    const disabled = createPluginInstallation(
      'north-news',
      'platform.static-marker',
      {
        label: 'Disabled duplicate is rejected before projection',
      },
    )
    const projection = projectPublicPluginSnapshot([enabled], 'north-news')
    const serialized = JSON.stringify(projection)
    expect(serialized).toContain('North News')
    expect(serialized).not.toContain('ANALYTICS_WRITE_TOKEN')
    expect(() =>
      projectPublicPluginSnapshot([enabled, disabled], 'north-news'),
    ).toThrow('Duplicate plugin installation')
    expect(renderPluginContributions(projection)).toEqual({
      head: [
        {
          kind: 'meta',
          key: 'platform.static-marker',
          name: 'publisher-plugin-marker',
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
      createPluginRegistry([
        {
          ...staticMarkerPlugin,
          id: 'fixture.wildcard-origin',
          providerOrigins: [{ kind: 'script', origin: 'https://*.invalid' }],
        },
      ]),
    ).toThrow('HTTPS origin')

    const definition = {
      ...staticMarkerPlugin,
      id: 'fixture.undeclared-script',
      providerOrigins: [{ kind: 'script', origin: 'https://allowed.invalid' }],
      contribute: () => ({
        head: [
          {
            kind: 'script',
            key: 'fixture.undeclared-script',
            src: 'https://not-allowed.invalid/plugin.js',
          },
        ],
        slots: [],
      }),
    }
    const registry = createPluginRegistry([definition])
    expect(() =>
      renderPluginContributions(
        {
          schemaVersion: 1,
          installations: [
            {
              pluginId: definition.id,
              definitionVersion: definition.version,
              configuration: { label: 'Fixture' },
            },
          ],
        },
        registry,
      ),
    ).toThrow('Unsafe plugin head token')
  })
})
