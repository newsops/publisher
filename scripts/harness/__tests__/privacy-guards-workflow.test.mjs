import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// RULE-003 TC-06: the workflow wires the privacy guards. The root has no
// YAML parser dependency, so this reads the file's structure directly: top
// level keys, jobs at two-space indentation, steps inside each job.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const workflow = readFileSync(
  path.join(root, '.github/workflows/verify.yml'),
  'utf8',
)

/** The text of each job, keyed by name. */
function jobs() {
  const body = workflow.slice(workflow.indexOf('\njobs:\n') + 7)
  const result = {}
  for (const block of body.split(/\n(?=  [a-z][\w-]*:\n)/)) {
    const name = block.match(/^\s*([a-z][\w-]*):\n/)?.[1]
    if (name) result[name] = block
  }
  return result
}

/** The `- ...` step blocks of a job. */
const steps = (job) =>
  job.split(/\n(?=      - )/).filter((step) => step.startsWith('      - '))

describe('verify workflow privacy guards (RULE-003)', () => {
  it('parses into the expected triggers and jobs', () => {
    expect(workflow).not.toContain('\t')
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}push:\n/m)
    expect(workflow).toMatch(
      /\n {2}schedule:\n(?: {4}#.*\n)* {4}- cron: '17 3 \* \* \*'\n/,
    )
    expect(Object.keys(jobs())).toEqual([
      'repository',
      'github-records',
      'clean-room',
    ])
    expect(jobs().repository).toContain("if: github.event_name != 'schedule'")
    expect(jobs()['clean-room']).toContain(
      "if: github.event_name != 'schedule'",
    )
    expect(jobs()['github-records']).not.toContain('if: github.event_name')
  })

  it('checks out full history and loads the optional denylist secret quietly', () => {
    const repository = jobs().repository
    expect(repository).toMatch(
      /- uses: actions\/checkout@v4\n {8}with:\n(?: {10}#.*\n)* {10}fetch-depth: 0\n/,
    )
    for (const name of ['repository', 'github-records']) {
      const secretSteps = steps(jobs()[name]).filter((step) =>
        step.includes('secrets.PUBLISHER_PRIVATE_DENYLIST_TEXT'),
      )
      expect(secretSteps).toHaveLength(1)
      const [step] = secretSteps
      expect(step).toContain(
        'DENYLIST_TEXT: ${{ secrets.PUBLISHER_PRIVATE_DENYLIST_TEXT }}',
      )
      expect(step).toContain('if [ -n "$DENYLIST_TEXT" ]; then')
      expect(step).toContain('"$RUNNER_TEMP/private-denylist.txt"')
      expect(step).toContain('>> "$GITHUB_ENV"')
      expect(step).toContain('PUBLISHER_PRIVATE_DENYLIST=')
      expect(step).not.toMatch(/\becho\b/)
      expect(step).not.toMatch(/run:.*\$\{\{\s*secrets\./)
    }
    const order = steps(repository).map((step) => step.split('\n')[0])
    expect(
      order.findIndex((line) => line.includes('Private denylist')),
    ).toBeLessThan(order.findIndex((line) => line.includes('harness:scan')))
  })

  it('scans the pull-request title, body, and commit range', () => {
    const [step] = steps(jobs().repository).filter((candidate) =>
      candidate.includes('--text-env PR_TITLE'),
    )
    expect(step).toBeDefined()
    expect(step).toContain("if: github.event_name == 'pull_request'")
    expect(step).toContain('PR_TITLE: ${{ github.event.pull_request.title }}')
    expect(step).toContain('PR_BODY: ${{ github.event.pull_request.body }}')
    expect(step).toContain(
      'node scripts/harness/scan-repository-privacy.mjs --text-env PR_TITLE --text-env PR_BODY --commit-range "origin/$BASE_REF..HEAD"',
    )
    // Untrusted text reaches the shell only through the environment.
    expect(step).not.toMatch(/run:.*\$\{\{/)
  })

  it('runs the GitHub-records check with read-only permissions', () => {
    const job = jobs()['github-records']
    const permissions = job.match(/\n {4}permissions:\n((?: {6}.*\n)+)/)?.[1]
    expect(permissions).toBeDefined()
    const entries = Object.fromEntries(
      permissions
        .trim()
        .split('\n')
        .map((line) => line.trim().split(/:\s*/)),
    )
    expect(entries).toEqual({
      contents: 'read',
      deployments: 'read',
      statuses: 'read',
      checks: 'read',
      actions: 'read',
    })
    expect(job).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
    expect(job).toContain('run: node scripts/harness/check-github-records.mjs')
    expect(job).not.toContain('pnpm install')
  })

  it('installs executable hooks that call the text modes', () => {
    const commitMessage = path.join(root, '.husky/commit-msg')
    expect(statSync(commitMessage).mode & 0o111).not.toBe(0)
    expect(readFileSync(commitMessage, 'utf8')).toContain(
      'node scripts/harness/scan-repository-privacy.mjs --message-file "$1"',
    )
    const prePush = readFileSync(path.join(root, '.husky/pre-push'), 'utf8')
    expect(prePush.startsWith('#!/usr/bin/env sh\n')).toBe(true)
    expect(prePush).toContain('--commit-range "$remote_sha..$local_sha"')
    expect(prePush).toContain('--unpushed "$local_sha"')
    expect(prePush.indexOf('--unpushed')).toBeLessThan(
      prePush.indexOf('pnpm typecheck'),
    )
  })
})
