import type { ReactElement } from 'react'
import type {
  AdapterConfigurationForm,
  GoogleAnalyticsConfiguration,
  MarkerConfiguration,
} from './adapter-card-model'

type FieldProps<Configuration> = Pick<
  AdapterConfigurationForm<Configuration>,
  'configuration' | 'setConfiguration' | 'diagnostic'
>

export function MarkerFields({
  configuration,
  setConfiguration,
  diagnostic,
}: Readonly<FieldProps<MarkerConfiguration>>): ReactElement {
  return (
    <>
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
    </>
  )
}

export function GoogleAnalyticsFields({
  configuration,
  setConfiguration,
  diagnostic,
}: Readonly<FieldProps<GoogleAnalyticsConfiguration>>): ReactElement {
  return (
    <>
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
    </>
  )
}
