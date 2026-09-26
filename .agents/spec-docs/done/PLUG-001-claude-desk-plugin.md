---
status: done
type: FLOW
tags: [cli, typescript, auth]
authority: delegated
---

# PLUG-001: Claude Code plugin for editorial desk operations

## Problem

An operator who wants Claude to run the editorial workflow today has to clone
the monorepo, `pnpm install`, export `PUBLISHER_ADMIN_ORIGIN` and
`PUBLISHER_API_TOKEN`, and remember the `publisher` command grammar and the
EDIT-001 desk rules from `docs/agent-operations.md`. The thumbnail replacement
of one article on an operated publication
took eleven manual CLI invocations (`media upload`, `post update` to `review`,
`desk report`, `desk approve` with six `--check` flags, `post update` to
`published`, `publish`) plus a hand-written approval note. Nothing packages
that procedure so that a Claude Code session can perform it from a fresh
machine, and `docs/agent-operations.md` already promises that
`@publisher/admin-client` is "the reusable counterpart for a Claude plugin"
without any such plugin existing. Reproduce: `ls packages` on `dc70f9e` →
no plugin package; `claude plugin install publisher@publisher` → marketplace
unknown.

## Architecture Review

### Affected Scope

- L5 `packages/claude-plugin/**` (new workspace package
  `@publisher/claude-plugin`): `.claude-plugin/plugin.json`, `bin/publisher`
  (committed esbuild bundle of `packages/ops-cli/bin/publisher.mjs`, zero
  runtime dependencies, node 22 ESM, shebang), `commands/{setup,status,draft,desk,publish}.md`,
  `skills/{publisher-cli,editorial-desk,press-images}/SKILL.md`,
  `agents/desk-reviewer.md`, `hooks/hooks.json` + `scripts/session-env.sh`
  (SessionStart bridge from `userConfig` to the Bash environment),
  `scripts/build.mjs`, `test/bundle.test.mjs`, `test/session-env.test.mjs`,
  `package.json`, `README.md`.
- L5 `.claude-plugin/marketplace.json` (repository root; `plugins[0].source`
  = `./packages/claude-plugin`).
- L5 `scripts/harness/layer-map.json` (new layer `plugin` with allow
  `builtin`, `tooling`; `packages/claude-plugin/bin/**` exempt as a build
  artifact), `scripts/harness/scan-plugin-contract.mjs` (new, eleventh scan
  in `pnpm harness:scan`), `scripts/harness/__tests__/claude-plugin-contract.test.mjs`.
- L5 `package.json` (root `build` includes the plugin build; `harness:scan`
  lists the new scan), `pnpm-workspace.yaml` unchanged (`packages/*`).
- L5 `packages/ops-cli/bin/publisher.mjs`: no behaviour change; the `tsx`
  registration becomes unnecessary once bundled but stays for the unbundled
  CLI.
- Docs: `docs/agent-operations.md` ("Claude plugin" section),
  `.agents/project-structure.md` (layer table row), `README.md` (install).
- `surface-map.json`: no change. The plugin is a consumer of the CLI surface,
  not a fourth access surface.

Sibling scan: `packages/ops-cli` is the existing L5 operator and keeps the
`publisher` bin name for workspace use; the plugin's `bin/publisher` is the
same program bundled, so a user with both on `PATH` runs identical code. The
plugin name `publisher` namespaces commands as `/publisher:<command>`, which
does not collide with any built-in or installed plugin command in this
repository (`.claude/` holds only `launch.json`). Skill names are prefixed
`publisher-`/`editorial-`/`press-` to stay distinct from the repository's
`.agents/skills/*` harness skills. The desk-reviewer agent is namespaced
`publisher:desk-reviewer`.

### Alternatives Considered

1. Committed bundle in `bin/` + `userConfig` credentials (chosen). Pro:
   `git clone` of the marketplace is the whole installation; the CLI's
   environment-only credential contract is preserved through
   `CLAUDE_PLUGIN_OPTION_*`; the token lives in the OS keychain
   (`sensitive: true`). Con: a ~40 KB generated file is committed and must be
   kept current — mitigated by the harness rebuild-and-compare gate.
2. `npx @publisher/ops-cli` from npm. Pro: no generated file in git. Con:
   requires publishing three currently private packages (`ops-cli`,
   `admin-client`, `content`) and keeping their versions aligned; fails
   offline and in registries that block public npm.
3. Plugin requires a monorepo checkout and runs `pnpm publisher`. Pro: zero
   duplication. Con: the user must clone and `pnpm install` before the
   plugin works, which defeats "installable from Claude Code".
4. MCP server exposing `admin-client` methods as tools. Pro: structured tool
   calls. Con: introduces a fourth access surface that `surface-map.json`
   would have to track for parity; the skills would still need the workflow
   rules. Rejected by the owner on 2026-09-20 in favour of skills over the CLI.

### Decision

Alternative 1. The plugin is a thin operator over the CLI: commands describe
the order of CLI calls, skills hold the editorial rules, and every mutation
still passes through the admin's desk gate. Concretely:

- `plugin.json` `userConfig`: `admin_origin` (string, required) and
  `api_token` (string, required, `sensitive: true`, stored in the OS
  keychain). Per the plugin reference these values reach hook processes as
  `CLAUDE_PLUGIN_OPTION_<KEY>` but "aren't present in the environment of
  commands Claude runs through the Bash tool". The documented bridge is
  `CLAUDE_ENV_FILE`: a `SessionStart` hook (`scripts/session-env.sh`,
  matchers `startup|resume|clear|compact`) appends
  `export PUBLISHER_ADMIN_ORIGIN=<quoted>` and
  `export PUBLISHER_API_TOKEN=<quoted>` to `$CLAUDE_ENV_FILE`, which Claude
  Code sources before every Bash command. The hook writes nothing and exits 0
  when either option is empty or contains CR/LF, quotes values as POSIX
  single-quoted literals (`'\''` escaping — `printf %q` is bash-only), appends
  rather than truncates so other hooks' variables survive, and never prints
  the values.
  Commands and skills then call `publisher …` with no credential handling of
  their own; the token is never passed as an argument, echoed, or written
  anywhere but the session env file that Claude Code owns. `README.md` states
  this trade-off (keychain at rest, session env file while a session runs).
- `/publisher:publish` ends at the server-side publish operation
  (`publish` → `operation get` until terminal). Static deployment
  (`scripts/deploy/publication-worker.ts`, `wrangler`) is out of scope
  because the CLI contract forbids direct database, storage, and hosting
  provider access and a desk token must not carry infrastructure authority.
- `desk-reviewer` is a read-only subagent
  (`disallowedTools: [Write, Edit, NotebookEdit]`, forbidden from running
  `desk approve`) that re-reads the report, body, sources, and image in a
  fresh context and returns per-item evidence; the main session performs the
  single `desk approve` with per-item evidence in a `--checklist-file` (the
  `--check <id>` flags are the equivalent form) and warn confirmations in
  `--note`. There is no override path: after three improvement iterations the
  command reports to the user (EDIT-001).
- `scan-plugin-contract.mjs` enforces: manifest validity and `source` path
  existence; `bin/publisher` byte-equal to a fresh build; every
  `publisher <verb> [<noun>]` mentioned in commands/skills/agents appears in
  the CLI usage list; no `--token` argument pattern or literal token
  assignment in plugin content; `CLAUDE_PLUGIN_OPTION_API_TOKEN` is
  referenced only in `scripts/session-env.sh`.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Add `packages/claude-plugin` with the manifest, five commands, three skills,
one agent, an esbuild script that writes `bin/publisher` and regenerates the
command table inside `skills/publisher-cli/SKILL.md` from the CLI usage
output, and a bundle smoke test. Add the root marketplace manifest, the
`plugin` layer, and the plugin contract scan. Document installation and the
publish boundary.

Command behaviour (each step is one `publisher … --json --non-interactive`
call; the JSON envelope `code` drives the branch):

| Command                                         | Flow                                                                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/publisher:setup`                              | `doctor` → on `CONFIGURATION_REQUIRED`/`REMOTE_ERROR` show the envelope and point to plugin settings; success = `site list` returns sites.                                                                                         |
| `/publisher:status [--site]`                    | `site list` → `desk list` per site → `status`.                                                                                                                                                                                     |
| `/publisher:draft <source-url> --site --author` | `site guidance get` → `post plan` → read the source → draft per `editorial-desk` → `press-images` sourcing → `media upload --mime-type` → `post create` (status `review`) → suggest `/publisher:desk`.                             |
| `/publisher:desk <post-id> --site`              | `desk report` → `post get` → fix non-pass items via `post update --revision` (≤ 3 loops) → `publisher:desk-reviewer` evidence → `desk approve --checklist-file` → `DESK_APPROVED`, or report to the user.                          |
| `/publisher:publish --site`                     | `post update {"status":"published"}` for approved posts → `publish --idempotency-key <site>-<yyyymmdd>-<n>` → `operation get` until terminal. States that static deployment is performed by the operations worker, not the plugin. |

Error mapping: `revision_conflict` → reload once and retry; `desk_checks_failed`
→ improvement loop; `AUTHORITY_REQUIRED`, `NON_INTERACTIVE_REQUIRED`,
`CONFIGURATION_REQUIRED` → hand to the user.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `pnpm --filter @publisher/claude-plugin build` → writes `packages/claude-plugin/bin/publisher` with a `#!/usr/bin/env node` first line, no `import` of a bare specifier other than `node:*`, and `skills/publisher-cli/SKILL.md` contains one table row per command in the CLI usage list.
- [x] TC-02: `node packages/claude-plugin/bin/publisher` with no arguments → stdout envelope `code: "USAGE"`; with no environment → `code: "CONFIGURATION_REQUIRED"` listing `PUBLISHER_ADMIN_ORIGIN` and `PUBLISHER_API_TOKEN`; against a recording HTTP server `desk report --site s --post p --json` → exactly one `GET /api/v2/sites/s/posts/p/desk` with a bearer header, and the token value does not appear in stdout.
- [x] TC-03: `node scripts/harness/scan-plugin-contract.mjs` → exit 0 on a clean tree; after appending a byte to `bin/publisher` → exit 1 with `stale bundle`; after adding `publisher post frobnicate` to a command file → exit 1 naming the unknown command; after adding `--token abc` to a skill → exit 1 with `credential in arguments`.
- [x] TC-04: `node scripts/harness/scan-layer-imports.mjs` → exit 0 with `packages/claude-plugin/scripts/build.mjs` allowed to import `esbuild` (tooling) and a temporary import of `../../content/src/index.ts` from a command script reported as a violation.
- [x] TC-05: `CLAUDE_ENV_FILE=$tmp CLAUDE_PLUGIN_OPTION_ADMIN_ORIGIN=https://a.example CLAUDE_PLUGIN_OPTION_API_TOKEN='p w$1' sh scripts/session-env.sh` → exit 0 and `$tmp` gains exactly two `export` lines whose values are shell-quoted so that sourcing the file yields the original strings; with either variable unset → exit 0 and `$tmp` unchanged; stdout is empty in both cases.
- [x] TC-06: `python3 -c "import json;json.load(open('.claude-plugin/marketplace.json'))"` and `plugin.json` parse; `claude --plugin-dir packages/claude-plugin` lists `/publisher:setup`, `/publisher:status`, `/publisher:draft`, `/publisher:desk`, `/publisher:publish` and agent `publisher:desk-reviewer`; `/publisher:setup` against the local production admin on port 3300 prints both site ids.
- [x] TC-07: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` → exit 0 with `[harness] 11 scans passed`.

## Test Plan

| TC-ID | Test Type | Tool / Approach                                        | Notes                                                                                                              |
| ----- | --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| TC-01 | gate      | build script + `head -1`, `grep`                       | Bundle is self-contained; SKILL table is generated, never hand-edited.                                             |
| TC-02 | contract  | `test/bundle.test.mjs` (vitest, child process)         | Same recording-server pattern as `agent-operations-cli-contract.test.mjs`; precondition: env set only in the test. |
| TC-03 | gate      | `claude-plugin-contract.test.mjs` mutating a temp copy | Scan runs against a copied tree so the working tree is untouched.                                                  |
| TC-04 | gate      | `scan-layer-imports.mjs`                               | New `plugin` layer; `bin/**` exempt.                                                                               |
| TC-05 | unit      | `test/session-env.test.mjs` (vitest, child sh)         | Sources the produced file in a second `sh` to prove round-trip quoting; asserts empty stdout.                      |
| TC-06 | manual    | `claude --plugin-dir` + local admin on 3300            | Precondition: production `env.json`/`token` prepared per the secrets rule and deleted afterwards.                  |
| TC-07 | gate      | workspace gates                                        | Full run before the PR.                                                                                            |

## Tasks

- [x] `.agents/tasks/completed/PLUG-001.md` — implementation plan and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-20

**Status upgrade:** draft → review-ready
Problem cites the manual eleven-step procedure and the unfulfilled admin-client promise; four alternatives; decision fixes the credential bridge, the publish boundary, the reviewer agent, and the scan rules; TC-01–07 have rows.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-20

**Status upgrade:** review-ready → approved
`authority: delegated`. Owner replies in session: "타당한 근거와 함께 추천안을 제시하면 그게 타당할경우 승인합니다", "좋아 승인함" (design sections 1–3), "승인함" (written spec).

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-20

**Status upgrade:** approved → in-progress
Plan: `.agents/tasks/PLUG-001.md` (8 tasks).

### [GATE-VERIFY] — ✅ PASS | 2026-09-20

**Status upgrade:** in-progress → verifying
Eight plan tasks executed with a fresh implementer subagent each and two-stage review (spec compliance, then code quality) per task; every review finding was fixed and re-reviewed before the next task. Commits `c4bd5bb`…`c6f00e2`.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-20

Command: `pnpm --filter @publisher/claude-plugin build`; `head -1 packages/claude-plugin/bin/publisher`; `node packages/claude-plugin/scripts/build.mjs --check`.
Observed result: `[plugin-build] bin/publisher 51135 bytes; unchanged`; `#!/usr/bin/env node`; only `node:` imports (the build itself now rejects any other bare import); 37 usage rows (the two unbundled `content …` commands are filtered by `NOT_BUNDLED`); `--check` exit 0 from the repository root and from the package directory (`absWorkingDir` pins esbuild's path comments).

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-20

Command: `pnpm --filter @publisher/claude-plugin test`.
Observed result: `bundle.test.mjs` 5 passed — USAGE envelope (exit 10), `CONFIGURATION_REQUIRED` with both variable names (exit 20), exactly one `GET /api/v2/sites/s/posts/p/desk` with `Bearer <token>` and the token absent from stdout, `content inspect` on a real `archive.json` → `ARCHIVE_INVALID`, stub marker string present in the bundle. The helper uses async `spawn` (a `spawnSync` parent starves the in-process recording server).

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-20

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/claude-plugin-contract.test.mjs`.
Observed result: 9 passed on temp copies of the plugin tree — clean tree exit 0; appended byte → `stale bundle`; edited table → `stale usage table`; `publisher post frobnicate` → `unknown command: publisher post frobnicate`; `publisher frobnicate` → `unknown command: publisher frobnicate`; `publisher content inspect` → `not bundled`; `--token abc` → `credential in arguments` and `token reference outside scripts/session-env.sh`; missing marketplace source; non-sensitive `api_token`. (The planned filename `plugin-contract.test.mjs` already held the plugin-registry tests, so the new file is `claude-plugin-contract.test.mjs`.)

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-20

Command: `node scripts/harness/scan-layer-imports.mjs`; then a named import of `../../content/src/index.ts` appended to `packages/claude-plugin/scripts/tsx-stub.mjs`, scan, `git checkout`.
Observed result: `[layer-imports] no new violations (0 baseline entries remain)`; with the probe: `packages/claude-plugin/scripts/tsx-stub.mjs -> ../../content/src/index.ts — plugin may not import contract`, exit 1; `esbuild` accepted as `tooling`. Follow-up noted: `importsOf` does not parse side-effect imports (`import 'x'`), a pre-existing scanner blind spot.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-20

Command: `pnpm --filter @publisher/claude-plugin test` (`session-env.test.mjs`).
Observed result: 6 passed — round-trip of `p w$1'x"y\z` through `sh`, `bash`, and `zsh`; trailing slash stripped; three missing-option combinations and a CR/LF-bearing token write nothing (exit 0, empty stdout and stderr); no `CLAUDE_ENV_FILE` → exit 0; read-only env file → exit 1 with only the path on stderr.

### [GATE-COMPLETE: TC-06] — ✅ | 2026-09-20

Command: `claude plugin marketplace add <worktree>`; `claude plugin install publisher@publisher --scope user --config admin_origin=http://localhost:3300 --config api_token=<session key>`; then headless `claude -p "/publisher:setup"`, `/publisher:status --site second-site`, `/publisher:draft <source-url> --site second-site --author example-desk`, `/publisher:desk <post-id> --site second-site --image <file> --image-source <url>`, `/publisher:publish --site second-site --post <post-id>` against an operated instance's admin running locally on port 3300 (credentials in the scratchpad, deleted afterwards).
Observed result: setup printed both configured sites through the keychain → SessionStart hook → `CLAUDE_ENV_FILE` → `bin/publisher` chain; status showed an empty desk queue; draft created a `post-admin-…` post (revision 1, `review`, official press image uploaded and approved); desk ran the report (all pass), dispatched `publisher:desk-reviewer`, which objected to a factual exaggeration against the source, the command patched body/excerpt/SEO (revision 3), re-dispatched, received `VERDICT: ready`, and approved via `--checklist-file` (revision 4, `approvalValid: true`); publish set the post published (revision 5) and accepted an operation, then reported the 5-minute `queued` cap with the resume command — the intended boundary. The operations worker then built a release and `wrangler pages deploy` shipped it; `publisher operation get <operation-id> --site second-site` → `state.operation.status: published`, `terminal: true`; the public article rendered with its image. Operation, release, post, and URL evidence is kept privately by the operator. Plugin and local marketplace uninstalled afterwards. Follow-up noted: the CLI has no `post get`, so `/publisher:desk` fetched the body with a no-op `post update` patch.

### [GATE-COMPLETE: TC-07] — ✅ | 2026-09-20

Command: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.
Observed result: build unchanged bundle; 0 type errors; `Test Files 45 passed (45)`, `Tests 230 passed (230)` plus package suites (admin-client 3, claude-plugin 11); `[harness] 11 scans passed`.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-20

**Status upgrade:** verifying → done

### [GATE-COMPLETE: follow-up] — ✅ | 2026-09-20

Final review: `post get` added to the CLI (`POST` envelope) so `/publisher:desk` reads the body without a mutation; `desk approve` usage documents `--checklist-file`; decision text aligned with the shipped `--checklist-file` attestation. Gates re-run: 11 scans, harness tests, plugin tests, `build.mjs --check`.

### [GATE-COMPLETE: TC-06, second site] — ✅ | 2026-09-20

Command: plugin reinstalled from the worktree marketplace with the `post get` bundle; headless `/publisher:status` (no `--site`), `/publisher:draft <source-url> --site default --author example-desk`, `/publisher:desk <post-id> --site default --image <file> --image-source <url>`, `/publisher:publish --site default --post <post-id>` with the operations worker run during the poll; then `wrangler pages deploy` for the site's Pages project.
Observed result: status listed both sites with their desk counts in one table; draft created a `post-admin-…` post (official press asset); desk read the body through `post get` (no mutation — revision stayed 1 until approval), 15 checks pass with `site.guidance` warn recorded in the note, reviewer `VERDICT: ready`, approved via `--checklist-file` (revision 2); publish observed the operation reach `state.operation.status: published`, `terminal: true` inside its polling window (revision 3); the article was live; `operation get` on both sites → `published`/terminal (verified on an operated instance; evidence kept privately by the operator). Plugin and marketplace uninstalled, local admin stopped, credentials deleted.

### [GATE-COMPLETE: TC-04, side-effect imports] — ✅ | 2026-09-26

Follow-up from the TC-04 evidence: `importsOf` in `scripts/harness/layer-common.mjs` now parses side-effect imports (`import 'x'` / `import "x"`, `typeOnly: false`), and the static clause no longer spans a quote, so a side-effect import cannot swallow the `from` of the import after it. `layer-contract.test.mjs` proves a bare (`import 'pg'` in `contract` → `sdk module`) and a relative (`import '../../content/src/index.ts'` from `packages/claude-plugin/scripts/tsx-stub.mjs` → `plugin may not import contract`) side-effect import are reported.
Observed result: the TC-04 probe re-run on the real tree → `packages/claude-plugin/scripts/tsx-stub.mjs -> ../../content/src/index.ts — plugin may not import contract`, exit 1; without the probe `[layer-imports] no new violations (0 baseline entries remain)` — the only side-effect imports in the tree (`apps/admin/app/layout.tsx` → `./globals.css`, `apps/site/app/layout.tsx` → `./styles.css`) stay inside their own layer, so `layer-baseline.json` remains `[]`. Gates: `pnpm build`, `pnpm typecheck`, `pnpm test` (49 files, 260 tests), `pnpm harness:scan` (`[harness] 12 scans passed`).
