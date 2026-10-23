import type { DashboardActions, DashboardState } from './AdminDashboardView'
import type { DashboardSetters } from './dashboard-state'
import * as action from './admin-actions'

export function settingsActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  | 'setSettings'
  | 'saveSettings'
  | 'setGuidance'
  | 'reloadAgentGuidance'
  | 'saveAgentGuidance'
> {
  return {
    setSettings: setters.setSettings,
    saveSettings: () =>
      action.saveSettings(state.settings, setters.setMessage, () =>
        action.loadSettings(setters.setSettings),
      ),
    setGuidance: setters.setGuidance,
    reloadAgentGuidance: () => action.loadAgentGuidance(() => {}),
    saveAgentGuidance: () =>
      action.saveAgentGuidance(state.guidance, setters.setMessage, () =>
        action.loadAgentGuidance(setters.setGuidance),
      ),
  }
}

export function adapterActions(
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  'configureAdapter' | 'validateAdapter' | 'setAdapterState'
> {
  const reload = () => action.loadAdapters(setters.setAdapters)
  return {
    configureAdapter: (adapterId, configuration, revision) =>
      action.configureAdapter(
        adapterId,
        configuration,
        revision,
        setters.setMessage,
        reload,
      ),
    validateAdapter: (adapterId, configuration) =>
      action.validateAdapterConfiguration(adapterId, configuration),
    setAdapterState: (adapterId, state, revision) =>
      action.setAdapterState(
        adapterId,
        state,
        revision,
        setters.setMessage,
        reload,
      ),
  }
}

export function mediaActions(
  setters: DashboardSetters,
): Pick<DashboardActions, 'uploadMedia' | 'approveMedia'> {
  const reload = () => action.loadMedia(setters.setMedia)
  return {
    uploadMedia: (file) => action.uploadMedia(file, setters.setMessage, reload),
    approveMedia: (media) =>
      action.approveMedia(media, setters.setMessage, reload),
  }
}
