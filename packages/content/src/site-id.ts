import { ContentValidationError } from './editor'

const siteIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Site identifiers scope snapshots, keys, and routes; the format is a contract. */
export function assertSiteId(siteId: string): void {
  if (!siteIdPattern.test(siteId))
    throw new ContentValidationError(
      'siteId must contain lowercase letters, numbers, and hyphens only',
    )
}
