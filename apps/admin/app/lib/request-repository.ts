import { AdminAuthError, type AdminIdentity } from './auth'
import { getRepositoryForSite } from './repository'
import { getPluginRepositoryForSite } from './plugin-repository'
import { DEFAULT_SITE_ID, getSiteCatalog, isSiteAdmin } from './site-catalog'

export function requestedSiteId(request: Request): string {
  return request.headers.get('x-admin-site-id')?.trim() || DEFAULT_SITE_ID
}

export function repositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  const siteId = requestedSiteId(request)
  const site = getSiteCatalog().require(siteId)
  if (!isSiteAdmin(identity.email, site))
    throw new AdminAuthError('Not authorized for this site', 403)
  return getRepositoryForSite(siteId)
}

export function pluginRepositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  const siteId = requestedSiteId(request)
  const site = getSiteCatalog().require(siteId)
  if (!isSiteAdmin(identity.email, site))
    throw new AdminAuthError('Not authorized for this site', 403)
  return getPluginRepositoryForSite(siteId)
}
