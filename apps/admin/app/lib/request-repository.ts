import { AdminAuthError, type AdminIdentity } from './auth'
import { getRepositoryForSite } from './repository'
import { getPluginRepositoryForSite } from './plugin-repository'
import { assertSiteId } from './site-registry'

export function requestedSiteId(request: Request): string {
  return request.headers.get('x-admin-site-id')?.trim() || 'default'
}

export function repositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  const siteId = requestedSiteId(request)
  assertSiteId(siteId)
  if (!identity.roles.includes('owner'))
    throw new AdminAuthError('Not authorized for this site', 403)
  return getRepositoryForSite(siteId)
}

export function pluginRepositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  const siteId = requestedSiteId(request)
  assertSiteId(siteId)
  if (!identity.roles.includes('owner'))
    throw new AdminAuthError('Not authorized for this site', 403)
  return getPluginRepositoryForSite(siteId)
}
