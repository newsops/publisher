import { useEffect, useState } from 'react'
import type { AdminPlugin } from './admin-model'

type MarkerConfiguration = {
  label: string
  showInArticleFooter: boolean
}

type GoogleAnalyticsConfiguration = {
  measurementId: string
  consent: 'granted' | 'denied'
}

function markerConfiguration(
  plugin: AdminPlugin | undefined,
): MarkerConfiguration {
  return {
    label:
      typeof plugin?.configuration.label === 'string'
        ? plugin.configuration.label
        : '',
    showInArticleFooter: plugin?.configuration.showInArticleFooter === true,
  }
}

function googleAnalyticsConfiguration(
  plugin: AdminPlugin | undefined,
): GoogleAnalyticsConfiguration {
  return {
    measurementId:
      typeof plugin?.configuration.measurementId === 'string'
        ? plugin.configuration.measurementId
        : '',
    consent: plugin?.configuration.consent === 'granted' ? 'granted' : 'denied',
  }
}

function StaticMarkerPlugin({
  plugin,
  configure,
  validate,
  setState,
}: Readonly<{
  plugin: AdminPlugin | undefined
  configure: (
    pluginId: string,
    configuration: Record<string, unknown>,
    revision?: number,
  ) => Promise<void>
  validate: (
    pluginId: string,
    configuration: Record<string, unknown>,
  ) => Promise<string | undefined>
  setState: (
    pluginId: string,
    state: 'enabled' | 'disabled',
    revision: number,
  ) => Promise<void>
}>) {
  const [configuration, setConfiguration] = useState<MarkerConfiguration>(() =>
    markerConfiguration(plugin),
  )
  const [diagnostic, setDiagnostic] = useState<string | undefined>()

  useEffect(() => {
    setConfiguration(markerConfiguration(plugin))
  }, [plugin?.revision])

  const save = () =>
    configure('platform.static-marker', configuration, plugin?.revision)
  const validateConfiguration = async () =>
    setDiagnostic(await validate('platform.static-marker', configuration))

  return (
    <article className="plugin-card">
      <div>
        <h3>Static marker</h3>
        <p>
          A built-in safe fixture for verifying the registry. It emits only a
          typed metadata token and an optional static article-footer label.
        </p>
      </div>
      <small>
        {plugin
          ? plugin.state + ' · revision ' + String(plugin.revision)
          : 'Not installed'}
      </small>
      <label>
        Marker label
        <input
          value={configuration.label}
          maxLength={80}
          onChange={(event) =>
            setConfiguration((current) => ({
              ...current,
              label: event.target.value,
            }))
          }
        />
        {diagnostic ? (
          <small className="field-error">{diagnostic}</small>
        ) : null}
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={configuration.showInArticleFooter}
          onChange={(event) =>
            setConfiguration((current) => ({
              ...current,
              showInArticleFooter: event.target.checked,
            }))
          }
        />
        Render the safe label in the article footer
      </label>
      <div className="plugin-actions">
        <button
          className="secondary"
          onClick={() => void validateConfiguration()}
        >
          Validate configuration
        </button>
        <button className="secondary" onClick={() => void save()}>
          {plugin ? 'Save configuration' : 'Install'}
        </button>
        {plugin?.state === 'enabled' ? (
          <button
            className="danger"
            onClick={() =>
              void setState(
                'platform.static-marker',
                'disabled',
                plugin.revision,
              )
            }
          >
            Disable
          </button>
        ) : plugin ? (
          <button
            className="save"
            onClick={() =>
              void setState(
                'platform.static-marker',
                'enabled',
                plugin.revision,
              )
            }
          >
            Enable
          </button>
        ) : null}
      </div>
    </article>
  )
}

function GoogleAnalyticsPlugin({
  plugin,
  configure,
  validate,
  setState,
}: Readonly<{
  plugin: AdminPlugin | undefined
  configure: (
    pluginId: string,
    configuration: Record<string, unknown>,
    revision?: number,
  ) => Promise<void>
  validate: (
    pluginId: string,
    configuration: Record<string, unknown>,
  ) => Promise<string | undefined>
  setState: (
    pluginId: string,
    state: 'enabled' | 'disabled',
    revision: number,
  ) => Promise<void>
}>) {
  const [configuration, setConfiguration] =
    useState<GoogleAnalyticsConfiguration>(() =>
      googleAnalyticsConfiguration(plugin),
    )
  const [diagnostic, setDiagnostic] = useState<string | undefined>()

  useEffect(() => {
    setConfiguration(googleAnalyticsConfiguration(plugin))
  }, [plugin?.revision])

  const save = () =>
    configure('google.analytics', configuration, plugin?.revision)
  const validateConfiguration = async () =>
    setDiagnostic(await validate('google.analytics', configuration))

  return (
    <article className="plugin-card">
      <div>
        <h3>Google Analytics 4</h3>
        <p>
          Loads the reviewed Google tag asynchronously only after this site has
          an explicit analytics-consent policy. No credentials are stored here.
        </p>
      </div>
      <small>
        {plugin
          ? plugin.state + ' · revision ' + String(plugin.revision)
          : 'Not installed'}
      </small>
      <label>
        GA4 measurement ID
        <input
          value={configuration.measurementId}
          maxLength={34}
          placeholder="G-XXXXXXXXXX"
          onChange={(event) =>
            setConfiguration((current) => ({
              ...current,
              measurementId: event.target.value.trim().toUpperCase(),
            }))
          }
        />
        {diagnostic ? (
          <small className="field-error">{diagnostic}</small>
        ) : null}
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={configuration.consent === 'granted'}
          onChange={(event) =>
            setConfiguration((current) => ({
              ...current,
              consent: event.target.checked ? 'granted' : 'denied',
            }))
          }
        />
        This site has explicit analytics consent through its approved consent
        process
      </label>
      <div className="plugin-actions">
        <button
          className="secondary"
          onClick={() => void validateConfiguration()}
        >
          Validate configuration
        </button>
        <button className="secondary" onClick={() => void save()}>
          {plugin ? 'Save configuration' : 'Install'}
        </button>
        {plugin?.state === 'enabled' ? (
          <button
            className="danger"
            onClick={() =>
              void setState('google.analytics', 'disabled', plugin.revision)
            }
          >
            Disable
          </button>
        ) : plugin ? (
          <button
            className="save"
            onClick={() =>
              void setState('google.analytics', 'enabled', plugin.revision)
            }
          >
            Enable
          </button>
        ) : null}
      </div>
    </article>
  )
}

export default function PluginManagementPanel({
  plugins,
  configure,
  validate,
  setState,
}: Readonly<{
  plugins: readonly AdminPlugin[]
  configure: (
    pluginId: string,
    configuration: Record<string, unknown>,
    revision?: number,
  ) => Promise<void>
  validate: (
    pluginId: string,
    configuration: Record<string, unknown>,
  ) => Promise<string | undefined>
  setState: (
    pluginId: string,
    state: 'enabled' | 'disabled',
    revision: number,
  ) => Promise<void>
}>) {
  const marker = plugins.find(
    (plugin) => plugin.pluginId === 'platform.static-marker',
  )
  const googleAnalytics = plugins.find(
    (plugin) => plugin.pluginId === 'google.analytics',
  )
  return (
    <section className="plugin-panel">
      <div className="section-heading">
        <div>
          <h2>Publication plugins</h2>
          <p className="plugin-summary">
            Only reviewed, repository-bundled adapters can be installed. Public
            behavior is compiled into the next static release; no plugin runs on
            the page-delivery path.
          </p>
        </div>
      </div>
      <StaticMarkerPlugin
        plugin={marker}
        configure={configure}
        validate={validate}
        setState={setState}
      />
      <GoogleAnalyticsPlugin
        plugin={googleAnalytics}
        configure={configure}
        validate={validate}
        setState={setState}
      />
    </section>
  )
}
