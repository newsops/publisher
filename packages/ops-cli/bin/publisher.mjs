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
  // Envelope fields win over payload keys so a remote body can never rename
  // the documented `code`.
  const body = { ...data, schemaVersion: 1, ok, code }
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
    // The content contract is pure TypeScript; tsx (registered above) loads it.
    const { validateEditorialArchive, archiveSummary } =
      await import('@publisher/content')
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
  if (args[0] === 'post' && ['plan', 'create', 'update'].includes(args[1])) {
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
      if (action === 'create' || action === 'update') {
        const file = option('--input')
        if (!file)
          return emit(false, 'INPUT_REQUIRED', { field: '--input' }, 10)
        input = JSON.parse(await readFile(file, 'utf8'))
      }
      const postId = option('--post')
      const current =
        action === 'update' && postId
          ? await api.getPost(siteId, postId)
          : undefined
      if (action === 'update' && !postId)
        return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
      const selectedAuthor =
        authorSlug ??
        (typeof input?.authorSlug === 'string'
          ? input.authorSlug
          : current?.data?.post?.authorSlug)
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
      const revision = Number(option('--revision'))
      if (
        action === 'update' &&
        (!Number.isSafeInteger(revision) || revision < 1)
      )
        return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
      const response =
        action === 'create'
          ? await api.createPost(siteId, {
              ...input,
              authorSlug: selectedAuthor,
            })
          : await api.updatePost(
              siteId,
              postId,
              { ...input, authorSlug: selectedAuthor },
              revision,
            )
      return emit(true, action === 'create' ? 'POST_CREATED' : 'POST_UPDATED', {
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
      const slug = option('--slug')
      const name = option('--name')
      if (!['create', 'get', 'update', 'archive'].includes(action))
        return emit(
          false,
          'USAGE',
          {
            command: `taxonomy ${kind} list|create|get|update|archive --site <id>`,
          },
          10,
        )
      if (!slug && action !== 'create')
        return emit(false, 'INPUT_REQUIRED', { field: '--slug' }, 10)
      if (action === 'get') {
        const response =
          kind === 'categories'
            ? await api.getCategory(siteId, slug)
            : await api.getTag(siteId, slug)
        return emit(true, 'TAXONOMY', response.data ?? {})
      }
      if (!name && action !== 'archive')
        return emit(false, 'INPUT_REQUIRED', { field: '--name' }, 10)
      if (!nonInteractive)
        return emit(
          false,
          'NON_INTERACTIVE_REQUIRED',
          { mutationAttempted: false },
          10,
        )
      const revision = Number(option('--revision'))
      if (
        action !== 'create' &&
        (!Number.isSafeInteger(revision) || revision < 1)
      )
        return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
      const response =
        action === 'create'
          ? kind === 'categories'
            ? await api.createCategory(siteId, { name, slug })
            : await api.createTag(siteId, { name, slug })
          : action === 'update'
            ? kind === 'categories'
              ? await api.updateCategory(siteId, slug, { name }, revision)
              : await api.updateTag(siteId, slug, { name }, revision)
            : kind === 'categories'
              ? await api.archiveCategory(siteId, slug, revision)
              : await api.archiveTag(siteId, slug, revision)
      return emit(
        true,
        `TAXONOMY_${action.toUpperCase()}D`,
        response.data ?? {},
      )
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'author') {
    const action = args[1] ?? 'list'
    const siteId = option('--site')
    const slug = option('--slug')
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
      if (action === 'list')
        return emit(true, 'AUTHORS', (await api.listAuthors(siteId)).data ?? {})
      if (!slug && action !== 'create')
        return emit(false, 'INPUT_REQUIRED', { field: '--slug' }, 10)
      if (action === 'get')
        return emit(
          true,
          'AUTHOR_CONTEXT',
          (await api.getAuthor(siteId, slug)).data ?? {},
        )
      if (!nonInteractive)
        return emit(
          false,
          'NON_INTERACTIVE_REQUIRED',
          { mutationAttempted: false },
          10,
        )
      const file = option('--input')
      if (action !== 'archive' && !file)
        return emit(false, 'INPUT_REQUIRED', { field: '--input' }, 10)
      const input = file ? JSON.parse(await readFile(file, 'utf8')) : undefined
      if (action === 'create')
        return emit(
          true,
          'AUTHOR_CREATED',
          (await api.createAuthor(siteId, input)).data ?? {},
        )
      const revision = Number(option('--revision'))
      if (!Number.isSafeInteger(revision) || revision < 1)
        return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
      if (action === 'update')
        return emit(
          true,
          'AUTHOR_UPDATED',
          (await api.updateAuthor(siteId, slug, input, revision)).data ?? {},
        )
      if (action === 'archive')
        return emit(
          true,
          'AUTHOR_ARCHIVED',
          (await api.archiveAuthor(siteId, slug, revision)).data ?? {},
        )
      return emit(
        false,
        'USAGE',
        { command: 'author list|get|create|update|archive' },
        10,
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
  if (
    (args[0] === 'settings' && (args[1] === 'get' || args[1] === 'set')) ||
    (args[0] === 'site' && (args[1] === 'update' || args[1] === 'archive')) ||
    (args[0] === 'post' && args[1] === 'delete') ||
    (args[0] === 'post' && args[1] === 'get') ||
    args[0] === 'plugin' ||
    args[0] === 'article' ||
    args[0] === 'media'
  ) {
    // Surface parity (ARCH-006): every automation capability has a command.
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
    const revisionOption = () => {
      const revision = Number(option('--revision'))
      return Number.isSafeInteger(revision) && revision >= 1
        ? revision
        : undefined
    }
    /** True (after emitting) when a mutation must not proceed. */
    const mutation = () => {
      if (nonInteractive) return false
      emit(false, 'NON_INTERACTIVE_REQUIRED', { mutationAttempted: false }, 10)
      return true
    }
    const inputFile = async () => {
      const file = option('--input')
      if (!file)
        return {
          error: emit(false, 'INPUT_REQUIRED', { field: '--input' }, 10),
        }
      return { value: JSON.parse(await readFile(file, 'utf8')) }
    }
    try {
      if (args[0] === 'settings' && args[1] === 'get') {
        const response = await api.getSettings(siteId)
        return emit(true, 'SETTINGS', response.data ?? {})
      }
      if (args[0] === 'settings' && args[1] === 'set') {
        const revision = revisionOption()
        if (!revision)
          return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
        const input = await inputFile()
        if ('error' in input) return
        if (mutation()) return
        const response = await api.updateSettings(siteId, input.value, revision)
        return emit(true, 'SETTINGS_UPDATED', response.data ?? {})
      }
      if (args[0] === 'site' && args[1] === 'update') {
        const input = await inputFile()
        if ('error' in input) return
        if (mutation()) return
        const response = await api.updateSite(siteId, input.value)
        return emit(true, 'SITE_UPDATED', response.data ?? {})
      }
      if (args[0] === 'site' && args[1] === 'archive') {
        if (mutation()) return
        const response = await api.archiveSite(siteId)
        return emit(true, 'SITE_ARCHIVED', response.data ?? {})
      }
      if (args[0] === 'post' && args[1] === 'delete') {
        const postId = option('--post')
        const revision = revisionOption()
        if (!postId)
          return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
        if (!revision)
          return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
        if (mutation()) return
        const response = await api.deletePost(siteId, postId, revision)
        return emit(true, 'POST_DELETED', response.data ?? {})
      }
      if (args[0] === 'post' && args[1] === 'get') {
        const postId = option('--post')
        if (!postId)
          return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
        const response = await api.getPost(siteId, postId)
        return emit(true, 'POST', response.data ?? {})
      }
      if (args[0] === 'plugin') {
        const pluginId = option('--plugin')
        if (args[1] === 'list') {
          const response = await api.listPlugins(siteId)
          return emit(true, 'PLUGINS', response.data ?? {})
        }
        if (!pluginId)
          return emit(false, 'INPUT_REQUIRED', { field: '--plugin' }, 10)
        if (args[1] === 'get') {
          const response = await api.getPlugin(siteId, pluginId)
          return emit(true, 'PLUGIN', response.data ?? {})
        }
        if (args[1] === 'install') {
          const input = option('--input') ? await inputFile() : { value: {} }
          if ('error' in input) return
          if (mutation()) return
          const response = await api.createPlugin(siteId, {
            pluginId,
            configuration: input.value,
          })
          return emit(true, 'PLUGIN_INSTALLED', response.data ?? {})
        }
        const revision = revisionOption()
        if (!revision)
          return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
        if (args[1] === 'configure') {
          const input = await inputFile()
          if ('error' in input) return
          if (mutation()) return
          const response = await api.configurePlugin(
            siteId,
            pluginId,
            input.value,
            revision,
          )
          return emit(true, 'PLUGIN_CONFIGURED', response.data ?? {})
        }
        if (['validate', 'enable', 'disable'].includes(args[1])) {
          const configuration = option('--input')
            ? (await inputFile()).value
            : undefined
          if (mutation()) return
          const response = await api.runPluginAction(
            siteId,
            pluginId,
            args[1],
            revision,
            configuration,
          )
          return emit(
            true,
            `PLUGIN_${args[1].toUpperCase()}D`,
            response.data ?? {},
          )
        }
        return emit(
          false,
          'USAGE',
          {
            command:
              'plugin list|get|install|configure|validate|enable|disable',
          },
          10,
        )
      }
      if (args[0] === 'article') {
        const articleId = option('--article')
        if (!articleId)
          return emit(false, 'INPUT_REQUIRED', { field: '--article' }, 10)
        if (args[1] === 'get') {
          const response = await api.getArticle(siteId, articleId)
          return emit(true, 'ARTICLE', response.data ?? {})
        }
        const revision = revisionOption()
        if (!revision)
          return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
        if (args[1] === 'set') {
          const input = await inputFile()
          if ('error' in input) return
          if (mutation()) return
          const response = await api.putArticleVariant(
            siteId,
            articleId,
            input.value,
            revision,
          )
          return emit(true, 'ARTICLE_VARIANT_SET', response.data ?? {})
        }
        if (args[1] === 'remove') {
          const locale = option('--locale')
          if (!locale)
            return emit(false, 'INPUT_REQUIRED', { field: '--locale' }, 10)
          if (mutation()) return
          const response = await api.deleteArticleVariant(
            siteId,
            articleId,
            locale,
            revision,
          )
          return emit(true, 'ARTICLE_VARIANT_REMOVED', response.data ?? {})
        }
        return emit(false, 'USAGE', { command: 'article get|set|remove' }, 10)
      }
      if (args[0] === 'media') {
        if (args[1] === 'upload') {
          const file = option('--file')
          const mimeType = option('--mime-type')
          if (!file)
            return emit(false, 'INPUT_REQUIRED', { field: '--file' }, 10)
          if (!mimeType)
            return emit(false, 'INPUT_REQUIRED', { field: '--mime-type' }, 10)
          if (mutation()) return
          const body = await readFile(file)
          const uploaded = await api.uploadMedia(siteId, {
            fileName: path.basename(file),
            mimeType,
            sha256: createHash('sha256').update(body).digest('hex'),
            body,
          })
          if (!args.includes('--pending')) {
            const approved = await api.approveMedia(
              siteId,
              uploaded.data.media.id,
            )
            return emit(true, 'MEDIA_APPROVED', approved.data ?? {})
          }
          return emit(true, 'MEDIA_UPLOADED', uploaded.data ?? {})
        }
        if (args[1] === 'approve') {
          const mediaId = option('--media')
          if (!mediaId)
            return emit(false, 'INPUT_REQUIRED', { field: '--media' }, 10)
          if (mutation()) return
          const response = await api.approveMedia(siteId, mediaId)
          return emit(true, 'MEDIA_APPROVED', response.data ?? {})
        }
        return emit(false, 'USAGE', { command: 'media upload|approve' }, 10)
      }
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
  if (args[0] === 'post' && args[1] === 'submit') {
    const siteId = option('--site')
    const postId = option('--post')
    const revision = option('--revision')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!postId) return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
    if (!revision)
      return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
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
      const updated = await api.updatePost(
        siteId,
        postId,
        { status: 'review' },
        Number(revision),
      )
      const report = await api.getDeskReport(siteId, postId)
      return emit(true, 'POST_SUBMITTED', {
        siteId,
        post: updated.data?.post,
        desk: report.data,
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'desk' && args[1] === 'list') {
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
      const response = await api.listPosts(siteId)
      const posts = (response.data?.posts ?? []).filter(
        (post) => post.status === 'review' || post.status === 'draft',
      )
      return emit(true, 'DESK_QUEUE', {
        siteId,
        posts: posts.map((post) => ({
          id: post.id,
          slug: post.slug,
          title: post.title,
          status: post.status,
          revision: post.revision,
          updatedAt: post.updatedAt,
          review: post.deskReview,
        })),
      })
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (args[0] === 'desk' && args[1] === 'report') {
    const siteId = option('--site')
    const postId = option('--post')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!postId) return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
    const api = client()
    if (!api)
      return emit(
        false,
        'CONFIGURATION_REQUIRED',
        { missing: missingClientConfiguration() },
        20,
      )
    try {
      const response = await api.getDeskReport(siteId, postId)
      return emit(true, 'DESK_REPORT', response.data ?? {})
    } catch (error) {
      return emit(false, 'REMOTE_ERROR', apiErrorData(error), 30)
    }
  }
  if (
    args[0] === 'desk' &&
    (args[1] === 'approve' || args[1] === 'request-changes')
  ) {
    const siteId = option('--site')
    const postId = option('--post')
    const revision = option('--revision')
    const note = option('--note')
    if (!siteId) return emit(false, 'INPUT_REQUIRED', { field: '--site' }, 10)
    if (!postId) return emit(false, 'INPUT_REQUIRED', { field: '--post' }, 10)
    if (!revision)
      return emit(false, 'INPUT_REQUIRED', { field: '--revision' }, 10)
    if (args[1] === 'request-changes' && !note)
      return emit(false, 'INPUT_REQUIRED', { field: '--note' }, 10)
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
      let checklist
      if (args[1] === 'approve') {
        // Every item must be attested explicitly: --check <id> per item, or
        // --checklist-file with [{ id, checked, note? }]. Nothing is implied.
        const file = option('--checklist-file')
        const checked = args
          .map((value, index) =>
            value === '--check' ? args[index + 1] : undefined,
          )
          .filter((value) => typeof value === 'string')
        checklist = file
          ? JSON.parse(await readFile(file, 'utf8'))
          : checked.map((id) => ({ id, checked: true }))
        if (!Array.isArray(checklist) || checklist.length === 0)
          return emit(
            false,
            'INPUT_REQUIRED',
            { field: '--check <id> ... | --checklist-file <path>' },
            10,
          )
      }
      const response = await api.decideDesk(
        siteId,
        postId,
        {
          action: args[1],
          ...(checklist ? { checklist } : {}),
          ...(note ? { note } : {}),
        },
        Number(revision),
      )
      return emit(
        true,
        args[1] === 'approve' ? 'DESK_APPROVED' : 'DESK_CHANGES_REQUESTED',
        response.data ?? {},
      )
    } catch (error) {
      const data = apiErrorData(error)
      const deskCode = data.body?.error?.code
      if (
        deskCode === 'desk_checks_failed' ||
        deskCode === 'desk_checklist_incomplete'
      ) {
        // The report explains what to improve; the loop continues until it passes.
        return emit(false, 'DESK_REJECTED', { ...data, reason: deskCode }, 30)
      }
      return emit(false, 'REMOTE_ERROR', data, 30)
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
        'site update --site <id> --input <site.json> --non-interactive --json',
        'site archive --site <id> --non-interactive --json',
        'settings get --site <id> --json',
        'settings set --site <id> --input <settings.json> --revision <n> --non-interactive --json',
        'taxonomy categories|tags list --site <id> --json',
        'taxonomy categories|tags create --site <id> --name <name> [--slug <slug>] --non-interactive --json',
        'author get --site <id> --slug <author-slug> --json',
        'post plan --site <id> --author <author-slug> --json',
        'post get --site <id> --post <post-id> --json',
        'post create --site <id> --input <post.json> [--author <author-slug>] --non-interactive --json',
        'post update --site <id> --post <post-id> --input <patch.json> --revision <n> [--author <author-slug>] --non-interactive --json',
        'post submit --site <id> --post <post-id> --revision <n> --non-interactive --json',
        'post delete --site <id> --post <post-id> --revision <n> --non-interactive --json',
        'article get --site <id> --article <post-id> --json',
        'article set --site <id> --article <post-id> --input <variant.json> --revision <n> --non-interactive --json',
        'article remove --site <id> --article <post-id> --locale <tag> --revision <n> --non-interactive --json',
        'plugin list --site <id> --json',
        'plugin get --site <id> --plugin <plugin-id> --json',
        'plugin install --site <id> --plugin <plugin-id> [--input <configuration.json>] --non-interactive --json',
        'plugin configure --site <id> --plugin <plugin-id> --input <configuration.json> --revision <n> --non-interactive --json',
        'plugin validate|enable|disable --site <id> --plugin <plugin-id> --revision <n> [--input <configuration.json>] --non-interactive --json',
        'media upload --site <id> --file <path> --mime-type <type> [--pending] --non-interactive --json',
        'media approve --site <id> --media <media-id> --non-interactive --json',
        'desk list --site <id> --json',
        'desk report --site <id> --post <post-id> --json',
        'desk approve --site <id> --post <post-id> --revision <n> --check <item-id>... | --checklist-file <path> [--note <text>] --non-interactive --json',
        'desk request-changes --site <id> --post <post-id> --revision <n> --note <text> --non-interactive --json',
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
  if (error instanceof PublisherApiError) {
    // The client's own code (`REMOTE_ERROR` | `MALFORMED_RESPONSE`) travels as
    // `clientCode`; the envelope `code` stays the CLI's classification.
    const { code: clientCode, ...rest } = error.toJSON()
    return { clientCode, ...rest }
  }
  return { retryable: true }
}

main().catch(() => emit(false, 'REMOTE_ERROR', { retryable: true }, 30))
