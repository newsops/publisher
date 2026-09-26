# Claude Code desk plugin (PLUG-001)

- **Status**: completed
- **Created**: 2026-09-20
- **Scope**: packages/claude-plugin, .claude-plugin, scripts/harness, docs

## Objective

Ship `packages/claude-plugin` — an installable Claude Code plugin whose
commands and skills drive the editorial desk through the bundled `publisher`
CLI — plus the marketplace manifest and the harness gates that keep the
bundle and the command references current. Spec:
`.agents/spec-docs/done/PLUG-001-claude-desk-plugin.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `git clone`-installable plugin (`/plugin marketplace add newsops/publisher` → `/plugin install publisher@publisher`) that runs setup, status, draft, desk, and publish through one bundled, dependency-free CLI.

**Architecture:** The plugin is a thin L5 operator over the existing CLI: `scripts/build.mjs` bundles `packages/ops-cli/bin/publisher.mjs` with esbuild into `bin/publisher` (Claude Code adds `bin/` to the Bash PATH), a `SessionStart` hook bridges `userConfig` into `$CLAUDE_ENV_FILE`, commands sequence CLI calls, skills hold the editorial rules, and `scan-plugin-contract.mjs` fails when the bundle or the command references drift.

**Tech Stack:** Node 22 ESM, esbuild (already a workspace devDependency in `apps/comments`), vitest, POSIX sh for the hook, Claude Code plugin manifest v1.

Conventions for every task: run commands from the repository root with
`export PATH="$HOME/.volta/tools/image/node/22.23.2/bin:$HOME/.volta/tools/image/packages/pnpm/bin:$PATH"`;
format with `node node_modules/prettier/bin/prettier.cjs --write <files>` before
committing; commit with `git -c core.hooksPath=/dev/null commit` and end every
message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Plan

### Task 1: Package scaffold, manifest, bundle build script

**Files:**

- Create: `packages/claude-plugin/package.json`
- Create: `packages/claude-plugin/.claude-plugin/plugin.json`
- Create: `packages/claude-plugin/scripts/tsx-stub.mjs`
- Create: `packages/claude-plugin/scripts/content-stub.mjs`
- Create: `packages/claude-plugin/scripts/build.mjs`
- Create: `packages/claude-plugin/skills/publisher-cli/SKILL.md` (markers only; Task 2 fills the prose)
- Create: `.claude-plugin/marketplace.json`
- Modify: `package.json` (root) `build` script
- Modify: `.prettierignore` (generated files)

- [x] **Step 1: Create the package manifest**

`packages/claude-plugin/package.json`:

```json
{
  "name": "@publisher/claude-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Claude Code plugin that runs the Publisher editorial desk through the bundled publisher CLI",
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "node --check scripts/build.mjs && node --check bin/publisher",
    "test": "vitest run"
  },
  "devDependencies": {
    "esbuild": "^0.28.2",
    "vitest": "^4.0.0"
  }
}
```

- [x] **Step 2: Create the plugin manifest**

`packages/claude-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "publisher",
  "displayName": "Publisher Desk",
  "version": "0.1.0",
  "description": "Draft, desk-review, approve, and publish Publisher articles from Claude Code through the publisher CLI",
  "author": { "name": "newsops" },
  "repository": "https://github.com/newsops/publisher",
  "license": "AGPL-3.0-or-later",
  "keywords": ["publisher", "editorial", "desk", "cms"],
  "userConfig": {
    "admin_origin": {
      "type": "string",
      "title": "Admin origin",
      "description": "Origin of the Publisher admin, for example https://admin.example.com (no trailing slash)",
      "required": true
    },
    "api_token": {
      "type": "string",
      "title": "Automation API token",
      "description": "Bearer key issued by an admin owner (docs/admin-api.md). Stored in the OS keychain; exported to the session environment as PUBLISHER_API_TOKEN.",
      "required": true,
      "sensitive": true
    }
  }
}
```

- [x] **Step 3: Create the two bundle stubs**

`packages/claude-plugin/scripts/tsx-stub.mjs`:

```js
// PLUG-001: the bundled CLI contains the content contract statically, so the
// tsx loader the workspace CLI registers is a no-op here.
export function register() {}
```

`packages/claude-plugin/scripts/content-stub.mjs`:

```js
// PLUG-001: archive validation is not bundled. `@publisher/content` pulls the
// Markdown/HTML toolchain (~600 KB minified) and `content inspect`/`content
// restore` are operations commands outside the desk scope; the workspace CLI
// keeps them. The plugin contract scan forbids referencing those commands.
function unavailable() {
  throw new Error(
    'archive validation is not bundled in the plugin CLI; use the workspace publisher CLI',
  )
}
export const validateEditorialArchive = unavailable
export const archiveSummary = unavailable
```

- [x] **Step 4: Create the skill file with generation markers**

`packages/claude-plugin/skills/publisher-cli/SKILL.md` (Task 2 replaces the placeholder prose; the markers must exist for the build):

```markdown
---
name: publisher-cli
description: Reference for the bundled publisher CLI — command list, JSON envelope, exit codes, and credential rules. Use whenever a command or skill runs `publisher`.
---

# publisher CLI

<!-- publisher-usage:start -->
<!-- publisher-usage:end -->
```

- [x] **Step 5: Write the build script**

`packages/claude-plugin/scripts/build.mjs`:

```js
#!/usr/bin/env node
// PLUG-001: bundles the workspace CLI into bin/publisher and regenerates the
// command table in skills/publisher-cli/SKILL.md from the CLI's own usage
// output. `--check` rebuilds in memory and exits 1 when the committed files
// differ, so scan-plugin-contract.mjs can call it.
import * as esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const entry = path.resolve(packageRoot, '../ops-cli/bin/publisher.mjs')
export const bundlePath = path.join(packageRoot, 'bin/publisher')
export const skillPath = path.join(packageRoot, 'skills/publisher-cli/SKILL.md')
const START = '<!-- publisher-usage:start -->'
const END = '<!-- publisher-usage:end -->'

export async function bundleSource() {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    alias: {
      'tsx/esm/api': path.join(packageRoot, 'scripts/tsx-stub.mjs'),
      '@publisher/content': path.join(packageRoot, 'scripts/content-stub.mjs'),
    },
    legalComments: 'none',
    logLevel: 'silent',
  })
  return result.outputFiles[0].text
}

/** Runs a bundle with `--json` and no command to read the USAGE envelope. */
export async function usageCommands(source) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-plugin-'))
  const file = path.join(directory, 'publisher.mjs')
  try {
    await writeFile(file, source, 'utf8')
    const result = spawnSync(process.execPath, [file, '--json'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    })
    const body = JSON.parse(result.stdout)
    if (body.code !== 'USAGE' || !Array.isArray(body.commands))
      throw new Error(`unexpected usage envelope: ${result.stdout}`)
    return body.commands
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export function renderUsageTable(commands) {
  const rows = commands.map((usage) => {
    const words = []
    for (const word of usage.split(' ')) {
      if (!/^[a-z][a-z|-]*$/.test(word)) break
      words.push(word)
    }
    return `| \`${words.join(' ')}\` | \`${usage}\` |`
  })
  return [
    START,
    '',
    '| Command | Usage |',
    '| --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n')
}

export function withUsageTable(skill, table) {
  const start = skill.indexOf(START)
  const end = skill.indexOf(END)
  if (start < 0 || end < 0) throw new Error('SKILL.md is missing usage markers')
  return `${skill.slice(0, start)}${table}${skill.slice(end + END.length)}`
}

/**
 * Fresh bundle, regenerated skill, and command list. `targetRoot` lets the
 * harness scan evaluate a copied plugin tree while the bundle entry and
 * esbuild still resolve from this workspace.
 */
export async function expected(targetRoot = packageRoot) {
  const source = await bundleSource()
  const commands = await usageCommands(source)
  const skill = withUsageTable(
    await readFile(
      path.join(targetRoot, 'skills/publisher-cli/SKILL.md'),
      'utf8',
    ),
    renderUsageTable(commands),
  )
  return { source, skill, commands }
}

async function main() {
  const check = process.argv.includes('--check')
  const { source, skill } = await expected()
  const stale = []
  const currentBundle = await readFile(bundlePath, 'utf8').catch(() => '')
  const currentSkill = await readFile(skillPath, 'utf8')
  if (currentBundle !== source) stale.push('stale bundle: bin/publisher')
  if (currentSkill !== skill)
    stale.push('stale usage table: skills/publisher-cli/SKILL.md')
  if (check) {
    for (const line of stale) console.error(`[plugin-build] ${line}`)
    process.exit(stale.length ? 1 : 0)
  }
  await writeFile(bundlePath, source, 'utf8')
  await chmod(bundlePath, 0o755)
  await writeFile(skillPath, skill, 'utf8')
  console.log(
    `[plugin-build] bin/publisher ${Buffer.byteLength(source)} bytes; ${stale.length ? 'updated' : 'unchanged'}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
```

- [x] **Step 6: Create the marketplace manifest at the repository root**

`.claude-plugin/marketplace.json`:

```json
{
  "name": "publisher",
  "owner": { "name": "newsops" },
  "metadata": {
    "description": "Claude Code plugins for the Publisher static-first news platform"
  },
  "plugins": [
    {
      "name": "publisher",
      "source": "./packages/claude-plugin",
      "description": "Draft, desk-review, approve, and publish Publisher articles through the bundled publisher CLI",
      "version": "0.1.0",
      "category": "productivity"
    }
  ]
}
```

- [x] **Step 7: Wire the root build script**

In the root `package.json` change

```json
"build": "pnpm --filter @publisher/site build",
```

to

```json
"build": "pnpm --filter @publisher/site build && pnpm --filter @publisher/claude-plugin build",
```

- [x] **Step 7b: Keep prettier off generated files**

Append to `.prettierignore` (create it if absent):

```
packages/claude-plugin/bin/
packages/claude-plugin/skills/publisher-cli/SKILL.md
```

The build writes both files byte-for-byte and the harness compares them; a
formatter pass would make `--check` fail.

- [x] **Step 8: Install and build**

Run: `pnpm install --offline || pnpm install` then `pnpm --filter @publisher/claude-plugin build`
Expected: `[plugin-build] bin/publisher 5xxxx bytes; updated`; `head -1 packages/claude-plugin/bin/publisher` → `#!/usr/bin/env node`; `grep -c '^import ' packages/claude-plugin/bin/publisher` → only `node:` specifiers (`grep -E "^import .* from '(?!node:)" ` must be empty; check with `grep -E "from '[^n]|from \"[^n]" packages/claude-plugin/bin/publisher | grep -v "node:"` → no output).

- [x] **Step 9: Check idempotence**

Run: `node packages/claude-plugin/scripts/build.mjs --check; echo exit=$?`
Expected: `exit=0`. Then `printf '\n' >> packages/claude-plugin/bin/publisher && node packages/claude-plugin/scripts/build.mjs --check; echo exit=$?` → `[plugin-build] stale bundle: bin/publisher`, `exit=1`; restore with `pnpm --filter @publisher/claude-plugin build`.

- [x] **Step 10: Commit**

```bash
git add packages/claude-plugin .claude-plugin package.json pnpm-lock.yaml .prettierignore
git -c core.hooksPath=/dev/null commit -m "feat(plugin): scaffold @publisher/claude-plugin with bundled CLI build (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 2: Bundle contract test and publisher-cli skill prose

**Files:**

- Create: `packages/claude-plugin/test/bundle.test.mjs`
- Modify: `packages/claude-plugin/skills/publisher-cli/SKILL.md`

- [x] **Step 1: Write the failing bundle test**

`packages/claude-plugin/test/bundle.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const bundle = path.join(packageRoot, 'bin/publisher')

function run(args, environment = {}) {
  const result = spawnSync(process.execPath, [bundle, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...environment },
  })
  return {
    status: result.status,
    stdout: result.stdout,
    body: JSON.parse(result.stdout),
  }
}

async function withServer(handler, callback) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    return await callback(origin)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe('bundled publisher CLI (PLUG-001)', () => {
  it('is a self-contained node script', async () => {
    const source = await readFile(bundle, 'utf8')
    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true)
    const bare = [...source.matchAll(/^import .* from ["']([^"']+)["']/gm)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.startsWith('node:'))
    expect(bare).toEqual([])
    expect(source).not.toMatch(/require\(["'](?!node:)/)
  })

  it('prints the USAGE envelope without arguments', () => {
    const { body } = run(['--json'])
    expect(body.code).toBe('USAGE')
    expect(body.commands).toContain(
      'desk report --site <id> --post <post-id> --json',
    )
  })

  it('reports missing configuration instead of guessing', () => {
    const { status, body } = run([
      'desk',
      'report',
      '--site',
      's',
      '--post',
      'p',
      '--json',
    ])
    expect(status).toBe(20)
    expect(body.code).toBe('CONFIGURATION_REQUIRED')
    expect(body.missing).toEqual([
      'PUBLISHER_ADMIN_ORIGIN',
      'PUBLISHER_API_TOKEN',
    ])
  })

  it('calls the documented desk route with a bearer header and never echoes the token', async () => {
    const calls = []
    const token = 'secret-token-value'
    await withServer(
      (request, response) => {
        calls.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
        })
        response.setHeader('content-type', 'application/json')
        response.end(
          JSON.stringify({ siteId: 's', postId: 'p', report: { checks: [] } }),
        )
      },
      async (origin) => {
        const { body, stdout } = run(
          ['desk', 'report', '--site', 's', '--post', 'p', '--json'],
          { PUBLISHER_ADMIN_ORIGIN: origin, PUBLISHER_API_TOKEN: token },
        )
        expect(body.code).toBe('DESK_REPORT')
        expect(stdout).not.toContain(token)
      },
    )
    expect(calls).toEqual([
      {
        method: 'GET',
        url: '/api/v2/sites/s/posts/p/desk',
        authorization: `Bearer ${token}`,
      },
    ])
  })

  it('reports that archive validation is not bundled', () => {
    const { body } = run([
      'content',
      'inspect',
      '--archive',
      packageRoot,
      '--json',
    ])
    expect(body.code).toBe('ARCHIVE_INVALID')
  })
})
```

- [x] **Step 2: Run the test**

Run: `pnpm --filter @publisher/claude-plugin test`
Expected: 5 passed (the bundle from Task 1 already satisfies them; if "self-contained" fails, the alias in `build.mjs` is wrong — fix there, never in `bin/`).

- [x] **Step 3: Write the skill prose** (keep the markers; the table between them is generated)

Replace `packages/claude-plugin/skills/publisher-cli/SKILL.md` with:

```markdown
---
name: publisher-cli
description: Reference for the bundled publisher CLI — command list, JSON envelope, exit codes, and credential rules. Use whenever a command or skill runs `publisher`.
---

# publisher CLI

`publisher` is on the Bash PATH while this plugin is enabled (it is
`bin/publisher`, a bundle of the workspace CLI). It talks only to the admin's
automation API; it never reaches a database, object store, or hosting provider.

## Invocation rules

- Always pass `--json` and, for mutations, `--non-interactive`. Parse stdout as
  one JSON object.
- Credentials come only from the environment: `PUBLISHER_ADMIN_ORIGIN` and
  `PUBLISHER_API_TOKEN`, exported by the plugin's SessionStart hook from the
  plugin settings. Never pass a token as an argument, never print
  `$PUBLISHER_API_TOKEN`, never write it to a file.
- Mutations take `--revision <n>`; read the current revision first and retry
  once on `revision_conflict`.
- `content inspect` and `content restore` are not bundled in the plugin CLI.

## Envelope

Every result is `{ "schemaVersion": 1, "ok": boolean, "code": string, ... }`.

| `code`                     | Meaning                                                                                 | Exit | What to do                                       |
| -------------------------- | --------------------------------------------------------------------------------------- | ---- | ------------------------------------------------ |
| `USAGE`, `INPUT_REQUIRED`  | Wrong or missing arguments (`field` names the option)                                   | 10   | Fix the invocation                               |
| `CONFIGURATION_REQUIRED`   | `missing` lists unset environment variables                                             | 20   | Tell the user to set plugin settings, then retry |
| `NON_INTERACTIVE_REQUIRED` | A mutation was attempted without `--non-interactive`                                    | 10   | Add the flag                                     |
| `REMOTE_ERROR`             | Admin refused: `body.error.code` (e.g. `revision_conflict`, `validation_failed`)        | 30   | Branch on `body.error.code`                      |
| `DESK_REJECTED`            | Desk gate failed: `body.error.code` `desk_checks_failed` or `desk_checklist_incomplete` | 30   | Run the improvement loop (editorial-desk skill)  |
| `AUTHORITY_REQUIRED`       | A human must act (device login, approvals)                                              | 40   | Stop and report                                  |
| `OPERATION_ACCEPTED`       | Publish accepted; `operation.id` to poll                                                | 0    | `publisher operation get <id> --json`            |

## Commands

<!-- publisher-usage:start -->
<!-- publisher-usage:end -->
```

- [x] **Step 4: Regenerate and verify**

Run: `pnpm --filter @publisher/claude-plugin build && node packages/claude-plugin/scripts/build.mjs --check && grep -c '^| `' packages/claude-plugin/skills/publisher-cli/SKILL.md`
Expected: check exits 0; the count is at least 40 (usage rows plus the envelope table).

- [x] **Step 5: Commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/claude-plugin/test/bundle.test.mjs
git add packages/claude-plugin
git -c core.hooksPath=/dev/null commit -m "test(plugin): bundle contract and publisher-cli skill (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 3: SessionStart credential bridge

**Files:**

- Create: `packages/claude-plugin/scripts/session-env.sh`
- Create: `packages/claude-plugin/hooks/hooks.json`
- Create: `packages/claude-plugin/test/session-env.test.mjs`

- [x] **Step 1: Write the failing hook test**

`packages/claude-plugin/test/session-env.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/session-env.sh',
)

async function envFile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'publisher-hook-'))
  const file = path.join(directory, 'env')
  await writeFile(file, 'export OTHER=1\n', 'utf8')
  return file
}

function runHook(environment) {
  return spawnSync('sh', [script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...environment },
  })
}

describe('session-env hook (PLUG-001)', () => {
  it('appends quoted exports that round-trip through sh', async () => {
    const file = await envFile()
    const token = `p w$1'x"y\\z`
    const result = runHook({
      CLAUDE_ENV_FILE: file,
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: token,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    const content = await readFile(file, 'utf8')
    expect(content.startsWith('export OTHER=1\n')).toBe(true)
    expect(content.match(/^export /gm)).toHaveLength(3)
    const sourced = spawnSync(
      'sh',
      [
        '-c',
        `. "${file}"; printf '%s\\n%s\\n' "$PUBLISHER_ADMIN_ORIGIN" "$PUBLISHER_API_TOKEN"`,
      ],
      { encoding: 'utf8', env: { PATH: process.env.PATH } },
    )
    expect(sourced.stdout).toBe(`https://admin.example\n${token}\n`)
  })

  it('writes nothing when either option is missing', async () => {
    for (const environment of [
      { CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example' },
      { CLAUDE_PLUGIN_OPTION_API_TOKEN: 't' },
      {},
    ]) {
      const file = await envFile()
      const result = runHook({ CLAUDE_ENV_FILE: file, ...environment })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(await readFile(file, 'utf8')).toBe('export OTHER=1\n')
    }
  })

  it('exits 0 without CLAUDE_ENV_FILE', () => {
    const result = runHook({
      CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN: 'https://admin.example',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 't',
    })
    expect(result.status).toBe(0)
  })
})
```

- [x] **Step 2: Run it to see it fail**

Run: `pnpm --filter @publisher/claude-plugin test -- session-env`
Expected: FAIL — `sh: .../session-env.sh: No such file or directory` (status 127).

- [x] **Step 3: Write the hook script**

`packages/claude-plugin/scripts/session-env.sh`:

```sh
#!/bin/sh
# PLUG-001: plugin userConfig values reach hook processes only, so this
# SessionStart hook exports them into CLAUDE_ENV_FILE, which Claude Code
# sources before every Bash command. Values are single-quoted for any POSIX
# shell; nothing is printed; missing values write nothing.
set -eu
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
origin="${CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN:-}"
token="${CLAUDE_PLUGIN_OPTION_API_TOKEN:-}"
if [ -z "$origin" ] || [ -z "$token" ]; then exit 0; fi
squote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}
{
  printf 'export PUBLISHER_ADMIN_ORIGIN=%s\n' "$(squote "${origin%/}")"
  printf 'export PUBLISHER_API_TOKEN=%s\n' "$(squote "$token")"
} >>"$CLAUDE_ENV_FILE"
```

Run: `chmod +x packages/claude-plugin/scripts/session-env.sh`

- [x] **Step 4: Register the hook**

`packages/claude-plugin/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "sh \"${CLAUDE_PLUGIN_ROOT}/scripts/session-env.sh\""
          }
        ]
      }
    ]
  }
}
```

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @publisher/claude-plugin test`
Expected: 8 passed (5 bundle + 3 hook).

- [x] **Step 6: Commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/claude-plugin/test/session-env.test.mjs packages/claude-plugin/hooks/hooks.json
git add packages/claude-plugin
git -c core.hooksPath=/dev/null commit -m "feat(plugin): bridge plugin settings into the session environment (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 4: Editorial skills and the desk-reviewer agent

**Files:**

- Create: `packages/claude-plugin/skills/editorial-desk/SKILL.md`
- Create: `packages/claude-plugin/skills/press-images/SKILL.md`
- Create: `packages/claude-plugin/agents/desk-reviewer.md`

- [x] **Step 1: Write the editorial-desk skill**

`packages/claude-plugin/skills/editorial-desk/SKILL.md`:

```markdown
---
name: editorial-desk
description: The Publisher editorial workflow and desk gate — how a post moves from source to draft to approved to published, what each desk check requires, and how the improvement loop works. Use for any article drafting, review, approval, or publishing task.
---

# Editorial desk

Every published article passes the admin's desk gate (`desk report` → six
self-check attestations → `desk approve`). There is no override. Editing a
published post moves it back to `review` and requires a new approval.

## Workflow

1. **Context** — `publisher site guidance get --site <id> --json` (site
   editorial guidance; follow it verbatim) and
   `publisher post plan --site <id> --author <slug> --json` (author, category
   and slug rules).
2. **Draft** — write `bodyMarkdown` per the body contract below, then
   `publisher post create --site <id> --input <post.json> --non-interactive --json`
   with `status: "review"`.
3. **Image** — source per the `press-images` skill, then
   `publisher media upload --site <id> --file <path> --mime-type <type> --non-interactive --json`
   and put the widest `variants[].publicPath` into `imageUrl`.
4. **Desk** — `publisher desk report --site <id> --post <post-id> --json`.
   Fix every non-`pass` check with
   `publisher post update --site <id> --post <post-id> --input <patch.json> --revision <n> --non-interactive --json`
   (partial patches are accepted). Re-run the report. At most three
   iterations; then stop and report to the user with the remaining items.
5. **Independent review** — dispatch the `publisher:desk-reviewer` agent with
   the post id, site id, the report JSON, and the body. It returns one
   evidence line per checklist item, or an objection.
6. **Approve** — only when every check passes and the reviewer raised no
   objection:
   `publisher desk approve --site <id> --post <post-id> --revision <n> --check facts-verified --check headline-accurate --check image-representative --check seo-fields --check taxonomy-author --check site-guidance --note "<reviewer evidence, one sentence per item>" --non-interactive --json`
   Every `--check` id must come from `report.checklist[].id`; pass all of
   them or none.
7. **Publish** — `publisher post update … --input '{"status":"published"}'`,
   then `publisher publish --site <id> --idempotency-key <site>-<yyyymmdd>-<n> --non-interactive --json`
   and `publisher operation get <operation-id> --json` until the operation is
   terminal. Static deployment is performed by the operations worker, not by
   this plugin.

## Body contract (`bodyMarkdown`)

- Plain Markdown paragraphs; no raw HTML; no H1 (the title is the H1).
- Cite every factual claim with a link to the source you actually read.
- Quote at most one short passage per source, in quotation marks.
- Embed an X post with a directive block, never a pasted screenshot:
  `:::embed{provider="x" url="https://x.com/<user>/status/<id>" quote="<text>" authorName="<name>"}` followed by `:::` on its own line.
- Do not repeat the representative image inside the body.
- 300–900 words for a news item; first paragraph states the news.

## Desk checks and how to satisfy them

| Check                     | Requirement                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `image.present/resolved`  | `imageUrl` points at an approved media-library variant              |
| `image.size/aspect`       | ≥ 1200 px wide, 16:9 preferred                                      |
| `image.content`           | Not a blank/placeholder; no unrelated captions baked into the image |
| `image.duplicate`         | Body figures do not repeat the representative image                 |
| `title.length`            | 40–80 characters                                                    |
| `excerpt.length`          | 80–160 characters, one sentence                                     |
| `seoTitle/seoDescription` | Present; title ≤ 70, description 100–160                            |
| `body.markdown/length`    | Contract above; ≥ 250 words                                         |
| `body.sources`            | At least two source links or embeds                                 |
| `author.active`           | Author slug from `post plan`                                        |
| `taxonomy.categories`     | At least one category from `post plan`                              |
| `site.guidance`           | Guidance fetched and followed                                       |

Numbers are the desk's current thresholds; the report's `message` is
authoritative when they differ.

## Self-check attestations

`facts-verified`, `headline-accurate`, `image-representative`, `seo-fields`,
`taxonomy-author`, `site-guidance`. Each `--check` is a statement that you
verified the item; the `--note` must say what was verified and how. Never
attest an item the reviewer objected to.
```

- [x] **Step 2: Write the press-images skill**

`packages/claude-plugin/skills/press-images/SKILL.md`:

```markdown
---
name: press-images
description: How to find, verify, and upload a representative image for a Publisher article using official press or product assets. Use before uploading any article image.
---

# Press images

The site guidance requires a representative image from an official press or
product resource. Follow this order and stop at the first hit.

1. The announcement page of the subject (company newsroom or blog post):
   read `og:image`/`twitter:image` in the page's `<head>`; prefer a
   `1600×900` or larger variant (many CDNs accept `?w=1600&h=900&fit=fill`).
2. The product page for the product named in the headline.
3. The company's press kit or brand assets page.

Reject an image when:

- it carries a caption, demo text, or UI screenshot unrelated to the story
  (the 2026-09-19 ChatGPT Pro card showing "deadlock source and fix in C++"
  is the canonical example);
- it is narrower than 1200 px or not roughly 16:9;
- it belongs to a third party (stock, social-media avatar, another outlet).

Record the source URL of the image in the approval note. Download with
`curl -sL -A "Mozilla/5.0" <url> -o <file>` and check `file <file>` for the
real type before `publisher media upload --site <id> --file <file> --mime-type <type> --non-interactive --json`.
If the upload returns `state: "pending"`, run
`publisher media approve --site <id> --media <media-id> --non-interactive --json`.
Use the widest `variants[].publicPath` as `imageUrl`.
```

- [x] **Step 3: Write the desk-reviewer agent**

`packages/claude-plugin/agents/desk-reviewer.md`:

```markdown
---
name: desk-reviewer
description: Independent desk reviewer. Dispatch after a desk report passes and before `desk approve` to re-verify facts, headline, image, SEO, taxonomy, and site guidance in a fresh context. Read-only; never approves.
disallowedTools: ['Write', 'Edit', 'NotebookEdit']
skills: ['publisher:editorial-desk', 'publisher:press-images']
---

You are the desk. You did not write this article and you must not trust the
writer's summary. You receive: site id, post id, the `desk report` JSON, and
the post body with its sources and image URL.

Do, in order:

1. Open every source link (WebFetch) and confirm each factual claim in the
   body against it. Note any claim without a supporting source.
2. Compare headline and excerpt with the body: same subject, no escalation.
3. Fetch the representative image URL and describe what it shows; confirm it
   depicts the story's subject and carries no unrelated caption or UI text.
4. Check SEO title/description lengths and that categories and author match
   the site's `post plan`.
5. Read the site guidance and list any instruction the body violates.

You may run read-only CLI commands: `publisher desk report`, `publisher site guidance get`, `publisher post plan`, `publisher author get`.
You must not run `publisher desk approve`, `publisher post update`, or
`publisher publish`; approval belongs to the main session.

Reply with exactly this structure:

VERDICT: ready | objection
facts-verified: <one sentence of evidence or the objection>
headline-accurate: <…>
image-representative: <…>
seo-fields: <…>
taxonomy-author: <…>
site-guidance: <…>
```

- [x] **Step 4: Commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/claude-plugin/skills/editorial-desk/SKILL.md packages/claude-plugin/skills/press-images/SKILL.md packages/claude-plugin/agents/desk-reviewer.md
git add packages/claude-plugin
git -c core.hooksPath=/dev/null commit -m "feat(plugin): editorial-desk and press-images skills, desk-reviewer agent (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 5: Commands

**Files:**

- Create: `packages/claude-plugin/commands/setup.md`
- Create: `packages/claude-plugin/commands/status.md`
- Create: `packages/claude-plugin/commands/draft.md`
- Create: `packages/claude-plugin/commands/desk.md`
- Create: `packages/claude-plugin/commands/publish.md`

- [x] **Step 1: setup**

`packages/claude-plugin/commands/setup.md`:

```markdown
---
description: Verify the Publisher plugin can reach the admin with the configured origin and token
allowed-tools: Bash(publisher:*)
---

Load the `publisher:publisher-cli` skill. Then:

1. Run `publisher doctor --json --non-interactive`.
2. If `code` is `CONFIGURATION_REQUIRED`, tell the user which variables are
   missing and that they are set in the plugin settings (`/plugin` → Publisher
   Desk → Configure: Admin origin, Automation API token). A new session is
   needed after saving. Stop.
3. If `code` is `REMOTE_ERROR`, show `status` and `body.error` verbatim and
   stop; do not retry with different credentials.
4. Run `publisher site list --json` and print a table of `siteId`, `name`,
   `canonicalOrigin`, `themeId`.

Never print the value of `PUBLISHER_API_TOKEN`.
```

- [x] **Step 2: status**

`packages/claude-plugin/commands/status.md`:

```markdown
---
description: Show sites, the desk queue, and the latest publish operation
argument-hint: '[--site <id>]'
allowed-tools: Bash(publisher:*)
---

Load the `publisher:publisher-cli` skill. Sites: `publisher site list --json`
(restrict to `$ARGUMENTS` `--site` when given). For each site:

1. `publisher desk list --site <id> --json` → list posts in review with their
   `revision`, `title`, and `deskReview.status`.
2. `publisher status --site <id> --json` → the latest operation id, state,
   and timestamp.

Print one table per site and finish with the count of posts waiting for the
desk. Read-only: run no mutation.
```

- [x] **Step 3: draft**

`packages/claude-plugin/commands/draft.md`:

```markdown
---
description: Draft a Publisher article from a source URL, upload its press image, and create it in review
argument-hint: '<source-url> --site <id> [--author <slug>]'
allowed-tools: Bash(publisher:*), Bash(curl:*), Bash(file:*), WebFetch, Read, Write
---

Load `publisher:editorial-desk`, `publisher:press-images`, and
`publisher:publisher-cli`. Arguments: `$ARGUMENTS` (source URL, `--site`,
optional `--author`; if `--author` is missing, take the first active author from
`post plan`).

1. `publisher site guidance get --site <id> --json` and
   `publisher post plan --site <id> --author <slug> --json`. Quote the
   guidance's constraints back to yourself before writing.
2. Fetch and read the source. If it links to a primary source (company
   announcement, filing, official post), read that too and cite it.
3. Write the post JSON to a scratch file with `title`, `slug` (from the plan's
   rule), `excerpt`, `seoTitle`, `seoDescription`, `bodyMarkdown`,
   `categories` (slugs from the plan), `author`, `sourceUrl`, and
   `status: "review"`.
4. Source and upload the image per `press-images`; set `imageUrl`.
5. `publisher post create --site <id> --input <file> --non-interactive --json`.
   On `REMOTE_ERROR` with `validation_failed`, show `body.error.message`, fix
   the JSON, and retry once.
6. Print the post id and revision, and suggest
   `/publisher:desk <post-id> --site <id>`.

Do not approve or publish in this command.
```

- [x] **Step 4: desk**

`packages/claude-plugin/commands/desk.md`:

```markdown
---
description: Run the desk gate for a post — report, improvement loop, independent review, approval
argument-hint: '<post-id> --site <id>'
allowed-tools: Bash(publisher:*), Bash(curl:*), Bash(file:*), WebFetch, Read, Write, Agent
---

Load `publisher:editorial-desk` and `publisher:publisher-cli`. Arguments:
`$ARGUMENTS` (post id and `--site`).

1. `publisher desk report --site <id> --post <post-id> --json`. Keep
   `revision`, `report.checks`, and `report.checklist`.
2. For each check whose `level` is not `pass`: prepare the smallest patch that
   satisfies its `message`, apply it with
   `publisher post update --site <id> --post <post-id> --input <patch> --revision <n> --non-interactive --json`
   (include `"status": "review"` if the post is currently published), then
   re-run the report. Stop after three iterations and report the remaining
   items to the user; do not attempt approval.
3. When every check passes, dispatch the `publisher:desk-reviewer` agent with
   the site id, post id, the full report JSON, the body, sources, and image URL.
4. If the reviewer's `VERDICT` is `objection`, fix the objected items (step 2)
   and dispatch the reviewer again, once. If it still objects, report to the
   user and stop.
5. Approve with all six `--check` ids from `report.checklist` and the
   reviewer's six evidence lines joined into `--note`:
   `publisher desk approve --site <id> --post <post-id> --revision <n> --check … --note "…" --non-interactive --json`.
6. On `DESK_REJECTED`, show `body.error` and return to step 2.
7. Print the new revision and suggest `/publisher:publish --site <id>`.

There is no path that skips the report, the reviewer, or the attestations.
```

- [x] **Step 5: publish**

`packages/claude-plugin/commands/publish.md`:

```markdown
---
description: Publish desk-approved posts for a site and wait for the publish operation
argument-hint: '--site <id> [--post <post-id>]'
allowed-tools: Bash(publisher:*)
---

Load `publisher:publisher-cli`. Arguments: `$ARGUMENTS` (`--site`, optional
`--post` to limit to one post).

1. `publisher desk list --site <id> --json`. Candidates are posts with
   `deskReview.status` `approved` and `status` `review` (or the one `--post`).
   If none, say so and stop.
2. For each candidate:
   `publisher post update --site <id> --post <post-id> --input '{"status":"published"}' --revision <n> --non-interactive --json`.
   On `REMOTE_ERROR` `validation_failed` mentioning desk approval, skip it and
   tell the user to run `/publisher:desk` for that post.
3. `publisher publish --site <id> --idempotency-key <site>-<yyyymmdd>-<HHmm> --non-interactive --json`
   → `operation.id`.
4. Poll `publisher operation get <operation-id> --json` every 10 seconds until
   the state is terminal (`published`, `failed`), at most 5 minutes.
5. Report the operation state and the published post ids. State explicitly
   that static deployment to the public site is performed by the operations
   worker, not by this plugin.
```

- [x] **Step 6: Commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/claude-plugin/commands
git add packages/claude-plugin/commands
git -c core.hooksPath=/dev/null commit -m "feat(plugin): setup, status, draft, desk, publish commands (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 6: Harness — plugin layer and plugin contract scan

**Files:**

- Modify: `scripts/harness/layer-map.json`
- Create: `scripts/harness/scan-plugin-contract.mjs`
- Create: `scripts/harness/__tests__/claude-plugin-contract.test.mjs`
- Modify: `scripts/harness/run-all-scans.mjs`

- [x] **Step 1: Write the failing scan test**

`scripts/harness/__tests__/claude-plugin-contract.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const scan = path.join(root, 'scripts/harness/scan-plugin-contract.mjs')

async function copyPlugin() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'plugin-scan-'))
  await cp(
    path.join(root, 'packages/claude-plugin'),
    path.join(directory, 'packages/claude-plugin'),
    { recursive: true },
  )
  await cp(
    path.join(root, '.claude-plugin'),
    path.join(directory, '.claude-plugin'),
    { recursive: true },
  )
  return directory
}

function runScan(pluginRoot) {
  return spawnSync(process.execPath, [scan, '--root', pluginRoot], {
    cwd: root,
    encoding: 'utf8',
  })
}

describe('plugin contract scan (PLUG-001)', () => {
  it('passes on the committed tree', () => {
    const result = runScan(root)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('fails on a stale bundle', async () => {
    const copy = await copyPlugin()
    const bundle = path.join(copy, 'packages/claude-plugin/bin/publisher')
    await writeFile(bundle, `${await readFile(bundle, 'utf8')}\n`, 'utf8')
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('stale bundle')
  })

  it('fails on a command the CLI does not have', async () => {
    const copy = await copyPlugin()
    const command = path.join(copy, 'packages/claude-plugin/commands/status.md')
    await writeFile(
      command,
      `${await readFile(command, 'utf8')}\nRun \`publisher post frobnicate --site x --json\`.\n`,
      'utf8',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'unknown command: publisher post frobnicate',
    )
  })

  it('fails on an unbundled command', async () => {
    const copy = await copyPlugin()
    const command = path.join(copy, 'packages/claude-plugin/commands/status.md')
    await writeFile(
      command,
      `${await readFile(command, 'utf8')}\nRun \`publisher content inspect --archive x\`.\n`,
      'utf8',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not bundled: publisher content inspect')
  })

  it('fails on credentials in arguments or token references outside the hook', async () => {
    const copy = await copyPlugin()
    const skill = path.join(
      copy,
      'packages/claude-plugin/skills/press-images/SKILL.md',
    )
    await writeFile(
      skill,
      `${await readFile(skill, 'utf8')}\nUse \`publisher doctor --token abc\` and $CLAUDE_PLUGIN_OPTION_API_TOKEN.\n`,
      'utf8',
    )
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('credential in arguments')
    expect(result.stderr).toContain(
      'token reference outside scripts/session-env.sh',
    )
  })

  it('fails when the marketplace source does not exist', async () => {
    const copy = await copyPlugin()
    const manifest = path.join(copy, '.claude-plugin/marketplace.json')
    const parsed = JSON.parse(await readFile(manifest, 'utf8'))
    parsed.plugins[0].source = './packages/missing'
    await writeFile(manifest, JSON.stringify(parsed), 'utf8')
    const result = runScan(copy)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('marketplace source missing')
  })
})
```

- [x] **Step 2: Run it to see it fail**

Run: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/claude-plugin-contract.test.mjs`
Expected: FAIL — cannot find module `scan-plugin-contract.mjs`.

- [x] **Step 3: Write the scan**

`scripts/harness/scan-plugin-contract.mjs`:

```js
#!/usr/bin/env node
// PLUG-001: the Claude plugin is a consumer of the CLI surface. This scan
// keeps it honest: manifests parse and point at real paths, the committed
// bundle and usage table equal a fresh build, every `publisher …` mention
// names a real (and bundled) command, and no credential leaves the hook.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { root as repositoryRoot } from './layer-common.mjs'

const rootIndex = process.argv.indexOf('--root')
const root =
  rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repositoryRoot
const pluginRoot = path.join(root, 'packages/claude-plugin')
const failures = []
const fail = (message) => failures.push(message)

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
  } catch (error) {
    fail(`${relative}: ${error.message}`)
    return undefined
  }
}

// 1. Manifests.
const marketplace = readJson('.claude-plugin/marketplace.json')
const manifest = readJson('packages/claude-plugin/.claude-plugin/plugin.json')
if (marketplace) {
  for (const key of ['name', 'owner', 'plugins'])
    if (!(key in marketplace)) fail(`marketplace.json: missing ${key}`)
  for (const plugin of marketplace.plugins ?? []) {
    if (!plugin.name || !plugin.source)
      fail('marketplace.json: plugin needs name and source')
    if (typeof plugin.source === 'string' && plugin.source.startsWith('./')) {
      const target = path.join(
        root,
        plugin.source,
        '.claude-plugin/plugin.json',
      )
      if (!fs.existsSync(target))
        fail(`marketplace source missing: ${plugin.source}`)
    }
  }
}
if (manifest) {
  if (manifest.name !== 'publisher')
    fail('plugin.json: name must be "publisher"')
  for (const key of ['admin_origin', 'api_token'])
    if (!manifest.userConfig?.[key])
      fail(`plugin.json: userConfig.${key} missing`)
  if (manifest.userConfig?.api_token?.sensitive !== true)
    fail('plugin.json: userConfig.api_token must be sensitive')
}

// 2. Bundle and usage table freshness (the build script owns the comparison).
// Always the workspace build script: a copied tree (tests) has no ops-cli.
const build = await import(
  pathToFileURL(
    path.join(repositoryRoot, 'packages/claude-plugin/scripts/build.mjs'),
  )
)
const { source, skill, commands } = await build.expected(pluginRoot)
if (fs.readFileSync(path.join(pluginRoot, 'bin/publisher'), 'utf8') !== source)
  fail('stale bundle: run pnpm --filter @publisher/claude-plugin build')
if (
  fs.readFileSync(
    path.join(pluginRoot, 'skills/publisher-cli/SKILL.md'),
    'utf8',
  ) !== skill
)
  fail('stale usage table: run pnpm --filter @publisher/claude-plugin build')

// 3. Command references.
const known = []
for (const usage of commands) {
  const words = []
  for (const word of usage.split(' ')) {
    if (!/^[a-z][a-z|-]*$/.test(word)) break
    words.push(word.split('|'))
  }
  const expand = (index, prefix) =>
    index === words.length
      ? known.push(prefix)
      : words[index].forEach((alternative) =>
          expand(index + 1, [...prefix, alternative]),
        )
  expand(0, [])
}
const notBundled = [
  ['content', 'inspect'],
  ['content', 'restore'],
]
const contentFiles = ['commands', 'skills', 'agents'].flatMap((directory) =>
  listMarkdown(path.join(pluginRoot, directory)),
)
function listMarkdown(directory) {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
}
const startsWith = (candidate, prefix) =>
  prefix.every((word, index) => candidate[index] === word)
for (const file of contentFiles) {
  const relative = path.relative(root, file)
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(/`publisher((?: [a-z][a-z-]*)+)/g)) {
    const mention = match[1].trim().split(' ')
    let taken = []
    for (const word of mention) {
      const next = [...taken, word]
      if (!known.some((candidate) => startsWith(candidate, next))) break
      taken = next
    }
    if (taken.length === 0) continue
    if (notBundled.some((prefix) => startsWith(taken, prefix)))
      fail(`${relative}: not bundled: publisher ${taken.join(' ')}`)
    else if (
      !known.some(
        (candidate) =>
          candidate.length === taken.length && startsWith(candidate, taken),
      )
    )
      fail(
        `${relative}: unknown command: publisher ${mention.slice(0, taken.length + 1).join(' ')}`,
      )
  }
  if (/--token\b/.test(text) || /PUBLISHER_API_TOKEN\s*=\s*\S/.test(text))
    fail(`${relative}: credential in arguments`)
}

// 4. Token references stay inside the hook script.
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : walk(full)
    return [full]
  })
for (const file of walk(pluginRoot)) {
  const relative = path.relative(pluginRoot, file)
  if (relative === 'scripts/session-env.sh' || relative.startsWith('test/'))
    continue
  if (fs.readFileSync(file, 'utf8').includes('CLAUDE_PLUGIN_OPTION_API_TOKEN'))
    fail(
      `packages/claude-plugin/${relative}: token reference outside scripts/session-env.sh`,
    )
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[plugin-contract] ${failure}`)
  process.exit(1)
}
console.log(
  `[plugin-contract] manifests valid, bundle current, ${contentFiles.length} content files reference only bundled commands`,
)
```

Note: `fs.readdirSync(..., { recursive: true })` returns entries whose
`parentPath` is set on Node 22; the `?? entry.path` fallback covers older
minors.

- [x] **Step 4: Add the `plugin` layer**

In `scripts/harness/layer-map.json`:

- `modules.tooling`: append `"esbuild"`.
- `exempt`: append `"packages/claude-plugin/bin/**"`.
- `layers`: add, before `cli`:

```json
"plugin": {
  "level": "L5",
  "globs": ["packages/claude-plugin/**"],
  "allow": ["plugin", "builtin", "tooling"]
}
```

- [x] **Step 5: Register the scan**

In `scripts/harness/run-all-scans.mjs` append `'scan-plugin-contract.mjs',` after `'scan-surface-parity.mjs',`.

- [x] **Step 6: Run the tests and scans**

Run: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/claude-plugin-contract.test.mjs`
Expected: 6 passed.
Run: `node scripts/harness/scan-layer-imports.mjs && pnpm harness:scan`
Expected: `[layer-imports] no new violations (0 baseline entries remain)`; `[harness] 11 scans passed`.

- [x] **Step 7: Prove the layer rule bites**

Run:

```bash
printf "import '../../content/src/index.ts'\n" >> packages/claude-plugin/scripts/tsx-stub.mjs
node scripts/harness/scan-layer-imports.mjs; echo exit=$?
git checkout packages/claude-plugin/scripts/tsx-stub.mjs
```

Expected: a violation line naming `packages/claude-plugin/scripts/tsx-stub.mjs -> …content/src/index.ts` and `exit=1`. (Rebuild afterwards is not needed; the stub is restored before the build reads it — confirm with `node packages/claude-plugin/scripts/build.mjs --check`.)

- [x] **Step 8: Commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write scripts/harness/scan-plugin-contract.mjs scripts/harness/__tests__/claude-plugin-contract.test.mjs scripts/harness/layer-map.json scripts/harness/run-all-scans.mjs
git add scripts/harness
git -c core.hooksPath=/dev/null commit -m "harness: plugin layer and plugin contract scan (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 7: Documentation

**Files:**

- Create: `packages/claude-plugin/README.md`
- Modify: `docs/agent-operations.md` (after the `## Surfaces` section)
- Modify: `.agents/project-structure.md` (tree and L5 row)
- Modify: `README.md` (root; short install section)
- Modify: `docs/work-status.md`

- [x] **Step 1: Plugin README**

`packages/claude-plugin/README.md`:

````markdown
# Publisher Desk — Claude Code plugin

Runs the Publisher editorial desk from Claude Code: draft from a source,
upload a press image, pass the desk gate, approve with attestations, publish.

## Install

```
/plugin marketplace add newsops/publisher
/plugin install publisher@publisher
```

When enabling, Claude Code asks for **Admin origin** and **Automation API
token** (a key an admin owner issued; see `docs/admin-api.md`). Start a new
session, then run `/publisher:setup`.

## Commands

| Command                                    | Does                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `/publisher:setup`                         | `doctor` + `site list`                                              |
| `/publisher:status [--site id]`            | desk queue and latest publish operation                             |
| `/publisher:draft <url> --site id`         | guidance → draft → press image → `post create` (review)             |
| `/publisher:desk <post-id> --site id`      | `desk report` → improvement loop → independent reviewer → `approve` |
| `/publisher:publish --site id [--post id]` | set published → `publish` → wait for the operation                  |

Static deployment of the public site is performed by the operations worker,
not by this plugin.

## How credentials flow

The token is stored by Claude Code in the OS keychain (`sensitive`
`userConfig`). Plugin settings are not visible to Bash commands, so a
`SessionStart` hook (`scripts/session-env.sh`) exports
`PUBLISHER_ADMIN_ORIGIN` and `PUBLISHER_API_TOKEN` into the session's
`CLAUDE_ENV_FILE`, which Claude Code sources before each Bash command. The
token therefore exists in that per-session file while a session runs. The
CLI reads credentials only from those two variables and never prints them.

## Development

- `pnpm --filter @publisher/claude-plugin build` bundles
  `packages/ops-cli/bin/publisher.mjs` into `bin/publisher` (committed) and
  regenerates the command table in `skills/publisher-cli/SKILL.md`.
- `pnpm harness:scan` fails when the bundle or table is stale, when a command
  or skill mentions a `publisher` command the CLI does not have, or when a
  credential appears anywhere but the hook.
- Local trial: `claude --plugin-dir packages/claude-plugin` with
  `PUBLISHER_ADMIN_ORIGIN` and `PUBLISHER_API_TOKEN` exported in the shell
  (the hook only runs for installed plugins with saved settings).
````

- [x] **Step 2: agent-operations.md**

Append after the `## Surfaces` section of `docs/agent-operations.md`:

```markdown
## Claude Code plugin

`packages/claude-plugin` packages the CLI for Claude Code (PLUG-001). It is a
consumer of the CLI surface, not a fourth surface: `bin/publisher` is an
esbuild bundle of `packages/ops-cli/bin/publisher.mjs`, commands sequence CLI
calls, and skills carry the editorial rules. `scan-plugin-contract.mjs` fails
`pnpm harness:scan` when the bundle is stale or a command references a CLI
command that does not exist. Install with `/plugin marketplace add newsops/publisher`
and `/plugin install publisher@publisher`; the plugin's README documents the
credential flow. Archive commands (`content inspect`, `content restore`) are
not bundled.
```

- [x] **Step 3: project-structure.md**

In the tree add after the `ops-cli/` line:

```
├── claude-plugin/ @publisher/claude-plugin — Claude Code plugin over the bundled CLI
```

In the L5 row of the layer table change the globs cell to
`` `packages/admin-client/**`, `packages/ops-cli/**`, `packages/claude-plugin/**`, `scripts/**` ``
and the allow cell to
`client: nothing; cli: client + builtins; plugin: builtins + tooling; scripts: package indexes`.

- [x] **Step 4: Root README**

Add before `## Licensing`:

```markdown
## Claude Code plugin

`/plugin marketplace add newsops/publisher` then `/plugin install publisher@publisher`
installs the editorial desk commands (`/publisher:draft`, `/publisher:desk`,
`/publisher:publish`, …). See `packages/claude-plugin/README.md`.
```

- [x] **Step 5: work-status.md**

Add a row `| PLUG-001 | Complete | Claude Code desk plugin: bundled CLI, five commands, three skills, reviewer agent, plugin contract scan |` and update `Last reconciled`.

- [x] **Step 6: Scans and commit**

Run: `pnpm harness:scan` → `[harness] 11 scans passed` (repository-documentation and spec-contract scans read these docs).

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/claude-plugin/README.md docs/agent-operations.md .agents/project-structure.md README.md docs/work-status.md
git add packages/claude-plugin/README.md docs .agents/project-structure.md README.md
git -c core.hooksPath=/dev/null commit -m "docs: Claude Code plugin install, credential flow, and layer row (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 8: Manual verification, gates, spec evidence, PR

**Files:**

- Modify: `.agents/spec-docs/done/PLUG-001-claude-desk-plugin.md` → move to `done/`
- Modify: `.agents/tasks/PLUG-001.md` → move to `completed/`

- [x] **Step 1: Local plugin trial (TC-06)**

Prepare `env.json` + `token` in the scratchpad per the secrets rule (chmod
600), start the production admin locally on port 3300 (`run-admin.sh`), then:

```bash
PUBLISHER_ADMIN_ORIGIN=http://localhost:3300 PUBLISHER_API_TOKEN="$(cat "$S/token")" \
  claude --plugin-dir packages/claude-plugin -p "/publisher:setup" --output-format text
```

Expected: the setup command prints both site ids (`default`, `second-site`).
Then `claude --plugin-dir packages/claude-plugin -p "/publisher:status --site second-site"`
→ a table with the four posts and no post waiting for the desk. Record both
outputs (without the token) in the spec's Evidence Log. Stop the admin and
delete `env.json`/`token`.

- [x] **Step 2: Full gates (TC-07)**

Run: `pnpm build && pnpm typecheck && pnpm test && pnpm harness:scan`
Expected: exit 0; `[harness] 11 scans passed`; harness test file count 46, plugin package tests 8.

- [x] **Step 3: Spec and task records**

Move the spec to `.agents/spec-docs/done/`, set `status: done`, tick TC-01…07,
append GATE evidence entries in the format used by ARCH-006 (command +
observed result per TC, including the `printf %q` → POSIX single-quote
deviation and the content stub). Move this file to
`.agents/tasks/completed/PLUG-001.md` with **Status: completed** and a Result
section. Run `node scripts/harness/scan-spec-contract.mjs`.

- [x] **Step 4: Commit, push, PR**

```bash
git add -A . ':!.claude'
git -c core.hooksPath=/dev/null commit -m "feat: Claude Code desk plugin (PLUG-001)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push origin HEAD
gh pr create --base main --title "feat: Claude Code desk plugin (PLUG-001)" --body "…summary, gates, 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks <n> --watch
gh pr merge <n> --merge && git fetch -q origin main && git merge -q --ff-only origin/main
```

## Progress

### 2026-09-20

- Spec approved by the owner; plan written.
- Tasks 1–7 implemented by fresh subagents with two-stage review each; 16 commits `c4bd5bb`…`c6f00e2`.
- Task 8: gates green (45 files / 230 tests, 11 scans); the plugin was installed from the worktree as a local marketplace and drove a real article from source to publish on an operated instance (see spec TC-06 evidence; details kept privately by the operator); uninstalled afterwards.

## Decisions

- Plan lives here (task record) instead of `docs/superpowers/plans/`, per the
  repository's `.agents` convention.
- `@publisher/content` is stubbed in the bundle (archive commands not
  bundled) to keep `bin/publisher` at ~50 KB instead of ~600 KB.
- The hook quotes with POSIX single quotes instead of `printf %q` so the env
  file is valid for bash and zsh alike.

## Blockers

- None.

## Result

`packages/claude-plugin` ships a dependency-free bundled CLI, five commands,
three skills, a read-only reviewer agent, and a SessionStart credential bridge;
`scan-plugin-contract.mjs` keeps the bundle, the usage table, and every
command reference honest. Installing the plugin and running
`/publisher:draft` → `/publisher:desk` → `/publisher:publish` produced a
desk-approved, published article whose independent review caught a factual
exaggeration before approval.

Follow-ups (not in scope): teach `importsOf` about side-effect imports; make
`emit` in the CLI keep the envelope `code` when `data.code` is present.
