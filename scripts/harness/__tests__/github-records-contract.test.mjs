import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// RULE-003: the GitHub-records check runs against a local recording server;
// it never calls github.com from a test. Hosting hosts are assembled at
// runtime so this file stays clean under the privacy scan.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const check = path.join(root, 'scripts/harness/check-github-records.mjs')
const repository = 'example-org/publisher'
const sha = 'a'.repeat(40)
const syntheticTerm = 'zz-private-site'
const hostingHomepage = `https://${['example-app', 'vercel', 'app'].join('.')}`

/** A clean record set; each test overrides one endpoint. */
function records(overrides = {}) {
  return {
    [`/repos/${repository}`]: {
      default_branch: 'main',
      homepage: 'https://github.com/example-org/publisher',
      description: 'Publisher, a static-first news publication program',
      topics: ['news', 'static-site'],
    },
    [`/repos/${repository}/deployments?per_page=1`]: [],
    [`/repos/${repository}/environments?per_page=1`]: {
      total_count: 0,
      environments: [],
    },
    [`/repos/${repository}/commits/main`]: { sha },
    [`/repos/${repository}/commits/${sha}/statuses?per_page=100`]: [
      { context: 'ci/verify', state: 'success' },
    ],
    [`/repos/${repository}/commits/${sha}/check-runs?per_page=100`]: {
      total_count: 1,
      check_runs: [{ name: 'repository', app: { slug: 'github-actions' } }],
    },
    ...overrides,
  }
}

let server
let baseUrl
let responses = {}
const requests = []
let temporary

beforeAll(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'github-records-'))
  server = http.createServer((request, response) => {
    requests.push({
      url: request.url,
      host: request.headers.host,
      authorization: request.headers.authorization,
    })
    const entry = responses[request.url]
    const [status, body] =
      entry && typeof entry === 'object' && 'status' in entry
        ? [entry.status, entry.body ?? { message: 'error' }]
        : entry === undefined
          ? [404, { message: 'Not Found' }]
          : [200, entry]
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
})

/** Runs the check asynchronously so the in-process server can answer. */
function runCheck(recordSet, extraEnv = {}) {
  responses = recordSet
  requests.length = 0
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith('GITHUB_') &&
        !['GH_TOKEN', 'RECORDS_SHA', 'PUBLISHER_PRIVATE_DENYLIST'].includes(
          name,
        ),
    ),
  )
  Object.assign(
    env,
    {
      HOME: path.join(temporary, 'no-home'),
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: repository,
      GITHUB_API_URL: baseUrl,
    },
    extraEnv,
  )
  for (const [name, value] of Object.entries(env))
    if (value === undefined) delete env[name]
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [check], { cwd: root, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

function expectOnlyLocalRequests() {
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    expect(`http://${request.host}`).toBe(baseUrl)
    expect(request.authorization).toBe('Bearer test-token')
  }
}

describe('GitHub records check (RULE-003)', () => {
  it('passes on an empty record set, asking only the local server', async () => {
    const result = await runCheck(records())
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('[github-records] no deployments')
    expectOnlyLocalRequests()
    expect(requests.map((request) => request.url).sort()).toEqual(
      Object.keys(records()).sort(),
    )
  })

  it('fails on a Deployment', async () => {
    const result = await runCheck(
      records({
        [`/repos/${repository}/deployments?per_page=1`]: [
          { id: 1, environment: 'Production' },
        ],
      }),
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[github-records] repository has GitHub Deployments',
    )
    expectOnlyLocalRequests()
  })

  it('fails on an Environment, and when environments cannot be read', async () => {
    const present = await runCheck(
      records({
        [`/repos/${repository}/environments?per_page=1`]: {
          total_count: 1,
          environments: [{ name: 'Preview' }],
        },
      }),
    )
    expect(present.status).toBe(1)
    expect(present.stderr).toContain(
      '[github-records] repository has GitHub Environments',
    )

    const forbidden = await runCheck(
      records({
        [`/repos/${repository}/environments?per_page=1`]: { status: 403 },
      }),
    )
    expect(forbidden.status).toBe(1)
    expect(forbidden.stderr).toContain(
      '[github-records] cannot verify environments: 403',
    )
  })

  it('fails on a hosting commit status', async () => {
    const result = await runCheck(
      records({
        [`/repos/${repository}/commits/${sha}/statuses?per_page=100`]: [
          { context: 'ci/verify', state: 'success' },
          { context: 'Vercel – example-project', state: 'success' },
        ],
      }),
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[github-records] commit status from a hosting integration (vercel)',
    )
    expect(result.stderr).not.toContain('example-project')
  })

  it('fails on a hosting check run', async () => {
    const result = await runCheck(
      records({
        [`/repos/${repository}/commits/${sha}/check-runs?per_page=100`]: {
          total_count: 2,
          check_runs: [
            { name: 'repository', app: { slug: 'github-actions' } },
            { name: 'Pages deploy', app: { slug: 'cloudflare-pages' } },
          ],
        },
      }),
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[github-records] check run from a hosting integration (cloudflare-pages)',
    )
  })

  it('fails on a hosting or private homepage without printing it', async () => {
    const hosting = await runCheck(
      records({
        [`/repos/${repository}`]: {
          default_branch: 'main',
          homepage: hostingHomepage,
        },
      }),
    )
    expect(hosting.status).toBe(1)
    expect(hosting.stderr).toContain(
      '[github-records] repository homepage is a hosting default host',
    )
    expect(hosting.stderr).not.toContain(hostingHomepage)

    const list = path.join(temporary, 'private-denylist.txt')
    await writeFile(list, `# operator terms\n${syntheticTerm}\n`)
    const privateHomepage = await runCheck(
      records({
        [`/repos/${repository}`]: {
          default_branch: 'main',
          homepage: `https://${syntheticTerm}.example.com`,
        },
      }),
      { PUBLISHER_PRIVATE_DENYLIST: list },
    )
    expect(privateHomepage.status).toBe(1)
    expect(privateHomepage.stderr).toContain(
      '[github-records] repository homepage contains a denylist term',
    )
    expect(
      `${privateHomepage.stdout}${privateHomepage.stderr}`.toLowerCase(),
    ).not.toContain(syntheticTerm)
  })

  it('checks the given commit instead of the default branch head', async () => {
    const other = 'b'.repeat(40)
    const result = await runCheck(
      records({
        [`/repos/${repository}/commits/${other}/statuses?per_page=100`]: [
          { context: 'netlify/example/deploy-preview', state: 'success' },
        ],
        [`/repos/${repository}/commits/${other}/check-runs?per_page=100`]: {
          total_count: 0,
          check_runs: [],
        },
      }),
      { RECORDS_SHA: other },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('hosting integration (netlify)')
    expect(requests.map((request) => request.url)).not.toContain(
      `/repos/${repository}/commits/main`,
    )
  })

  it('exits 2 without a token or repository instead of passing', async () => {
    const noToken = await runCheck(records(), { GITHUB_TOKEN: undefined })
    expect(noToken.status).toBe(2)
    expect(noToken.stderr).toContain(
      '[github-records] GITHUB_TOKEN or GH_TOKEN is required',
    )
    expect(requests).toHaveLength(0)

    const noRepository = await runCheck(records(), {
      GITHUB_REPOSITORY: undefined,
    })
    expect(noRepository.status).toBe(2)
    expect(requests).toHaveLength(0)
  })
})
