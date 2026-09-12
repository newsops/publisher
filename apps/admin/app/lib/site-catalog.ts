import { ContentValidationError } from '@publisher/content'

export const DEFAULT_SITE_ID = 'default'

export interface SiteConfig {
  readonly siteId: string
  readonly name: string
  readonly canonicalOrigin: string
  readonly themeId: string
  readonly active: boolean
  readonly adminEmails?: readonly string[]
}

export interface SiteCatalog {
  list(): readonly SiteConfig[]
  get(siteId: string): SiteConfig | undefined
  require(siteId: string): SiteConfig
}

const siteIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function defaultSite(): SiteConfig {
  return {
    siteId: DEFAULT_SITE_ID,
    name: process.env.ADMIN_DEFAULT_SITE_NAME ?? 'Publisher',
    canonicalOrigin:
      process.env.ADMIN_DEFAULT_SITE_ORIGIN ?? 'https://publisher.com',
    themeId: process.env.ADMIN_DEFAULT_SITE_THEME ?? 'editorial',
    active: true,
  }
}

function parseConfiguredSites(): readonly SiteConfig[] {
  const raw = process.env.ADMIN_SITES_JSON
  if (!raw) return [defaultSite()]
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value))
      throw new Error('ADMIN_SITES_JSON must be an array')
    const sites = value.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid site')
      const record = item as Record<string, unknown>
      const siteId = record.siteId
      const name = record.name
      const canonicalOrigin = record.canonicalOrigin
      const themeId = record.themeId ?? 'editorial'
      if (
        typeof siteId !== 'string' ||
        !siteIdPattern.test(siteId) ||
        typeof name !== 'string' ||
        typeof canonicalOrigin !== 'string' ||
        typeof themeId !== 'string'
      )
        throw new Error('Invalid site fields')
      new URL(canonicalOrigin)
      return {
        siteId,
        name,
        canonicalOrigin,
        themeId,
        active: record.active !== false,
        adminEmails: Array.isArray(record.adminEmails)
          ? record.adminEmails.filter(
              (email): email is string => typeof email === 'string',
            )
          : undefined,
      }
    })
    const withDefault = sites.some((site) => site.siteId === DEFAULT_SITE_ID)
      ? sites
      : [defaultSite(), ...sites]
    if (
      new Set(withDefault.map((site) => site.siteId)).size !==
      withDefault.length
    )
      throw new Error('Duplicate site ID')
    return withDefault
  } catch {
    throw new Error('Invalid ADMIN_SITES_JSON configuration')
  }
}

export function isSiteAdmin(email: string, site: SiteConfig): boolean {
  return (
    !site.adminEmails?.length ||
    site.adminEmails.some(
      (candidate) => candidate.toLowerCase() === email.toLowerCase(),
    )
  )
}

export class ConfiguredSiteCatalog implements SiteCatalog {
  private readonly sites: readonly SiteConfig[]

  constructor(sites: readonly SiteConfig[] = parseConfiguredSites()) {
    this.sites = sites
  }

  list(): readonly SiteConfig[] {
    return this.sites.filter((site) => site.active)
  }

  get(siteId: string): SiteConfig | undefined {
    return this.list().find((site) => site.siteId === siteId)
  }

  require(siteId: string): SiteConfig {
    if (!siteIdPattern.test(siteId))
      throw new ContentValidationError(
        'siteId must contain lowercase letters, numbers, and hyphens only',
      )
    const site = this.get(siteId)
    if (!site) throw new ContentValidationError(`Unknown site: ${siteId}`)
    return site
  }
}

export function getSiteCatalog(): SiteCatalog {
  return new ConfiguredSiteCatalog()
}

export function assertKnownSite(siteId: string): SiteConfig {
  return getSiteCatalog().require(siteId)
}
