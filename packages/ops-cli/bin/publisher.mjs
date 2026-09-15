#!/usr/bin/env node

import {
  PublisherApiError,
  createPublisherAdminClient,
} from '@publisher/admin-client'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { register } from 'tsx/esm/api'

const args = process.argv.slice(2)
const json = args.includes('--json')
const nonInteractive = args.includes('--non-interactive')

register()

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

async function archiveManifest(directory) {
  if (!directory)
    return { error: { code: 'INPUT_REQUIRED', field: '--archive' } }
  try {
    const root = path.resolve(directory)
    const raw = await readFile(path.join(root, 'archive.json'), 'utf8')
    const { validateEditorialArchive, archiveSummary } =
      await import('../../content/src/archive.ts')
    const archive = validateEditorialArchive(JSON.parse(raw))
    for (const media of archive.media) {
      const target = path.resolve(root, media.assetPath)
      if (!target.startsWith(`${root}${path.sep}`))
        return { error: { code: 'ARCHIVE_INVALID', reason: 'asset_path' } }
      const metadata = await stat(target)
      if (!metadata.isFile() || metadata.size !== media.byteSize)
        return { error: { code: 'ARCHIVE_INVALID', reason: 'asset_size' } }
      const body = await readFile(target)
      const sha256 = createHash('sha256').update(body).digest('hex')
      if (sha256 !== media.sha256)
        return { error: { code: 'ARCHIVE_INVALID', reason: 'asset_checksum' } }
    }
    return {
      archive,
      summary: archiveSummary(archive),
      digest: createHash('sha256')
        .update(JSON.stringify(archive))
        .digest('hex'),
    }
  } catch (error) {
    return {
      error: {
        code: 'ARCHIVE_INVALID',
        reason: error instanceof Error ? 'manifest_or_asset' : 'unknown',
      },
    }
  }
}

async function main() {
  if (args[0] === 'post' && ['plan', 'create'].includes(args[1])) {
    const action = args[1]
    const siteId = option('--site')
    const authorSlug = option('--author')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      let input
      if (action === 'create') {
        const file = option('--input')
        if (!file)
          return emit(false, 'INPUT_REQUIRED', { field: '--input' }, 10)
        input = JSON.parse(await readFile(file, 'utf8'))
      }
      const selectedAuthor =
        authorSlug ??
        (typeof input?.authorSlug === 'string' ? input.authorSlug : undefined)
      if (!selectedAuthor)
        return emit(false, 'INPUT_REQUIRED', { field: '--author' }, 10)
      const author = await api.getAuthor(siteId, selectedAuthor)
      const authorContext = author.data?.author
        ? {
            authorSlug: author.data.author.slug,
            displayName: author.data.author.name,
            editorialPersona: author.data.author.editorialPersona ?? '',
          }
        : undefined
      if (!authorContext)
        return emit(false, 'AUTHOR_CONTEXT_UNAVAILABLE', { siteId }, 30)
      if (action === 'plan')
        return emit(true, 'POST_PLAN', { siteId, authorContext })
      if (!nonInteractive)
        return emit(
          false,
          'NON_INTERACTIVE_REQUIRED',
          { mutationAttempted: false, authorContext },
          10,
        )
      const response = await api.createPost(siteId, {
        ...input,
        authorSlug: selectedAuthor,
      })
      return emit(true, 'POST_CREATED', {
        authorContext: response.data?.authorContext ?? authorContext,
        post: response.data?.post,
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'taxonomy' && ['categories', 'tags'].includes(args[1])) {
    const kind = args[1]
    const action = args[2] ?? 'list'
    const siteId = option('--site')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      if (action === 'list') {
        const response =
          kind === 'categories'
            ? await api.listCategories(siteId)
            : await api.listTags(siteId)
        return emit(true, 'TAXONOMY', response.data ?? {})
      }
      const name = option('--name')
      if (action !== 'create' || !name)
        return emit(
          false,
          'USAGE',
          {
            command: `taxonomy ${kind} list|create --site <id> [--name <name>]`,
          },
          10,
        )
      if (!nonInteractive)
        return emit(
          false,
          'NON_INTERACTIVE_REQUIRED',
          { mutationAttempted: false },
          10,
        )
      const response =
        kind === 'categories'
          ? await api.createCategory(siteId, { name, slug: option('--slug') })
          : await api.createTag(siteId, { name, slug: option('--slug') })
      return emit(true, 'TAXONOMY_CREATED', response.data ?? {})
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'author' && args[1] === 'get') {
    const siteId = option('--site'),
      slug = option('--slug')
    if (!siteId || !slug)
      return emit(
        false,
        'INPUT_REQUIRED',
        { field: !siteId ? '--site' : '--slug' },
        10,
      )
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      return emit(
        true,
        'AUTHOR_CONTEXT',
        (await api.getAuthor(siteId, slug)).data ?? {},
      )
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'site' && args[1] === 'list') {
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.listSites()
      return emit(true, 'SITES', { sites: response.data?.sites ?? [] })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'site' && args[1] === 'create') {
    const siteId = option('--site')
    const name = option('--name')
    const canonicalOrigin = option('--canonical-origin')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!name) return emit(false, 'INPUT_REQUIRED', { field: '--name' }, 10)
    if (!canonicalOrigin)
      return emit(false, 'INPUT_REQUIRED', { field: '--canonical-origin' }, 10)
    if (!nonInteractive)
      return emit(
        false,
        'NON_INTERACTIVE_REQUIRED',
        { mutationAttempted: false },
        10,
      )
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.createSite({
        siteId,
        name,
        canonicalOrigin,
        themeId: option('--theme'),
      })
      return emit(true, 'SITE_CREATED', { site: response.data?.site })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'site' && args[1] === 'bootstrap') {
    const siteId = option('--site')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!nonInteractive)
      return emit(
        false,
        'NON_INTERACTIVE_REQUIRED',
        { mutationAttempted: false },
        10,
      )
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.bootstrapSite(siteId)
      return emit(true, 'SITE_BOOTSTRAPPED', response.data ?? {})
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'site' && args[1] === 'guidance') {
    const action = args[2]
    const siteId = option('--site')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      if (action === 'get') {
        const response = await api.getAgentGuidance(siteId)
        return emit(true, 'AGENT_GUIDANCE', response.data ?? {})
      }
      if (action === 'set') {
        const file = option('--file')
        const revision = Number(option('--revision'))
        if (!file) return emit(false, 'INPUT_REQUIRED', { field: '--file' }, 10)
        if (!Number.isSafeInteger(revision) || revision < 1)
          return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
        if (!nonInteractive)
          return emit(
            false,
            'NON_INTERACTIVE_REQUIRED',
            { mutationAttempted: false },
            10,
          )
        const response = await api.updateAgentGuidance(
          siteId,
          await readFile(file, 'utf8'),
          revision,
        )
        return emit(true, 'AGENT_GUIDANCE_UPDATED', response.data ?? {})
      }
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
    return emit(false, 'USAGE', { command: 'site guidance get|set' }, 10)
  }
  if (args[0] === 'content' && args[1] === 'inspect') {
    const result = await archiveManifest(option('--archive'))
    if ('error' in result)
      return emit(false, result.error.code, result.error, 10)
    return emit(true, 'ARCHIVE_INSPECTED', {
      ...result.summary,
      digest: result.digest,
      nonInteractive,
    })
  }
  if (args[0] === 'embed' && args[1] === 'x' && args[2] === 'resolve') {
    const siteId = option('--site')
    const url = option('--url')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!url) return emit(false, 'INPUT_REQUIRED', { field: '--url' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.resolveXPostEmbed(siteId, url)
      return emit(true, 'X_EMBED_RESOLVED', response.data ?? {})
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'content' && args[1] === 'restore') {
    const archiveResult = await archiveManifest(option('--archive'))
    if ('error' in archiveResult)
      return emit(false, archiveResult.error.code, archiveResult.error, 10)
    const siteId = option('--site')
    const expectedRevision = Number(option('--expected-revision'))
    const idempotencyKey = option('--idempotency-key')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return emit(false, 'INPUT_REQUIRED', { field: '--expected-revision' }, 10)
    if (!idempotencyKey)
      return emit(false, 'INPUT_REQUIRED', { field: '--idempotency-key' }, 10)
    if (!nonInteractive)
      return emit(
        false,
        'NON_INTERACTIVE_REQUIRED',
        { mutationAttempted: false },
        10,
      )
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const guidance = await api.getAgentGuidance(siteId)
      const media = {}
      for (const entry of archiveResult.archive.media) {
        const body = await readFile(
          path.resolve(option('--archive'), entry.assetPath),
        )
        const uploaded = await api.uploadMedia(siteId, {
          fileName: path.basename(entry.assetPath),
          mimeType: entry.mimeType,
          sha256: entry.sha256,
          body,
        })
        const approved = await api.approveMedia(siteId, uploaded.data.media.id)
        const variant = approved.data.media.variants.find(
          (candidate) => candidate.mimeType === 'image/webp',
        )
        if (!variant) throw new Error('approved media has no WebP variant')
        media[entry.assetPath] = {
          mediaId: approved.data.media.id,
          variantSha256: variant.sha256,
        }
      }
      const response = await api.restoreContent(
        siteId,
        {
          archive: archiveResult.archive,
          expectedRevision,
          media,
        },
        idempotencyKey,
      )
      return emit(true, 'ARCHIVE_RESTORE_ACCEPTED', {
        agentContext: guidance.data?.agentContext,
        operationId: response.data?.operation?.operationId,
        state: response.data?.operation,
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
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
      const response = await api.listSites()
      return emit(true, 'READY', {
        status: response.status,
        state: {
          kind: 'site',
          status: 'ready',
          terminal: false,
          retryable: false,
          site: response.data?.sites ?? [],
        },
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'operation' && args[1] === 'get' && args[2]) {
    const siteId = option('--site')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.getOperation(siteId, args[2])
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
    const siteId = option('--site')
    if (!key)
      return emit(false, 'INPUT_REQUIRED', { field: '--idempotency-key' }, 10)
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const guidance = await api.getAgentGuidance(siteId)
      const response = await api.publish(siteId, key)
      const body = response.data
      return emit(true, 'OPERATION_ACCEPTED', {
        agentContext: guidance.data?.agentContext,
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
        'site list',
        'site create --site <id> --name <name> --canonical-origin <origin> --non-interactive',
        'site bootstrap --site <id> --non-interactive',
        'site guidance get --site <id> --json',
        'site guidance set --site <id> --file <path> --revision <n> --non-interactive --json',
        'taxonomy categories|tags list --site <id> --json',
        'taxonomy categories|tags create --site <id> --name <name> [--slug <slug>] --non-interactive --json',
        'author get --site <id> --slug <author-slug> --json',
        'post plan --site <id> --author <author-slug> --json',
        'post create --site <id> --input <post.json> [--author <author-slug>] --non-interactive --json',
        'status',
        'publish',
        'operation get',
        'auth login --device',
        'content inspect --archive <directory>',
        'embed x resolve --site <id> --url <canonical-x-status-url> --json',
        'content restore --archive <directory> --site <id> --expected-revision <n> --idempotency-key <key> --non-interactive',
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
