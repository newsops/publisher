#!/usr/bin/env node

import {
  PublisherApiError,
  createPublisherAdminClient,
} from '@publisher/admin-client'

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

function client() {
  const origin = process.env.PUBLISHER_ADMIN_ORIGIN?.replace(/\/$/, '')
  const token = process.env.PUBLISHER_API_TOKEN
  if (!origin || !token) return undefined

  return createPublisherAdminClient({ origin, token })
}

function missingClientConfiguration() {
  return ['PUBLISHER_ADMIN_ORIGIN', 'PUBLISHER_API_TOKEN'].filter(
    (name) => !process.env[name],
  )
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function main() {
  if (args[0] === 'doctor') {
    const missing = missingClientConfiguration()
    return emit(
      missing.length === 0,
      missing.length ? 'CONFIGURATION_REQUIRED' : 'READY',
      { missing, nonInteractive },
      missing.length ? 20 : 0,
    )
  }
  if (args[0] === 'status') {
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.getStatus()
      return emit(true, 'READY', {
        status: response.status,
        state: {
          kind: 'site',
          status: 'ready',
          terminal: false,
          retryable: false,
          site: response.data,
        },
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'operation' && args[1] === 'get' && args[2]) {
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.getOperation(args[2])
      return emit(true, 'OPERATION', {
        status: response.status,
        state: response.data,
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
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
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.publish(key)
      const body = response.data
      return emit(true, 'OPERATION_ACCEPTED', {
        status: response.status,
        operationId: body?.jobId,
        state: body,
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
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
    const interval = Math.max(1, Number(device.interval) || 5)
    let pollAttempted = false
    if (discovery.token_endpoint && device.device_code) {
      await wait(interval * 1_000)
      pollAttempted = true
      await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: device.device_code,
          client_id: clientId,
        }),
      }).then((response) => response.json())
    }
    return emit(
      false,
      'AUTHORITY_REQUIRED',
      {
        verificationUri:
          device.verification_uri_complete ?? device.verification_uri,
        userCode: device.user_code,
        interval,
        pollAttempted,
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

function apiErrorData(error) {
  if (error instanceof PublisherApiError) return error.toJSON()
  return { retryable: true }
}

main().catch(() => emit(false, 'REMOTE_ERROR', { retryable: true }, 30))
