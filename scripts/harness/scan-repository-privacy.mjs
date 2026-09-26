#!/usr/bin/env node
// RULE-002: this repository holds the Publisher program, never an operation.
// Tracked text must not carry local home paths, personal mail addresses,
// hosting default hostnames, or any term from the operator's private
// denylist — a file outside the repository (`PUBLISHER_PRIVATE_DENYLIST`, or
// `~/.config/publisher/private-denylist.txt`), one case-insensitive term per
// line. Denylist terms are never printed: output is redacted so CI logs and
// agent transcripts stay clean. Tracked raster images and PDFs are allowed
// only under `ALLOWED_BINARY_PATHS`. `--root <dir>` evaluates another tree
// (tests); without Git the scan walks the filesystem instead.
//
// RULE-003 text modes scan text instead of the tree (any combination):
//   --message-file <path>   one commit message; `#` comment lines ignored
//   --commit-range <a..b>   the messages of the commits in a revision range
//   --unpushed <sha>        the messages of `<sha>` not on any remote
//   --text-env <NAME>       an environment variable (pull-request title/body)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { root as repositoryRoot } from './layer-common.mjs'
import {
  genericChecks,
  gitFreeEnv,
  loadDenylist,
  redactor,
} from './privacy-patterns.mjs'

const tag = '[repository-privacy]'

/** Tracked raster images and PDFs are allowed only under these prefixes. */
export const ALLOWED_BINARY_PATHS = [
  'apps/site/public/',
  'packages/content/src/data/media/',
  'docs/assets/program/',
  'scripts/harness/__fixtures__/',
]
const imageExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.pdf',
])

const valueFlags = new Set([
  '--root',
  '--message-file',
  '--commit-range',
  '--unpushed',
  '--text-env',
])
const options = {
  root: undefined,
  messageFiles: [],
  commitRanges: [],
  unpushed: [],
  textEnv: [],
}
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 1) {
  const flag = argv[index]
  const value = argv[index + 1]
  if (!valueFlags.has(flag)) {
    console.error(`${tag} unknown argument ${flag}`)
    process.exit(2)
  }
  if (value === undefined || value.startsWith('-')) {
    console.error(`${tag} ${flag} requires a value`)
    process.exit(2)
  }
  index += 1
  if (flag === '--root') options.root = value
  else if (flag === '--message-file') options.messageFiles.push(value)
  else if (flag === '--commit-range') options.commitRanges.push(value)
  else if (flag === '--unpushed') options.unpushed.push(value)
  else options.textEnv.push(value)
}
const root = options.root ? path.resolve(options.root) : repositoryRoot
const textMode =
  options.messageFiles.length +
    options.commitRanges.length +
    options.unpushed.length +
    options.textEnv.length >
  0

const walkSkip = new Set(['node_modules', '.git', '.next', 'out', 'dist'])
const binaryExtensions = new Set([
  ...imageExtensions,
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tgz',
  '.mp3',
  '.mp4',
  '.webm',
  '.mov',
  '.wasm',
])
const skippedFiles = new Set(['pnpm-lock.yaml'])
const skippedPrefixes = [
  'packages/claude-plugin/bin/',
  'apps/site/public/',
  'apps/site/out/',
]

const denylist = loadDenylist(tag)
if (!denylist) console.log(`${tag} no private denylist; generic checks only`)
const redact = redactor(denylist)

// Leading indentation and comment/quote/list markers of a continuation line.
const wrapPrefix = /^\s*(?:\/\/+|#+|\*+|>+|-\s)?\s*/

/** Violations in `lines`; `at(index)` labels a line in the report. */
function scanLines(lines, at) {
  const found = []
  const lowered = lines.map((line) => line.toLowerCase())
  lines.forEach((line, index) => {
    for (const { kind, pattern, allowed } of genericChecks)
      for (const match of line.matchAll(pattern))
        if (!allowed(match)) found.push(`${at(index)}: ${kind} (${match[0]})`)
    if (!denylist) return
    const lower = lowered[index]
    // A term wrapped across two lines (prose reflow, comments) still counts.
    const next = (lowered[index + 1] ?? '').replace(wrapPrefix, '')
    const joined = `${lower.trimEnd()} ${next}`
    if (denylist.some((term) => lower.includes(term)))
      found.push(`${at(index)}: denylist term`)
    else if (
      denylist.some((term) => joined.includes(term) && !next.includes(term))
    )
      found.push(`${at(index)}: denylist term (wrapped)`)
  })
  return found
}

// Trailers that name no person: the agent co-author line and GitHub's
// noreply addresses are not personal mail.
const agentTrailer = /^\s*co-authored-by:[^<]*<noreply@anthropic\.com>\s*$/i
const githubNoreply = /[\w.+-]+@users\.noreply\.github\.com/gi
const withoutAllowedTrailers = (lines) =>
  lines.map((line) =>
    agentTrailer.test(line) ? '' : line.replace(githubNoreply, '<noreply>'),
  )

/** Scans free text; every line is reported under the same `label`. */
function scanText(label, text) {
  const lines = withoutAllowedTrailers(text.split(/\r?\n/))
  return [...new Set(scanLines(lines, () => label))]
}

/** `[sha, message]` pairs for `git log <revisions>` in `root`. */
function commitMessages(revisions) {
  const result = spawnSync(
    'git',
    ['-C', root, 'log', '--format=%H%x00%B%x00', ...revisions],
    { encoding: 'utf8', env: gitFreeEnv(), maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    console.error(
      `${tag} git log ${redact(revisions.join(' '))} failed: ${redact(result.stderr.trim())}`,
    )
    process.exit(2)
  }
  const parts = result.stdout.split('\0')
  const commits = []
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const sha = parts[index].trim()
    if (sha) commits.push([sha, parts[index + 1]])
  }
  return commits
}

function scanTextSources() {
  const violations = []
  let sources = 0
  for (const file of options.messageFiles) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      console.error(`${tag} cannot read the message file`)
      process.exit(2)
    }
    // Git comment lines are not part of the message; everything after the
    // scissors line of `commit --verbose` is the diff, not the message.
    const lines = text.split(/\r?\n/)
    const scissors = lines.findIndex((line) => /^. -{24} >8 -{24}$/.test(line))
    const message = (scissors >= 0 ? lines.slice(0, scissors) : lines).map(
      (line) => (line.startsWith('#') ? '' : line),
    )
    sources += 1
    violations.push(
      ...scanLines(
        withoutAllowedTrailers(message),
        (index) => `commit message:${index + 1}`,
      ),
    )
  }
  const revisionSets = [
    ...options.commitRanges.map((range) => [range]),
    ...options.unpushed.map((sha) => [sha, '--not', '--remotes']),
  ]
  for (const revisions of revisionSets)
    for (const [sha, message] of commitMessages(revisions)) {
      sources += 1
      violations.push(...scanText(`commit ${sha.slice(0, 7)}`, message))
    }
  for (const name of options.textEnv) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      console.error(`${tag} --text-env requires a variable name`)
      process.exit(2)
    }
    sources += 1
    violations.push(...scanText(name, process.env[name] ?? ''))
  }
  return { violations, summary: `${sources} text source(s) clean` }
}

/** Repository-relative paths of tracked files, or of a walk without Git. */
function listFiles() {
  // Git hooks export GIT_DIR and friends, which would make `git -C <root>`
  // read the hook's repository instead of <root>; strip them, and use Git
  // only when <root> is itself the top of a work tree.
  const env = gitFreeEnv()
  const run = (args) =>
    spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env,
      maxBuffer: 64 * 1024 * 1024,
    })
  const top = run(['rev-parse', '--show-toplevel'])
  const isWorkTree =
    top.status === 0 &&
    fs.realpathSync(top.stdout.trim()) === fs.realpathSync(root)
  const git = isWorkTree ? run(['ls-files', '-z']) : undefined
  if (git?.status === 0) return git.stdout.split('\0').filter(Boolean)
  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!walkSkip.has(entry.name)) walk(full)
      } else if (entry.isFile())
        files.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  walk(root)
  return files
}

function skipped(relative) {
  return (
    skippedFiles.has(path.posix.basename(relative)) ||
    skippedPrefixes.some((prefix) => relative.startsWith(prefix)) ||
    binaryExtensions.has(path.posix.extname(relative).toLowerCase())
  )
}

function scanTree() {
  const violations = []
  let scanned = 0
  for (const relative of listFiles()) {
    const shown = redact(relative)
    if (denylist?.some((term) => relative.toLowerCase().includes(term)))
      violations.push(`${shown}: denylist term in path`)
    // A screenshot or exported document can carry an operation visually;
    // only program assets and fixtures may be tracked.
    if (
      imageExtensions.has(path.posix.extname(relative).toLowerCase()) &&
      !ALLOWED_BINARY_PATHS.some((prefix) => relative.startsWith(prefix))
    )
      violations.push(`${shown}: binary outside allowlist`)
    if (skipped(relative)) continue
    const full = path.join(root, relative)
    let stat
    try {
      stat = fs.lstatSync(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const buffer = fs.readFileSync(full)
    if (buffer.subarray(0, 8000).includes(0)) continue
    scanned += 1
    violations.push(
      ...scanLines(
        buffer.toString('utf8').split('\n'),
        (index) => `${shown}:${index + 1}`,
      ),
    )
  }
  return { violations, summary: `${scanned} tracked files clean` }
}

const { violations, summary } = textMode ? scanTextSources() : scanTree()
if (violations.length > 0) {
  for (const violation of violations)
    console.error(`${tag} ${redact(violation)}`)
  console.error(
    `${tag} ${violations.length} violation(s); see .agents/rules/repository-scope.md`,
  )
  process.exit(1)
}
console.log(`${tag} ${summary}`)
