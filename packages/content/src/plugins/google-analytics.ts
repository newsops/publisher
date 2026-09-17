import type { PluginDefinition, PluginValidationResult } from './index'

export interface GoogleAnalyticsConfiguration extends Record<string, unknown> {
  readonly measurementId: string
  readonly consent: 'granted' | 'denied'
}

const measurementIdPattern = /^G-[A-Z0-9]{4,32}$/

/** Platform-owned loader emitted into immutable static releases. */
export const googleAnalyticsRuntimeSource = `;(() => {
  const measurementId = document
    .querySelector('meta[name="publisher-google-analytics-id"]')
    ?.getAttribute('content')
  if (!measurementId || !/^G-[A-Z0-9]{4,32}$/.test(measurementId)) return
  if (document.querySelector('script[data-publisher-google-analytics]')) return

  const loadGoogleTag = () => {
    if (document.querySelector('script[data-publisher-google-analytics]')) return
    window.dataLayer = window.dataLayer || []
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments)
      }
    window.gtag('js', new Date())
    window.gtag('config', measurementId)

    const tag = document.createElement('script')
    tag.async = true
    tag.dataset.publisherGoogleAnalytics = 'true'
    tag.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(measurementId)
    tag.addEventListener('error', () => {})
    document.head.append(tag)
  }

  if (window.__publisherConsent?.analytics === true) loadGoogleTag()
  else
    window.addEventListener('publisher:consent', (event) => {
      if (event.detail?.analytics === true) loadGoogleTag()
    })
})()`

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function validateGoogleAnalyticsConfiguration(
  configuration: unknown,
): PluginValidationResult<GoogleAnalyticsConfiguration> {
  if (!isRecord(configuration))
    return { ok: false, errors: ['configuration must be an object'] }
  if (
    Object.keys(configuration).some(
      (key) => key !== 'measurementId' && key !== 'consent',
    )
  )
    return { ok: false, errors: ['configuration contains an unknown field'] }
  const measurementId = configuration.measurementId
  if (
    typeof measurementId !== 'string' ||
    !measurementIdPattern.test(measurementId)
  )
    return { ok: false, errors: ['measurementId must be a valid GA4 ID'] }
  const consent = configuration.consent ?? 'denied'
  if (consent !== 'granted' && consent !== 'denied')
    return { ok: false, errors: ['consent must be granted or denied'] }
  return {
    ok: true,
    errors: [],
    value: { measurementId, consent },
  }
}

export const googleAnalyticsPlugin: PluginDefinition = {
  id: 'google.analytics',
  version: '1.0.0',
  capabilities: ['admin-settings', 'public-head'],
  providerOrigins: [
    { kind: 'script', origin: 'https://www.googletagmanager.com' },
    { kind: 'connect', origin: 'https://www.google-analytics.com' },
  ],
  platformScriptPaths: ['/plugin-runtime/google-analytics.js'],
  validateConfiguration: validateGoogleAnalyticsConfiguration,
  projectPublicConfiguration: (configuration) => {
    const result = validateGoogleAnalyticsConfiguration(configuration)
    if (!result.ok || !result.value) throw new Error(result.errors.join('; '))
    return {
      measurementId: result.value.measurementId,
      consent: result.value.consent,
    }
  },
  contribute: (configuration) =>
    configuration.consent === 'granted' &&
    typeof configuration.measurementId === 'string'
      ? {
          head: [
            {
              kind: 'meta',
              key: 'google.analytics.measurement-id',
              name: 'publisher-google-analytics-id',
              content: configuration.measurementId,
            },
            {
              kind: 'script',
              key: 'google.analytics.runtime',
              src: '/plugin-runtime/google-analytics.js',
              async: true,
            },
          ],
          slots: [],
        }
      : { head: [], slots: [] },
}
