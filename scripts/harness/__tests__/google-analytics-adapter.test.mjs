import { describe, expect, it } from 'vitest'
import {
  createAdapterInstallation,
  adapterProviderOrigins,
  projectPublicAdapterSnapshot,
  renderAdapterContributions,
  validateAdapterInstallation,
} from '../../../packages/content/src/index.ts'

function enabledAnalytics(configuration) {
  return {
    ...createAdapterInstallation(
      'north-news',
      'google.analytics',
      configuration,
    ),
    state: 'enabled',
  }
}

describe('Google Analytics static adapter contract', () => {
  it('accepts only a GA4 ID and declared consent without credentials', () => {
    const valid = createAdapterInstallation('north-news', 'google.analytics', {
      measurementId: 'G-ABC12345',
      consent: 'granted',
    })
    expect(validateAdapterInstallation(valid, 'north-news').ok).toBe(true)
    expect(
      validateAdapterInstallation(
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
      validateAdapterInstallation(
        {
          ...valid,
          configuration: { measurementId: 'UA-123', consent: 'granted' },
        },
        'north-news',
      ).ok,
    ).toBe(false)
  })

  it('keeps denied consent byte-inert and does not declare Google origins', () => {
    const snapshot = projectPublicAdapterSnapshot(
      [enabledAnalytics({ measurementId: 'G-ABC12345', consent: 'denied' })],
      'north-news',
    )
    expect(JSON.stringify(snapshot)).not.toContain('credential-sentinel')
    expect(renderAdapterContributions(snapshot)).toEqual({
      head: [],
      slots: [],
    })
    expect(adapterProviderOrigins(snapshot, 'script')).toEqual([])
    expect(adapterProviderOrigins(snapshot, 'connect')).toEqual([])
  })

  it('emits only the platform-owned loader and exact Google origins after consent', () => {
    const snapshot = projectPublicAdapterSnapshot(
      [enabledAnalytics({ measurementId: 'G-ABC12345', consent: 'granted' })],
      'north-news',
    )
    expect(renderAdapterContributions(snapshot)).toEqual({
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
          src: '/adapter-runtime/google-analytics.js',
          async: true,
        },
      ],
      slots: [],
    })
    expect(adapterProviderOrigins(snapshot, 'script')).toEqual([
      'https://www.googletagmanager.com',
    ])
    expect(adapterProviderOrigins(snapshot, 'connect')).toEqual([
      'https://www.google-analytics.com',
    ])
  })
})
