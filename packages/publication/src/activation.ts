import type { ReleaseManifest } from './release-manifest'

export interface ReleaseActivation {
  current(siteId: string): Promise<string | undefined>
  compareAndSwap(
    siteId: string,
    expectedReleaseId: string | undefined,
    nextReleaseId: string,
  ): Promise<boolean>
}

export class InMemoryReleaseActivation implements ReleaseActivation {
  private readonly releases = new Map<string, string>()

  async current(siteId: string): Promise<string | undefined> {
    return this.releases.get(siteId)
  }

  async compareAndSwap(
    siteId: string,
    expectedReleaseId: string | undefined,
    nextReleaseId: string,
  ): Promise<boolean> {
    if (this.releases.get(siteId) !== expectedReleaseId) return false
    this.releases.set(siteId, nextReleaseId)
    return true
  }
}

export async function activateVerifiedRelease({
  manifest,
  expectedReleaseId,
  activation,
  verified,
}: {
  readonly manifest: ReleaseManifest
  readonly expectedReleaseId: string | undefined
  readonly activation: ReleaseActivation
  readonly verified: boolean
}): Promise<void> {
  if (!verified) throw new Error('Unverified candidate cannot be activated')
  const activated = await activation.compareAndSwap(
    manifest.siteId,
    expectedReleaseId,
    manifest.releaseId,
  )
  if (!activated) throw new Error('Release activation conflict')
}
