import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { AdminAdapter } from './admin-model'

export interface AdapterCardProps {
  adapter: AdminAdapter | undefined
  configure: (
    adapterId: string,
    configuration: Record<string, unknown>,
    revision?: number,
  ) => Promise<void>
  validate: (
    adapterId: string,
    configuration: Record<string, unknown>,
  ) => Promise<string | undefined>
  setState: (
    adapterId: string,
    state: 'enabled' | 'disabled',
    revision: number,
  ) => Promise<void>
}

export interface AdapterConfigurationForm<Configuration> {
  configuration: Configuration
  setConfiguration: Dispatch<SetStateAction<Configuration>>
  diagnostic: string | undefined
  save: () => Promise<void>
  validate: () => Promise<void>
}

export function useAdapterConfiguration<
  Configuration extends Record<string, unknown>,
>(
  props: AdapterCardProps,
  parse: (adapter: AdminAdapter | undefined) => Configuration,
  adapterId: string,
): AdapterConfigurationForm<Configuration> {
  const [configuration, setConfiguration] = useState(() => parse(props.adapter))
  const [diagnostic, setDiagnostic] = useState<string | undefined>()
  useEffect(() => {
    setConfiguration(parse(props.adapter))
  }, [props.adapter?.revision])
  return {
    configuration,
    setConfiguration,
    diagnostic,
    save: () =>
      props.configure(adapterId, configuration, props.adapter?.revision),
    validate: async () =>
      setDiagnostic(await props.validate(adapterId, configuration)),
  }
}

export type MarkerConfiguration = {
  label: string
  showInArticleFooter: boolean
}
export type GoogleAnalyticsConfiguration = {
  measurementId: string
  consent: 'granted' | 'denied'
}

export function markerConfiguration(
  adapter: AdminAdapter | undefined,
): MarkerConfiguration {
  return {
    label:
      typeof adapter?.configuration.label === 'string'
        ? adapter.configuration.label
        : '',
    showInArticleFooter: adapter?.configuration.showInArticleFooter === true,
  }
}

export function googleAnalyticsConfiguration(
  adapter: AdminAdapter | undefined,
): GoogleAnalyticsConfiguration {
  return {
    measurementId:
      typeof adapter?.configuration.measurementId === 'string'
        ? adapter.configuration.measurementId
        : '',
    consent:
      adapter?.configuration.consent === 'granted' ? 'granted' : 'denied',
  }
}
