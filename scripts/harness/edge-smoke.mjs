#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const publicUrl = process.env.PUBLIC_SMOKE_URL
const adminUrl = process.env.ADMIN_SMOKE_URL
const originUrl = process.env.ORIGIN_SMOKE_URL
const adminRateLimitUrl = process.env.ADMIN_RATE_LIMIT_SMOKE_URL
const contactRateLimitUrl = process.env.CONTACT_RATE_LIMIT_SMOKE_URL
const commentsUrl = process.env.COMMENTS_SMOKE_URL
const commentsRateLimitUrl = process.env.COMMENTS_RATE_LIMIT_SMOKE_URL
const commentsModerationUrl = process.env.COMMENTS_MODERATION_SMOKE_URL
const requireCloudflare = process.env.REQUIRE_CLOUDFLARE_EDGE === '1'
const rateLimitRequests = Number(process.env.RATE_LIMIT_SMOKE_REQUESTS ?? 65)
let publicHost

async function check(url, expectedStatuses, label) {
  const response = await fetch(url, { redirect: 'manual' })
  if (!expectedStatuses.includes(response.status))
    throw new Error(
      `${label}: expected ${expectedStatuses.join('/')} but received ${response.status}`,
    )
  return response
}

function requireUrl(value, name) {
  if (!value) throw new Error(`${name} is required for full remote edge smoke`)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:')
    throw new Error(`${name} must use HTTPS for remote edge smoke`)
  return parsed
}

async function checkRateLimit(
  url,
  label,
  initOrFactory = {},
  acceptedStatuses = [200],
) {
  let limited = false
  for (let index = 0; index < rateLimitRequests; index += 1) {
    const init =
      typeof initOrFactory === 'function' ? initOrFactory(index) : initOrFactory
    const response = await fetch(url, { ...init, redirect: 'manual' })
    if (response.status === 429) {
      limited = true
      break
    }
    if (!acceptedStatuses.includes(response.status))
      throw new Error(
        `${label}: expected ${acceptedStatuses.join('/')} or 429 but received ${response.status}`,
      )
  }
  if (!limited)
    throw new Error(
      `${label} did not return 429 within ${rateLimitRequests} requests`,
    )
  console.log(`[edge-smoke] ${label} returned 429 under controlled load`)
}

if (
  !publicUrl &&
  !adminUrl &&
  !commentsUrl &&
  !commentsRateLimitUrl &&
  !commentsModerationUrl
) {
  const headersPath = path.join(root, 'apps/site/public/_headers')
  const headers = fs.readFileSync(headersPath, 'utf8')
  if (!headers.includes('immutable') || !headers.includes('stale-if-error'))
    throw new Error('static cache policy is incomplete')
  if (
    fs.existsSync(path.join(root, 'apps/site/out/admin')) ||
    fs.existsSync(path.join(root, 'apps/site/out/api'))
  )
    throw new Error('static output contains an admin/API route')
  console.log(
    '[edge-smoke] local static policy passed; set PUBLIC_SMOKE_URL and/or ADMIN_SMOKE_URL for remote verification',
  )
  process.exit(0)
}

if (publicUrl) {
  publicHost = requireUrl(publicUrl, 'PUBLIC_SMOKE_URL').hostname
  const response = await check(publicUrl, [200, 301, 308], 'public home')
  const cache = response.headers.get('cache-control') ?? ''
  if (!cache.includes('public'))
    throw new Error('public home is missing a public cache-control policy')
  if (requireCloudflare && !response.headers.get('cf-ray'))
    throw new Error('public home is not returning a Cloudflare cf-ray header')
  const html = await response.text()
  if (/admin\.publisher\.com|\/api\//i.test(html))
    throw new Error('public HTML exposes the admin origin or API')
  console.log(
    `[edge-smoke] public response ${response.status}; cache-control=${cache}`,
  )
}

if (adminUrl) {
  const adminHost = requireUrl(adminUrl, 'ADMIN_SMOKE_URL').hostname
  if (publicUrl && publicHost === adminHost)
    throw new Error('public and admin smoke hosts must be separate')
  const response = await check(
    `${adminUrl.replace(/\/$/, '')}/api/posts`,
    [401, 403],
    'unauthenticated admin API',
  )
  if ((response.headers.get('cache-control') ?? '').includes('public'))
    throw new Error('admin API must not be publicly cacheable')
  if (requireCloudflare && !response.headers.get('cf-ray'))
    throw new Error('admin API is not returning a Cloudflare cf-ray header')
  console.log(
    `[edge-smoke] unauthenticated admin API denied with ${response.status}`,
  )
}

if (commentsUrl) {
  const commentsHost = requireUrl(commentsUrl, 'COMMENTS_SMOKE_URL').hostname
  if (
    [publicHost, adminUrl && new URL(adminUrl).hostname].includes(commentsHost)
  )
    throw new Error('comment, public, and admin smoke hosts must be separate')
  const response = await check(commentsUrl, [200], 'comment thread read')
  const cache = response.headers.get('cache-control') ?? ''
  if (!cache.includes('stale-if-error'))
    throw new Error('comment thread is missing stale-if-error cache policy')
  if (requireCloudflare && !response.headers.get('cf-ray'))
    throw new Error(
      'comment service is not returning a Cloudflare cf-ray header',
    )
  console.log(`[edge-smoke] comment thread response ${response.status}`)
}

if (originUrl) {
  requireUrl(originUrl, 'ORIGIN_SMOKE_URL')
  const response = await fetch(originUrl, { redirect: 'manual' })
  if (![401, 403, 404, 410].includes(response.status))
    throw new Error(
      `static origin must deny direct access, received ${response.status}`,
    )
  console.log(`[edge-smoke] direct origin denied with ${response.status}`)
}

if (adminRateLimitUrl)
  await checkRateLimit(adminRateLimitUrl, 'admin rate limit')
if (contactRateLimitUrl)
  await checkRateLimit(contactRateLimitUrl, 'contact rate limit')
if (commentsRateLimitUrl) {
  const body = process.env.COMMENTS_RATE_LIMIT_SMOKE_BODY
  const tokens = (process.env.COMMENTS_RATE_LIMIT_SMOKE_TOKENS ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
  if (!body)
    throw new Error(
      'COMMENTS_RATE_LIMIT_SMOKE_BODY is required with COMMENTS_RATE_LIMIT_SMOKE_URL',
    )
  if (!body.includes('__VERIFICATION_TOKEN__'))
    throw new Error(
      'COMMENTS_RATE_LIMIT_SMOKE_BODY must contain __VERIFICATION_TOKEN__ because verification tokens may be single-use',
    )
  if (tokens.length < rateLimitRequests)
    throw new Error(
      `COMMENTS_RATE_LIMIT_SMOKE_TOKENS must contain at least ${rateLimitRequests} fresh tokens`,
    )
  await checkRateLimit(
    commentsRateLimitUrl,
    'comment rate limit',
    (index) => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body.replaceAll('__VERIFICATION_TOKEN__', tokens[index]),
    }),
    [202],
  )
}
if (commentsModerationUrl) {
  const response = await check(
    commentsModerationUrl,
    [401, 403],
    'unauthenticated comment moderation API',
  )
  if ((response.headers.get('cache-control') ?? '').includes('public'))
    throw new Error('comment moderation API must not be publicly cacheable')
  console.log(
    `[edge-smoke] unauthenticated comment moderation denied with ${response.status}`,
  )
}

if (process.env.REQUIRE_FULL_EDGE_SMOKE === '1') {
  requireUrl(publicUrl, 'PUBLIC_SMOKE_URL')
  requireUrl(adminUrl, 'ADMIN_SMOKE_URL')
  requireUrl(originUrl, 'ORIGIN_SMOKE_URL')
  requireUrl(adminRateLimitUrl, 'ADMIN_RATE_LIMIT_SMOKE_URL')
  requireUrl(contactRateLimitUrl, 'CONTACT_RATE_LIMIT_SMOKE_URL')
  requireUrl(commentsUrl, 'COMMENTS_SMOKE_URL')
  requireUrl(commentsRateLimitUrl, 'COMMENTS_RATE_LIMIT_SMOKE_URL')
  requireUrl(commentsModerationUrl, 'COMMENTS_MODERATION_SMOKE_URL')
}

console.log('[edge-smoke] remote edge checks passed')
