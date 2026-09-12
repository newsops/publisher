#!/usr/bin/env node

const args = process.argv.slice(2)
const json = args.includes('--json')
const nonInteractive = args.includes('--non-interactive')

function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function emit(ok, code, data = {}, exitCode = ok ? 0 : 1) {
  const body = { schemaVersion: 1, ok, code, ...data }
  process.stdout.write(
    `${json ? JSON.stringify(body) : `${code}: ${JSON.stringify(data)}`}\n`,
  )
  process.exitCode = exitCode
}

function config() {
  return {
    origin: process.env.PUBLISHER_ADMIN_ORIGIN?.replace(/\/$/, ''),
    token: process.env.PUBLISHER_API_TOKEN,
  }
}

async function request(path, init = {}) {
  const { origin, token } = config()
  if (!origin || !token) return undefined
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })
}

async function main() {
  if (args[0] === 'doctor') {
    const missing = ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'].filter(
      (name) => !process.env[name],
    )
    return emit(
      missing.length === 0,
      missing.length ? 'CONFIGURATION_REQUIRED' : 'READY',
      { missing, nonInteractive },
      missing.length ? 20 : 0,
    )
  }
  if (args[0] === 'status') {
    const response = await request('/api/v1/posts?limit=1')
    if (!response)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'] },
        20,
      )
    const body = await response.json()
    return emit(
      response.ok,
      response.ok ? 'READY' : 'REMOTE_ERROR',
      { status: response.status, state: body },
      response.ok ? 0 : 30,
    )
  }
  if (args[0] === 'operation' && args[1] === 'get' && args[2]) {
    const response = await request(
      `/api/v1/operations/${encodeURIComponent(args[2])}`,
    )
    if (!response)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'] },
        20,
      )
    const body = await response.json()
    return emit(
      response.ok,
      response.ok ? 'OPERATION' : 'REMOTE_ERROR',
      { status: response.status, state: body },
      response.ok ? 0 : 30,
    )
  }
  if (args[0] === 'publish') {
    if (args.includes('--requires-authority') && nonInteractive)
      return emit(
        false,
        'AUTHORITY_REQUIRED',
        { action: 'external-approval', mutationAttempted: false },
        40,
      )
    const key = option('--idempotency-key')
    if (!key)
      return emit(false, 'INPUT_REQUIRED', { field: '--idempotency-key' }, 10)
    const response = await request('/api/v1/publish', {
      method: 'POST',
      headers: { 'idempotency-key': key },
    })
    if (!response)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'] },
        20,
      )
    const body = await response.json()
    return emit(
      response.ok,
      response.ok ? 'OPERATION_ACCEPTED' : 'REMOTE_ERROR',
      { status: response.status, operationId: body.jobId, state: body },
      response.ok ? 0 : 30,
    )
  }
  if (args[0] === 'auth' && args[1] === 'login' && args.includes('--device')) {
    const issuer = process.env.PUBLISHER_OIDC_ISSUER?.replace(/\/$/, '')
    const clientId = process.env.PUBLISHER_OIDC_CLIENT_ID
    if (!issuer || !clientId)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: ['PUBLISHER_OIDC_ISSUER', 'PUBLISHER_OIDC_CLIENT_ID'] },
        20,
      )
    const discovery = await fetch(
      `${issuer}/.well-known/openid-configuration`,
    ).then((response) => response.json())
    const device = await fetch(discovery.device_authorization_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId }),
    }).then((response) => response.json())
    return emit(
      false,
      'AUTHORITY_REQUIRED',
      {
        verificationUri:
          device.verification_uri_complete ?? device.verification_uri,
        userCode: device.user_code,
        interval: device.interval ?? 5,
        tokenPersisted: false,
      },
      40,
    )
  }
  return emit(
    false,
    'USAGE',
    {
      commands: [
        'doctor',
        'status',
        'publish',
        'operation get',
        'auth login --device',
      ],
    },
    10,
  )
}

main().catch(() => emit(false, 'REMOTE_ERROR', { retryable: true }, 30))
