import type { ReactElement } from 'react'
import { AdapterActions, AdapterCardFrame } from './AdapterCardFrame'
import {
  GoogleAnalyticsFields,
  MarkerFields,
} from './AdapterConfigurationFields'
import {
  googleAnalyticsConfiguration,
  markerConfiguration,
  useAdapterConfiguration,
  type AdapterCardProps,
} from './adapter-card-model'

export function StaticMarkerAdapter(
  props: Readonly<AdapterCardProps>,
): ReactElement {
  const form = useAdapterConfiguration(
    props,
    markerConfiguration,
    'platform.static-marker',
  )
  return (
    <AdapterCardFrame
      title="Static marker"
      description="A built-in safe fixture for verifying the registry. It emits only a typed metadata token and an optional static article-footer label."
      adapter={props.adapter}
    >
      <MarkerFields {...form} />
      <AdapterActions
        adapterId="platform.static-marker"
        adapter={props.adapter}
        setState={props.setState}
        form={form}
      />
    </AdapterCardFrame>
  )
}

export function GoogleAnalyticsAdapter(
  props: Readonly<AdapterCardProps>,
): ReactElement {
  const form = useAdapterConfiguration(
    props,
    googleAnalyticsConfiguration,
    'google.analytics',
  )
  return (
    <AdapterCardFrame
      title="Google Analytics 4"
      description="Loads the reviewed Google tag asynchronously only after this site has an explicit analytics-consent policy. No credentials are stored here."
      adapter={props.adapter}
    >
      <GoogleAnalyticsFields {...form} />
      <AdapterActions
        adapterId="google.analytics"
        adapter={props.adapter}
        setState={props.setState}
        form={form}
      />
    </AdapterCardFrame>
  )
}
