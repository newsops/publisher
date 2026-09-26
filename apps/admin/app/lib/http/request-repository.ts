import { assertSiteId } from '@publisher/content'
import { AdminAuthError, type AdminIdentity, type AdminRole } from './auth'
import { getPluginRepositoryForSite, getRepositoryForSite } from '../index'

export function requestedSiteId(request: Request): string {
  return request.headers.get('x-admin-site-id')?.trim() || 'default'
}

/**
 * The one place a browser route turns the `x-admin-site-id` header into an
 * authorized site id. Browser content management is an owner action; a
 * route that admits a lower role says so explicitly.
 */
export function authorizedSiteId(
  request: Request,
  identity: AdminIdentity,
  minimumRole: AdminRole = 'owner',
): string {
  const siteId = requestedSiteId(request)
  assertSiteId(siteId)
  if (!identity.roles.includes(minimumRole))
    throw new AdminAuthError('Not authorized for this site', 403)
  return siteId
}

export function repositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  return getRepositoryForSite(authorizedSiteId(request, identity))
}

export function pluginRepositoryForRequest(
  request: Request,
  identity: AdminIdentity,
) {
  return getPluginRepositoryForSite(authorizedSiteId(request, identity))
}
