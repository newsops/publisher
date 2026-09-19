/**
 * Admin configuration (ARCH-005). This is the only module under
 * `apps/admin/app/lib` that reads `process.env`; every adapter, service, and
 * HTTP helper receives what it needs from here or from the composition root.
 * Values are read on each call so tests can change the environment between
 * cases; nothing here is cached.
 */

export interface AdminConfig {
  readonly nodeEnv: string | undefined
  readonly databaseUrl: string | undefined
  readonly adminDataDir: string | undefined
  /** `NODE_ENV !== 'production'` with `ADMIN_DATA_DIR`: file-backed stores. */
  readonly isolatedFileRepository: boolean
  readonly publicOrigin: string | undefined
  readonly bootstrapSecret: string | undefined
  readonly devToken: string | undefined
  readonly devPublishers: readonly string[]
  readonly devOwners: readonly string[]
  readonly automationKeys: string | undefined
  readonly automationKeysExtra: string | undefined
  readonly commentsOrigin: string | undefined
  readonly commentsModerationToken: string | undefined
}

function emails(value: string | undefined): readonly string[] {
  return value?.split(',').map((entry) => entry.trim().toLowerCase()) ?? []
}

export function adminConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AdminConfig {
  const nodeEnv = environment.NODE_ENV
  const adminDataDir = environment.ADMIN_DATA_DIR
  return {
    nodeEnv,
    databaseUrl: environment.DATABASE_URL,
    adminDataDir,
    isolatedFileRepository: nodeEnv !== 'production' && Boolean(adminDataDir),
    publicOrigin: environment.ADMIN_PUBLIC_ORIGIN,
    bootstrapSecret: environment.ADMIN_BOOTSTRAP_SECRET,
    devToken: environment.ADMIN_DEV_TOKEN,
    devPublishers: emails(environment.ADMIN_PUBLISHERS),
    devOwners: emails(environment.ADMIN_OWNERS),
    automationKeys: environment.ADMIN_AUTOMATION_KEYS,
    automationKeysExtra: environment.ADMIN_AUTOMATION_KEYS_EXTRA,
    commentsOrigin: environment.COMMENTS_ORIGIN,
    commentsModerationToken: environment.COMMENTS_MODERATION_TOKEN,
  }
}

/** Default local data directory for file-backed stores. */
export function adminDataDirectory(
  siteId = 'default',
  config: AdminConfig = adminConfig(),
): string {
  const base = config.adminDataDir ?? `${process.cwd()}/.data/admin`
  return siteId === 'default' ? base : `${base}/sites/${siteId}`
}
