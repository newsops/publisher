import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  link,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  manifestChecksum,
  type ArtifactEntry,
  type ReleaseManifest,
} from './release-manifest'

export interface ReadableArtifactStore {
  get(objectKey: string): Promise<Uint8Array>
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex')
}

function outputPath(route: string): string {
  if (!route.startsWith('/') || route.includes('..') || route.includes('\\'))
    throw new Error(`Unsafe public artifact path: ${route}`)
  const relative = route.slice(1)
  return !relative || relative.endsWith('/')
    ? path.join(relative, 'index.html')
    : relative
}

export class FileSystemStaticDeployment {
  constructor(private readonly root: string) {}

  private releaseDirectory(releaseId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(releaseId))
      throw new Error('Unsafe release ID')
    return path.join(this.root, 'releases', releaseId)
  }

  private async reuseExistingCandidate(
    manifest: ReleaseManifest,
    destination: string,
  ): Promise<boolean> {
    try {
      await stat(destination)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
    const existing = await this.readReleaseManifest(manifest.releaseId)
    if (existing.sha256 !== manifest.sha256)
      throw new Error(
        `Release ID already exists with different content: ${manifest.releaseId}`,
      )
    await this.verifyRelease(manifest.releaseId)
    return true
  }

  private async materializeEntry(
    temporary: string,
    manifest: ReleaseManifest,
    entry: ArtifactEntry,
    artifacts: ReadableArtifactStore,
  ): Promise<void> {
    if (!entry.objectKey.startsWith('artifacts/sha256/'))
      throw new Error(`Non-content-addressed object key: ${entry.objectKey}`)
    const file = path.join(temporary, outputPath(entry.path))
    await mkdir(path.dirname(file), { recursive: true })
    if (entry.sourceReleaseId !== manifest.releaseId) {
      const source = path.join(
        this.releaseDirectory(entry.sourceReleaseId),
        outputPath(entry.path),
      )
      try {
        const body = await readFile(source)
        if (sha256(body) !== entry.sha256)
          throw new Error(`Reused artifact checksum mismatch: ${entry.path}`)
        await link(source, file)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'EXDEV' && code !== 'EPERM')
          throw error
      }
    }
    const body = await artifacts.get(entry.objectKey)
    if (sha256(body) !== entry.sha256)
      throw new Error(`Artifact checksum mismatch: ${entry.path}`)
    await writeFile(file, body, { flag: 'wx' })
  }

  private async writeCandidate(
    temporary: string,
    manifest: ReleaseManifest,
    artifacts: ReadableArtifactStore,
  ): Promise<void> {
    await mkdir(temporary, { recursive: true })
    for (const entry of manifest.entries)
      await this.materializeEntry(temporary, manifest, entry, artifacts)
    await writeFile(
      path.join(temporary, 'release-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
  }

  async materializeCandidate(
    manifest: ReleaseManifest,
    artifacts: ReadableArtifactStore,
  ): Promise<string> {
    const { sha256: expectedManifestChecksum, ...payload } = manifest
    if (manifestChecksum(payload) !== expectedManifestChecksum)
      throw new Error('Release manifest checksum mismatch')
    const destination = this.releaseDirectory(manifest.releaseId)
    if (await this.reuseExistingCandidate(manifest, destination))
      return destination
    const temporary = `${destination}.${randomUUID()}.candidate`
    try {
      await this.writeCandidate(temporary, manifest, artifacts)
      await mkdir(path.dirname(destination), { recursive: true })
      await rename(temporary, destination)
      return destination
    } catch (error) {
      await rm(temporary, { recursive: true, force: true })
      throw error
    }
  }

  async currentReleaseId(): Promise<string | undefined> {
    try {
      const pointer = JSON.parse(
        await readFile(path.join(this.root, 'current.json'), 'utf8'),
      ) as { releaseId?: string }
      return pointer.releaseId
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async readReleaseManifest(releaseId: string): Promise<ReleaseManifest> {
    const manifest = JSON.parse(
      await readFile(
        path.join(this.releaseDirectory(releaseId), 'release-manifest.json'),
        'utf8',
      ),
    ) as ReleaseManifest
    const { sha256: expected, ...payload } = manifest
    if (manifestChecksum(payload) !== expected)
      throw new Error('Release manifest checksum mismatch')
    return manifest
  }

  async verifyRelease(releaseId: string): Promise<ReleaseManifest> {
    const manifest = await this.readReleaseManifest(releaseId)
    for (const entry of manifest.entries) {
      const body = await readFile(
        path.join(this.releaseDirectory(releaseId), outputPath(entry.path)),
      )
      if (sha256(body) !== entry.sha256)
        throw new Error(`Deployed artifact checksum mismatch: ${entry.path}`)
    }
    return manifest
  }

  async activate(
    expectedReleaseId: string | undefined,
    nextReleaseId: string,
  ): Promise<void> {
    await stat(
      path.join(this.releaseDirectory(nextReleaseId), 'release-manifest.json'),
    )
    await mkdir(this.root, { recursive: true })
    const lockPath = path.join(this.root, '.activation.lock')
    let lock
    try {
      lock = await open(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('Release activation conflict')
      throw error
    }
    try {
      if ((await this.currentReleaseId()) !== expectedReleaseId)
        throw new Error('Release activation conflict')
      const temporary = path.join(this.root, `.current.${randomUUID()}.tmp`)
      await writeFile(
        temporary,
        `${JSON.stringify({ releaseId: nextReleaseId }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
      await rename(temporary, path.join(this.root, 'current.json'))
    } finally {
      await lock.close()
      await rm(lockPath, { force: true })
    }
  }

  async readCurrent(route: string): Promise<Uint8Array> {
    const releaseId = await this.currentReleaseId()
    if (!releaseId) throw new Error('No active release')
    return readFile(
      path.join(this.releaseDirectory(releaseId), outputPath(route)),
    )
  }
}
