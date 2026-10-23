import {
  publicAdapterSnapshot,
  renderAdapterContributions,
  type PublicAdapterSnapshot,
} from '@publisher/content'

export function buildPublicAdapterSnapshot(): PublicAdapterSnapshot {
  renderAdapterContributions(publicAdapterSnapshot)
  return publicAdapterSnapshot
}
