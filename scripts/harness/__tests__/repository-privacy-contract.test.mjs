import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// RULE-002: the repository holds the program, never an operation. Violating
// samples are assembled at runtime so this file itself stays clean under the
// scan it tests.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const scan = path.join(root, 'scripts/harness/scan-repository-privacy.mjs')
const directories = []
const syntheticTerm = 'zz-private-site'
const homePath = ['', 'Users', 'alice', 'code', 'publisher'].join('/')
const personalMail = ['someone', 'gmail.com'].join('@')
const hostingHost = ['my-admin', 'vercel', 'app'].join('.')

async function tree(files) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'privacy-scan-'))
  directories.push(directory)
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(directory, relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text, 'utf8')
  }
  return directory
}

async function denylist(terms) {
  const directory = await tree({
    'private-denylist.txt': `# operator terms\n${terms.join('\n')}\n`,
  })
  return path.join(directory, 'private-denylist.txt')
}

function runScan(scanRoot, denylistPath) {
  const env = { ...process.env, HOME: path.join(scanRoot, 'no-home') }
  delete env.PUBLISHER_PRIVATE_DENYLIST
  if (denylistPath) env.PUBLISHER_PRIVATE_DENYLIST = denylistPath
  return spawnSync(process.execPath, [scan, '--root', scanRoot], {
    cwd: root,
    encoding: 'utf8',
    env,
  })
}

const placeholders = {
  'README.md': [
    '# Example News',
    'Public site: https://news.example.com, admin: https://admin.example.com.',
    'Second site `second-site` at second.example.com, author `example-desk`.',
    'Install with `/plugin marketplace add newsops/publisher`.',
    'Preview hosts look like `example-project.vercel.app` or',
    '`your-project.pages.dev`; any `*.workers.dev` host is an operator detail.',
    'Paths: `/Users/<user>/publisher`, `/home/runner/work`, `~/publisher`.',
    'Contact: security@example.com.',
  ].join('\n'),
  'docs/guide.md': 'Run `publisher post list --site default --json`.\n',
}

describe('repository privacy scan (RULE-002)', () => {
  afterAll(async () => {
    for (const directory of directories)
      await rm(directory, { recursive: true, force: true })
  })

  it('passes on placeholders and the program organisation', async () => {
    const scanRoot = await tree(placeholders)
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(
      '[repository-privacy] 2 tracked files clean',
    )
  })

  it('fails on a local home path', async () => {
    const scanRoot = await tree({
      ...placeholders,
      'notes.md': `Evidence:\nsee ${homePath}/log.txt\n`,
    })
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[repository-privacy] notes.md:2: home path',
    )
  })

  it('fails on a personal mail address', async () => {
    const scanRoot = await tree({
      ...placeholders,
      'src/contact.ts': `export const owner = '${personalMail}'\n`,
    })
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[repository-privacy] src/contact.ts:1: personal mail',
    )
  })

  it('fails on a hosting default hostname', async () => {
    const scanRoot = await tree({
      ...placeholders,
      'spec.md': `Deployed to https://${hostingHost}/ today.\n`,
    })
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[repository-privacy] spec.md:1: hosting host',
    )
  })

  it('fails on a denylist term without printing it', async () => {
    const scanRoot = await tree({
      ...placeholders,
      'docs/ops.md': 'intro\n\nWe run ZZ-Private-Site in production.\n',
      [`specs/${syntheticTerm}-activation.md`]: 'clean body\n',
    })
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[repository-privacy] docs/ops.md:3: denylist term',
    )
    expect(result.stderr).toContain('denylist term in path')
    expect(result.stderr.toLowerCase()).not.toContain(syntheticTerm)
    expect(result.stdout.toLowerCase()).not.toContain(syntheticTerm)
  })

  it('finds a denylist term wrapped across two lines', async () => {
    const wrappedTerm = 'zz private desk'
    const scanRoot = await tree({
      ...placeholders,
      'docs/wrapped.md': 'The ZZ Private\n  Desk runs daily.\n',
      'src/note.ts': '// owned by zz private\n// desk operators\n',
    })
    const result = runScan(scanRoot, await denylist([wrappedTerm]))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'docs/wrapped.md:1: denylist term (wrapped)',
    )
    expect(result.stderr).toContain('src/note.ts:1: denylist term (wrapped)')
    expect(result.stderr.toLowerCase()).not.toContain(wrappedTerm)
  })

  it('runs the generic checks when no denylist exists', async () => {
    const clean = await tree(placeholders)
    const cleanResult = runScan(clean)
    expect(cleanResult.status).toBe(0)
    expect(cleanResult.stdout).toContain(
      '[repository-privacy] no private denylist; generic checks only',
    )

    const leaking = await tree({ ...placeholders, 'notes.md': homePath })
    const leakingResult = runScan(leaking)
    expect(leakingResult.status).toBe(1)
    expect(leakingResult.stderr).toContain('notes.md:1: home path')
  })

  it('skips binaries, the lockfile, and generated bundles', async () => {
    const scanRoot = await tree({
      ...placeholders,
      'pnpm-lock.yaml': `${homePath}\n`,
      'apps/site/public/data/feed.json': `"${hostingHost}"\n`,
      'packages/claude-plugin/bin/publisher': `${personalMail}\n`,
      'docs/assets/program/logo.png': `${homePath}\n`,
      'assets/font.woff2': `${homePath}\n`,
    })
    const result = runScan(scanRoot, await denylist([syntheticTerm]))
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('rejects a raster image or PDF outside the allowlist (RULE-003)', async () => {
    const outside = await tree({
      ...placeholders,
      'docs/evidence/production.png': 'not really an image\n',
      'specs/release-notes.pdf': 'not really a pdf\n',
    })
    const outsideResult = runScan(outside, await denylist([syntheticTerm]))
    expect(outsideResult.status).toBe(1)
    expect(outsideResult.stderr).toContain(
      '[repository-privacy] docs/evidence/production.png: binary outside allowlist',
    )
    expect(outsideResult.stderr).toContain(
      'specs/release-notes.pdf: binary outside allowlist',
    )

    const inside = await tree({
      ...placeholders,
      'apps/site/public/images/placeholder.webp': 'image\n',
      'packages/content/src/data/media/example.jpg': 'image\n',
      'docs/assets/program/diagram.png': 'image\n',
      'scripts/harness/__fixtures__/sample.pdf': 'pdf\n',
    })
    const insideResult = runScan(inside, await denylist([syntheticTerm]))
    expect(insideResult.stderr).toBe('')
    expect(insideResult.status).toBe(0)
  })
})

// RULE-003: commit messages, pull-request text, and pushed commits pass the
// same checks as tracked files.
const gitIdentity = [
  '-c',
  'user.name=Example Author',
  '-c',
  'user.email=author@example.com',
  '-c',
  'commit.gpgsign=false',
]

/** Environment for Git and hooks: no hook variables, no user config. */
function isolatedEnv(home, extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith('GIT_') && name !== 'PUBLISHER_PRIVATE_DENYLIST',
    ),
  )
  return {
    ...env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(home, 'no-gitconfig'),
    ...extra,
  }
}

function git(cwd, args, env) {
  const result = spawnSync('git', [...gitIdentity, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  })
  return result
}

function mustGit(cwd, args, env) {
  const result = git(cwd, args, env)
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

async function repository() {
  const directory = await tree({ 'README.md': '# Example News\n' })
  const env = isolatedEnv(path.join(directory, 'no-home'))
  mustGit(directory, ['init', '-q', '-b', 'main'], env)
  mustGit(directory, ['add', '.'], env)
  mustGit(directory, ['commit', '-q', '-m', 'docs: base'], env)
  return { directory, env }
}

function runText(args, { denylistPath, cwd = root, extraEnv = {} } = {}) {
  const env = isolatedEnv(path.join(cwd, 'no-home'), extraEnv)
  if (denylistPath) env.PUBLISHER_PRIVATE_DENYLIST = denylistPath
  return spawnSync(process.execPath, [scan, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  })
}

describe('repository privacy text modes (RULE-003)', () => {
  it('rejects a commit message file and ignores Git comments', async () => {
    const list = await denylist([syntheticTerm])
    const directory = await tree({
      'leaking.txt': `feat: launch ZZ-Private-Site desk\n\nBody.\n# ${syntheticTerm} in a comment\n`,
      'mail.txt': `fix: reply to ${personalMail}\n`,
      'clean.txt': [
        'feat: add a feed option',
        '',
        `# Please enter the commit message; ${syntheticTerm} here is a comment`,
        'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
        'Co-authored-by: Example <12345+example@users.noreply.github.com>',
        '',
      ].join('\n'),
      'verbose.txt': [
        'fix: tidy',
        '# ------------------------ >8 ------------------------',
        `+ diff line with ${syntheticTerm}`,
        '',
      ].join('\n'),
    })
    const leaking = runText(
      ['--message-file', path.join(directory, 'leaking.txt')],
      { denylistPath: list },
    )
    expect(leaking.status).toBe(1)
    expect(leaking.stderr).toContain(
      '[repository-privacy] commit message:1: denylist term',
    )
    expect(leaking.stderr).not.toContain('commit message:4')
    expect(`${leaking.stdout}${leaking.stderr}`.toLowerCase()).not.toContain(
      syntheticTerm,
    )

    const mail = runText(['--message-file', path.join(directory, 'mail.txt')], {
      denylistPath: list,
    })
    expect(mail.status).toBe(1)
    expect(mail.stderr).toContain('commit message:1: personal mail')

    for (const name of ['clean.txt', 'verbose.txt']) {
      const clean = runText(['--message-file', path.join(directory, name)], {
        denylistPath: list,
      })
      expect(clean.stderr).toBe('')
      expect(clean.status).toBe(0)
      expect(clean.stdout).toContain('1 text source(s) clean')
    }
  })

  it('rejects commit messages in a range and unpushed commits', async () => {
    const list = await denylist([syntheticTerm])
    const { directory, env } = await repository()
    const base = mustGit(directory, ['rev-parse', 'HEAD'], env)
    mustGit(
      directory,
      ['commit', '-q', '--allow-empty', '-m', 'feat: clean'],
      env,
    )
    const clean = mustGit(directory, ['rev-parse', 'HEAD'], env)
    mustGit(
      directory,
      ['commit', '-q', '--allow-empty', '-m', `ops: deploy ${syntheticTerm}`],
      env,
    )
    const leaking = mustGit(directory, ['rev-parse', 'HEAD'], env)

    const cleanRange = runText(
      ['--root', directory, '--commit-range', `${base}..${clean}`],
      { denylistPath: list },
    )
    expect(cleanRange.stderr).toBe('')
    expect(cleanRange.status).toBe(0)
    expect(cleanRange.stdout).toContain('1 text source(s) clean')

    const range = runText(
      ['--root', directory, '--commit-range', `${base}..HEAD`],
      { denylistPath: list },
    )
    expect(range.status).toBe(1)
    expect(range.stderr).toContain(
      `[repository-privacy] commit ${leaking.slice(0, 7)}: denylist term`,
    )
    expect(range.stderr).not.toContain(clean.slice(0, 7))
    expect(range.stderr.toLowerCase()).not.toContain(syntheticTerm)

    const unpushed = runText(['--root', directory, '--unpushed', 'HEAD'], {
      denylistPath: list,
    })
    expect(unpushed.status).toBe(1)
    expect(unpushed.stderr).toContain(`commit ${leaking.slice(0, 7)}`)

    const option = runText(['--root', directory, '--commit-range', '--all'], {
      denylistPath: list,
    })
    expect(option.status).toBe(2)
  })

  it('rejects pull-request text passed through the environment', async () => {
    const list = await denylist([syntheticTerm])
    const leaking = runText(
      ['--text-env', 'PR_TITLE', '--text-env', 'PR_BODY'],
      {
        denylistPath: list,
        extraEnv: {
          PR_TITLE: 'feat: add feed filters',
          PR_BODY: `Verified on https://${hostingHost}/ for ZZ-PRIVATE-SITE.`,
        },
      },
    )
    expect(leaking.status).toBe(1)
    expect(leaking.stderr).toContain(
      '[repository-privacy] PR_BODY: hosting host',
    )
    expect(leaking.stderr).toContain(
      '[repository-privacy] PR_BODY: denylist term',
    )
    expect(leaking.stderr).not.toContain('PR_TITLE')
    expect(leaking.stderr.toLowerCase()).not.toContain(syntheticTerm)

    const clean = runText(['--text-env', 'PR_TITLE', '--text-env', 'PR_BODY'], {
      denylistPath: list,
      extraEnv: {
        PR_TITLE: 'feat: add feed filters',
        PR_BODY:
          'Verified on an operated instance; evidence kept privately by the operator.',
      },
    })
    expect(clean.stderr).toBe('')
    expect(clean.status).toBe(0)
    expect(clean.stdout).toContain('2 text source(s) clean')
  })
})

describe('Git hooks run the text modes (RULE-003)', () => {
  /** A repository with this checkout's hooks and scan, and stub gates. */
  async function hookedRepository() {
    const { directory, env } = await repository()
    for (const relative of [
      '.husky/commit-msg',
      '.husky/pre-push',
      'scripts/harness/scan-repository-privacy.mjs',
      'scripts/harness/privacy-patterns.mjs',
      'scripts/harness/layer-common.mjs',
    ]) {
      await mkdir(path.dirname(path.join(directory, relative)), {
        recursive: true,
      })
      await copyFile(path.join(root, relative), path.join(directory, relative))
    }
    await writeFile(
      path.join(directory, 'scripts/check-secrets.sh'),
      'exit 0\n',
    )
    // The workspace gates are covered elsewhere; a stub keeps this test to
    // the message checks the hook adds before them.
    const bin = path.join(directory, 'stub-bin')
    await mkdir(bin)
    await writeFile(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n')
    await chmod(path.join(bin, 'pnpm'), 0o755)
    const remote = `${directory}-remote.git`
    directories.push(remote)
    mustGit(directory, ['init', '-q', '--bare', remote], env)
    mustGit(directory, ['remote', 'add', 'origin', remote], env)
    mustGit(directory, ['config', 'core.hooksPath', '.husky'], env)
    const hookEnv = {
      ...env,
      PATH: [bin, path.dirname(process.execPath), process.env.PATH].join(
        path.delimiter,
      ),
      PUBLISHER_PRIVATE_DENYLIST: await denylist([syntheticTerm]),
    }
    return { directory, env: hookEnv }
  }

  it('commit-msg blocks a denylist term and accepts a clean message', async () => {
    const { directory, env } = await hookedRepository()
    const blocked = git(
      directory,
      ['commit', '--allow-empty', '-m', `feat: launch ${syntheticTerm}`],
      env,
    )
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain('commit message:1: denylist term')
    expect(blocked.stderr.toLowerCase()).not.toContain(syntheticTerm)

    const accepted = git(
      directory,
      ['commit', '--allow-empty', '-m', 'feat: add a feed option'],
      env,
    )
    expect(accepted.stderr).not.toContain('violation')
    expect(accepted.status).toBe(0)
  })

  it('pre-push checks the messages of the commits being pushed', async () => {
    const { directory, env } = await hookedRepository()
    const first = git(directory, ['push', '-q', 'origin', 'main'], env)
    expect(first.stderr).not.toContain('violation')
    expect(first.status).toBe(0)

    mustGit(
      directory,
      [
        'commit',
        '-q',
        '--no-verify',
        '--allow-empty',
        '-m',
        `ops: ${syntheticTerm}`,
      ],
      env,
    )
    const range = git(directory, ['push', '-q', 'origin', 'main'], env)
    expect(range.status).not.toBe(0)
    expect(range.stderr).toContain('denylist term')
    expect(range.stderr.toLowerCase()).not.toContain(syntheticTerm)

    const branch = git(directory, ['push', '-q', 'origin', 'main:feature'], env)
    expect(branch.status).not.toBe(0)
    expect(branch.stderr).toContain('denylist term')
  })
})
