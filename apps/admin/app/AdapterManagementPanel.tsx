import type { AdminAdapter } from './admin-model'
import type { ReactElement } from 'react'
import type { AdapterCardProps } from './adapter-card-model'
import {
  StaticMarkerAdapter,
  GoogleAnalyticsAdapter,
} from './AdapterInstallationCards'

export default function AdapterManagementPanel({
  adapters,
  configure,
  validate,
  setState,
}: Readonly<
  Omit<AdapterCardProps, 'adapter'> & { adapters: readonly AdminAdapter[] }
>): ReactElement {
  const marker = adapters.find(
    (adapter) => adapter.adapterId === 'platform.static-marker',
  )
  const googleAnalytics = adapters.find(
    (adapter) => adapter.adapterId === 'google.analytics',
  )
  return (
    <section className="adapter-panel">
      <div className="section-heading">
        <div>
          <h2>Publication adapters</h2>
          <p className="adapter-summary">
            Only reviewed, repository-bundled adapters can be installed. Public
            behavior is compiled into the next static release; no adapter runs
            on the page-delivery path.
          </p>
        </div>
      </div>
      <StaticMarkerAdapter
        adapter={marker}
        configure={configure}
        validate={validate}
        setState={setState}
      />
      <GoogleAnalyticsAdapter
        adapter={googleAnalytics}
        configure={configure}
        validate={validate}
        setState={setState}
      />
    </section>
  )
}
