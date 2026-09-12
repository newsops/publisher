import { describe, expect, it } from 'vitest'
import {
  createPluginInstallation,
  pluginProviderOrigins,
  projectPublicPluginSnapshot,
  renderPluginContributions,
  validatePluginInstallation,
} from '../../../packages/content/src/index.ts'

function enabledAnalytics(configuration) {
  return {
    ...createPluginInstallation(
      'north-news',
      'google.analytics',
      configuration,
    ),
    state: 'enabled',
  }
}

describe('Google Analytics static adapter contract', () => {
  it('accepts only a GA4 ID and declared consent without credentials', () => {
    const valid = createPluginInstallation('north-news', 'google.analytics', {
      measurementId: 'G-ABC12345',
      consent: 'granted',
    })
    expect(validatePluginInstallation(valid, 'north-news').ok).toBe(true)
    expect(
      validatePluginInstallation(
        {
          ...valid,
          configuration: {
            measurementId: 'G-ABC12345',
            consent: 'granted',
            apiKey: 'credential-sentinel',
          },
        },
        'north-news',
      ).ok,
    ).toBe(false)
    expect(
      validatePluginInstallation(
        {
          ...valid,
          configuration: { measurementId: 'UA-123', consent: 'granted' },
        },
        'north-news',
      ).ok,
    ).toBe(false)
  })

  it('keeps denied consent byte-inert and does not declare Google origins', () => {
    const snapshot = projectPublicPluginSnapshot(
      [enabledAnalytics({ measurementId: 'G-ABC12345', consent: 'denied' })],
      'north-news',
    )
    expect(JSON.stringify(snapshot)).not.toContain('credential-sentinel')
    expect(renderPluginContributions(snapshot)).toEqual({ head: [], slots: [] })
    expect(pluginProviderOrigins(snapshot, 'script')).toEqual([])
    expect(pluginProviderOrigins(snapshot, 'connect')).toEqual([])
  })

  it('emits only the platform-owned loader and exact Google origins after consent', () => {
    const snapshot = projectPublicPluginSnapshot(
      [enabledAnalytics({ measurementId: 'G-ABC12345', consent: 'granted' })],
      'north-news',
    )
    expect(renderPluginContributions(snapshot)).toEqual({
      head: [
        {
          kind: 'meta',
          key: 'google.analytics.measurement-id',
          name: 'publisher-google-analytics-id',
          content: 'G-ABC12345',
        },
        {
          kind: 'script',
          key: 'google.analytics.runtime',
          src: '/plugin-runtime/google-analytics.js',
          async: true,
        },
      ],
      slots: [],
    })
    expect(pluginProviderOrigins(snapshot, 'script')).toEqual([
      'https://www.googletagmanager.com',
    ])
    expect(pluginProviderOrigins(snapshot, 'connect')).toEqual([
      'https://www.google-analytics.com',
    ])
  })
})
