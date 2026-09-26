#!/usr/bin/env node
// RULE-003: an operator's hosting integration must leave no record in this
// repository's GitHub project (.agents/rules/repository-scope.md). The check
// fails when the repository has any Deployment or Environment, when the
// checked commit carries a commit status or check run from a hosting
// integration, or when the homepage is a hosting default host or contains a
// term from the operator's private denylist (never printed).
//
// Environment: `GITHUB_TOKEN` or `GH_TOKEN`, `GITHUB_REPOSITORY`
// (`owner/name`), optional `GITHUB_API_URL` (tests point it at a local
// server), and the commit to check — `RECORDS_SHA`, else `GITHUB_SHA`, else
// the default branch head. Missing credentials exit 2: the check never
// passes without looking. Dependency-free on purpose (no install in CI).
import { hostingHostPattern, loadDenylist } from './privacy-patterns.mjs'

const tag = '[github-records]'
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const repository = process.env.GITHUB_REPOSITORY
const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(
  /\/+$/,
  '',
)

if (!token) {
  console.error(
    `${tag} GITHUB_TOKEN or GH_TOKEN is required; refusing to pass without checking`,
  )
  process.exit(2)
}
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error(`${tag} GITHUB_REPOSITORY must be set to owner/name`)
  process.exit(2)
}

/** Hosting integrations that report deployments as statuses or checks. */
const HOSTING_INTEGRATIONS = [
  'vercel',
  'cloudflare-pages',
  'cloudflare',
  'netlify',
  'render',
  'railway',
  'fly',
]
const integrationPattern = new RegExp(
  `(?:^|[^a-z0-9])(${HOSTING_INTEGRATIONS.join('|')})(?:[^a-z0-9]|$)`,
  'i',
)
const hostingIntegration = (...labels) =>
  labels
    .filter((label) => typeof label === 'string')
    .map((label) => label.match(integrationPattern)?.[1]?.toLowerCase())
    .find(Boolean)

const denylist = loadDenylist(tag) ?? []
const failures = []
const fail = (reason) => failures.push(reason)

async function get(pathname) {
  let response
  try {
    response = await fetch(`${api}${pathname}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'publisher-github-records',
        'x-github-api-version': '2022-11-28',
      },
    })
  } catch (error) {
    return { status: 0, error: error.cause?.code ?? error.message }
  }
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  return { status: response.status, body }
}
const unverifiable = (what, result) =>
  fail(`cannot verify ${what}: ${result.status || result.error}`)

const base = `/repos/${repository}`
const repo = await get(base)
if (repo.status !== 200 || !repo.body) {
  unverifiable('repository', repo)
} else {
  const homepage = String(repo.body.homepage ?? '').trim()
  if (homepage) {
    let host = ''
    try {
      host = new URL(
        /^[a-z]+:\/\//i.test(homepage) ? homepage : `https://${homepage}`,
      ).hostname
    } catch {
      host = ''
    }
    if (host && hostingHostPattern.test(host))
      fail('repository homepage is a hosting default host')
    if (denylist.some((term) => homepage.toLowerCase().includes(term)))
      fail('repository homepage contains a denylist term')
  }
  const description = String(repo.body.description ?? '').toLowerCase()
  const topics = (repo.body.topics ?? []).join(' ').toLowerCase()
  if (denylist.some((term) => description.includes(term)))
    fail('repository description contains a denylist term')
  if (denylist.some((term) => topics.includes(term)))
    fail('repository topics contain a denylist term')
}

// Only existence matters, so one item per page is enough.
const deployments = await get(`${base}/deployments?per_page=1`)
if (deployments.status !== 200 || !Array.isArray(deployments.body))
  unverifiable('deployments', deployments)
else if (deployments.body.length > 0)
  fail('repository has GitHub Deployments; remove them and disconnect hosting')

const environments = await get(`${base}/environments?per_page=1`)
if (environments.status !== 200 || !environments.body)
  unverifiable('environments', environments)
else if (
  (environments.body.total_count ?? 0) > 0 ||
  (environments.body.environments ?? []).length > 0
)
  fail('repository has GitHub Environments; delete them')

let sha = process.env.RECORDS_SHA || process.env.GITHUB_SHA
if (!sha && repo.status === 200 && repo.body?.default_branch) {
  const head = await get(
    `${base}/commits/${encodeURIComponent(repo.body.default_branch)}`,
  )
  if (head.status === 200 && head.body?.sha) sha = head.body.sha
  else unverifiable('the default branch head', head)
}
if (sha && !/^[0-9a-f]{7,64}$/i.test(sha)) {
  fail('cannot verify commit records: the commit SHA is malformed')
  sha = undefined
}

if (sha) {
  const statuses = await get(`${base}/commits/${sha}/statuses?per_page=100`)
  if (statuses.status !== 200 || !Array.isArray(statuses.body))
    unverifiable('commit statuses', statuses)
  else
    for (const status of statuses.body) {
      const integration = hostingIntegration(status.context)
      if (integration)
        fail(`commit status from a hosting integration (${integration})`)
    }

  const checks = await get(`${base}/commits/${sha}/check-runs?per_page=100`)
  if (checks.status !== 200 || !Array.isArray(checks.body?.check_runs))
    unverifiable('check runs', checks)
  else
    for (const run of checks.body.check_runs) {
      const integration = hostingIntegration(run.app?.slug, run.name)
      if (integration)
        fail(`check run from a hosting integration (${integration})`)
    }
}

const problems = [...new Set(failures)]
if (problems.length > 0) {
  for (const reason of problems) console.error(`${tag} ${reason}`)
  console.error(
    `${tag} ${problems.length} problem(s); see .agents/rules/repository-scope.md`,
  )
  process.exit(1)
}
console.log(
  `${tag} no deployments, environments, hosting records, or private homepage`,
)
