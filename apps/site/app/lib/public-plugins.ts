import {
  publicPluginSnapshot,
  renderPluginContributions,
  type PublicPluginSnapshot,
} from '@publisher/content'

export function buildPublicPluginSnapshot(): PublicPluginSnapshot {
  renderPluginContributions(publicPluginSnapshot)
  return publicPluginSnapshot
}
