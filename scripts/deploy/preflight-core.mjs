import fs from 'node:fs'

const ZERO_COST_COMPONENTS = ['database', 'objectStorage', 'staticHosting']

function hasPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function inspectIncludedUsage(record, component, missing) {
  const prefix = `billing: ${component}`
  const usage = record?.includedUsage
  if (
    !hasPositiveNumber(usage?.storageGbMonth) ||
    !hasPositiveNumber(usage?.classAOperations) ||
    !hasPositiveNumber(usage?.classBOperations)
  )
    missing.push(`${prefix} included usage allowances`)
  if (record?.overagePossible !== true)
    missing.push(`${prefix} must disclose possible overage`)
  if (!Number.isFinite(Date.parse(record?.operatorAcknowledgedAt ?? '')))
    missing.push(`${prefix} owner acknowledgement timestamp`)
}

function readEvidence(filePath, label, missing) {
  if (!filePath) {
    missing.push(`evidence: ${label} path`)
    return undefined
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    missing.push(`evidence: unreadable ${label} file`)
    return undefined
  }
}

function recentTimestamp(value, label, missing, now) {
  const timestamp = Date.parse(value ?? '')
  if (!Number.isFinite(timestamp)) {
    missing.push(`evidence: ${label} verifiedAt`)
    return
  }
  if (timestamp > now || now - timestamp > 30 * 24 * 60 * 60 * 1000)
    missing.push(`evidence: ${label} is older than 30 days or in the future`)
}

function inspectBilling(evidence, missing, now) {
  if (!evidence) return
  recentTimestamp(evidence.verifiedAt, 'billing', missing, now)
  for (const component of ZERO_COST_COMPONENTS) {
    const record = evidence[component]
    if (!record?.provider || !record?.plan)
      missing.push(`billing: ${component} provider and plan`)
    if (record?.billingMode === 'included-usage')
      inspectIncludedUsage(record, component, missing)
    else if (record?.monthlyCapUsd !== 0)
      missing.push(`billing: ${component} must have a verified $0 monthly cap`)
  }
  if (!Array.isArray(evidence.paidFeaturesEnabled))
    missing.push('billing: paidFeaturesEnabled must be an array')
  else if (evidence.paidFeaturesEnabled.length > 0)
    missing.push('billing: paid features must be disabled')
}

function inspectRecovery(evidence, missing, now) {
  if (!evidence) return
  recentTimestamp(evidence.verifiedAt, 'recovery', missing, now)
  for (const scope of ['admin', 'comments']) {
    const backup = evidence[scope]?.backupDataSha256
    const restore = evidence[scope]?.restoreDataSha256
    if (!/^[a-f0-9]{64}$/.test(backup ?? '') || backup !== restore)
      missing.push(`recovery: ${scope} backup and restore checksums must match`)
  }
}

function inspectDatabaseIsolation(environment, missing) {
  try {
    const admin = new URL(environment.DATABASE_URL)
    const comments = new URL(environment.COMMENTS_DATABASE_URL)
    if (admin.href === comments.href)
      missing.push('credentials: admin and comments database URLs must differ')
    if (
      admin.hostname === comments.hostname &&
      admin.port === comments.port &&
      admin.username === comments.username
    )
      missing.push(
        'credentials: admin and comments must use separate database users',
      )
  } catch {
    missing.push('credentials: database URLs must be valid PostgreSQL URLs')
  }
}

function requiredEnvironment(mode) {
  const required = [
    'PUBLIC_SMOKE_URL',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'STATIC_DEPLOYMENT_ADAPTER',
  ]
  if (mode === 'platform')
    required.push(
      'ADMIN_PUBLIC_ORIGIN',
      'ADMIN_SMOKE_URL',
      'DATABASE_URL',
      'COMMENTS_DATABASE_URL',
      'ADMIN_BOOTSTRAP_SECRET',
    )
  return required
}

function inspectDeploymentTopology(environment, missing, now) {
  if (environment.PUBLIC_SMOKE_URL && environment.ADMIN_SMOKE_URL) {
    try {
      if (
        new URL(environment.PUBLIC_SMOKE_URL).hostname ===
        new URL(environment.ADMIN_SMOKE_URL).hostname
      )
        missing.push('deployment topology: public and admin hosts must differ')
    } catch {
      missing.push('deployment topology: smoke URLs must be valid')
    }
  }
  if (environment.STATIC_DEPLOYMENT_ADAPTER === 'filesystem') {
    const deploymentRoot = environment.STATIC_DEPLOYMENT_ROOT?.trim()
    if (!deploymentRoot) missing.push('environment: STATIC_DEPLOYMENT_ROOT')
    else if (!deploymentRoot.startsWith('/'))
      missing.push(
        'deployment topology: STATIC_DEPLOYMENT_ROOT must be absolute',
      )
  } else if (environment.STATIC_DEPLOYMENT_ADAPTER === 'managed-static-host') {
    inspectManagedStaticHost(
      readEvidence(
        environment.STATIC_HOSTING_EVIDENCE_PATH,
        'static-hosting activation',
        missing,
      ),
      environment.PUBLIC_SMOKE_URL,
      missing,
      now,
    )
  } else if (environment.STATIC_DEPLOYMENT_ADAPTER)
    missing.push(
      `deployment topology: unsupported static adapter ${environment.STATIC_DEPLOYMENT_ADAPTER}`,
    )
}

function inspectManagedStaticHost(evidence, publicSmokeUrl, missing, now) {
  if (!evidence) return
  inspectRequiredTimestamp(
    evidence.verifiedAt,
    'static-hosting activation',
    missing,
    now,
  )
  if (
    typeof evidence.deploymentId !== 'string' ||
    !evidence.deploymentId.trim()
  )
    missing.push('static-hosting activation: deploymentId')
  for (const field of [
    'candidateVerifiedAt',
    'activationObservedAt',
    'rollbackObservedAt',
  ])
    inspectRequiredTimestamp(
      evidence[field],
      `static-hosting activation ${field}`,
      missing,
      now,
    )
  try {
    if (
      new URL(evidence.publicOrigin).origin !== new URL(publicSmokeUrl).origin
    )
      missing.push(
        'static-hosting activation: publicOrigin must match PUBLIC_SMOKE_URL',
      )
  } catch {
    missing.push('static-hosting activation: publicOrigin must be a valid URL')
  }
}

function inspectRequiredTimestamp(value, label, missing, now) {
  if (typeof value !== 'string' || !value.trim()) {
    missing.push(`evidence: ${label} verifiedAt`)
    return
  }
  recentTimestamp(value, label, missing, now)
}

function inspectEvidence(environment, missing, now) {
  const billing = readEvidence(
    environment.BILLING_ATTESTATION_PATH,
    'billing attestation',
    missing,
  )
  inspectBilling(billing, missing, now)
  const recovery = readEvidence(
    environment.RECOVERY_EVIDENCE_PATH,
    'recovery exercise',
    missing,
  )
  inspectRecovery(recovery, missing, now)
}

export function evaluatePreflight({
  environment = process.env,
  production = false,
  mode = 'platform',
  now = Date.now(),
} = {}) {
  if (mode !== 'platform' && mode !== 'content')
    throw new Error(`Unknown deployment mode: ${mode}`)
  const missing = []
  const warnings = []
  if (!production) return { missing, warnings }
  for (const name of requiredEnvironment(mode))
    if (!environment[name]?.trim()) missing.push(`environment: ${name}`)
  inspectDeploymentTopology(environment, missing, now)
  if (environment.DATABASE_URL && environment.COMMENTS_DATABASE_URL)
    inspectDatabaseIsolation(environment, missing)
  inspectEvidence(environment, missing, now)
  if (
    environment.OBJECT_STORAGE_ACCESS_KEY_ID &&
    environment.OBJECT_STORAGE_ACCESS_KEY_ID ===
      environment.OBJECT_STORAGE_SECRET_ACCESS_KEY
  )
    warnings.push('object-storage access key and secret are identical')
  return { missing: [...new Set(missing)], warnings: [...new Set(warnings)] }
}
