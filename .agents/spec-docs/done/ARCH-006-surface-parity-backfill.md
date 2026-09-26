---
status: done
type: API
tags: [rest, cli, typescript]
authority: delegated
---

# ARCH-006: Surface parity backfill

## Problem

`scan-surface-parity.mjs` recorded 17 gaps between the three access
surfaces, and one `layer-imports` entry remained for the CLI:

- 10 automation routes absent from `docs/admin-api.openapi.yaml`
  (`sites`, `sites/{siteId}`, `bootstrap`, `agent-guidance`, `categories`,
  `categories/{slug}`, `content-restore`, `embeds/x`, `media`,
  `operations/{id}`, `posts/{id}/desk`); the document also declared
  `/posts` and `/publish` twice.
- No CLI command for settings, site update/archive, post delete, plugins,
  article locales, or standalone media upload/approve; no client method for
  plugins or article locales (6 `missing surface` entries).
- `packages/ops-cli/bin/publisher.mjs` imported
  `../../content/src/archive.ts` by relative path instead of the package.

Reproduce on `6544295`: `node scripts/harness/scan-surface-parity.mjs
--write-baseline` → 17 entries.

## Architecture Review

### Affected Scope

- L5 `docs/admin-api.openapi.yaml` (22 unique paths, new request bodies,
  responses and schemas for sites, guidance, desk, media, embeds,
  operations, restore), `docs/admin-api.md` (endpoint rows),
  `docs/agent-operations.md` (new commands).
- L5 `packages/admin-client/src/client.js`, `index.d.ts`, `client.test.ts`
  (`listPlugins`, `createPlugin`, `getPlugin`, `configurePlugin`,
  `runPluginAction`, `getArticle`, `putArticleVariant`,
  `deleteArticleVariant`).
- L5 `packages/ops-cli/bin/publisher.mjs`, `package.json` (`settings
get|set`, `site update|archive`, `post delete`, `plugin
list|get|install|configure|validate|enable|disable`, `article
get|set|remove`, `media upload|approve`; `@publisher/content` dependency
  and alias import), `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`.
- L5 `scripts/harness/surface-map.json` (registrations),
  `scripts/harness/layer-map.json` (`cli` may import `index:contract`),
  `scripts/harness/layer-baseline.json` (empty).

Sibling scan: every new command follows the existing `--site`, `--revision`,
`--input <file>`, `--non-interactive` conventions and the `INPUT_REQUIRED`
/ `NON_INTERACTIVE_REQUIRED` / `REMOTE_ERROR` envelopes; client methods
follow the existing `request()` helper with `if-match` quoting.

### Alternatives Considered

1. Declare the missing surfaces exclusive. Pro: no code. Con: plugins,
   locales, settings and media are ordinary content administration that
   the owner asked to be reachable from API, CLI and admin page alike.
2. Generate the client and CLI from the OpenAPI document. Pro: parity by
   construction. Con: a generator plus a build step for a 23-operation
   API; the parity scan already fails on drift.
3. Hand-write the missing operations, document them, and let the parity
   scan keep them aligned. Chosen.

### Decision

Alternative 3. The CLI may import the content package's public index for
pure contract logic (archive validation before upload); it still never
opens a database, object store, or provider API.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Document every `v2` route, add the client methods and CLI commands, register
them in `surface-map.json`, switch the CLI's archive import to the package,
and empty the baseline.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `docs/admin-api.openapi.yaml` parses with unique keys, has 22 paths, and every `$ref` resolves; `node scripts/harness/scan-surface-parity.mjs` reports no `undocumented v2 route`.
- [x] TC-02: `node scripts/harness/scan-surface-parity.mjs --write-baseline` → `baseline written with 0 entries`; `layer-imports` also writes 0 entries; `layer-baseline.json` is `[]`.
- [x] TC-03: `agent-operations-cli-contract.test.mjs` "covers every automation capability with a command that maps to one v2 operation" → 15 commands each produce exactly one request to the documented method and path with a quoted `If-Match`, and a mutation without `--non-interactive` emits `NON_INTERACTIVE_REQUIRED` with no request.
- [x] TC-04: `packages/admin-client` test "mirrors the plugin and article-locale operations one to one" → 8 calls to the documented methods and paths.
- [x] TC-05: `pnpm typecheck`, `pnpm harness:scan`, `pnpm harness:test` → 0 errors, 10 scans, 44 files / 221 tests.

## Test Plan

| TC-ID | Test Type | Tool / Approach                              | Notes                                                                            |
| ----- | --------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| TC-01 | gate      | `yaml` parse with `uniqueKeys` + `$ref` walk | Duplicate `/posts` and `/publish` keys removed; refs checked against components. |
| TC-02 | gate      | parity + import scans                        | Empty baseline is the end state of ARCH-001..006.                                |
| TC-03 | contract  | CLI test against a recording HTTP server     | Precondition: `PUBLISHER_ADMIN_ORIGIN`/`PUBLISHER_API_TOKEN` set to the fake.    |
| TC-04 | unit      | `client.test.ts` with an injected fetch      | Method, URL, `If-Match`, and action body asserted.                               |
| TC-05 | gate      | workspace gates                              | Full run before the PR.                                                          |

## Tasks

- [x] `.agents/tasks/completed/ARCH-006.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: delegated`; standing delegation recorded in ARCH-001.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `node -e` with the workspace `yaml` package (`uniqueKeys: true`) and a `$ref` walk; `node scripts/harness/scan-surface-parity.mjs`.
Observed result: `22 paths`, `missing refs []`; no `undocumented v2 route` line.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `--write-baseline` for `layer-imports` and `surface-parity`; `cat scripts/harness/layer-baseline.json`.
Observed result: both `baseline written with 0 entries`; file content `[]`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`.
Observed result: `Tests 10 passed (10)`; the first run exposed that the non-interactive guard did not stop the command (two envelopes on stdout) and the guard was fixed to return a boolean before re-running.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `pnpm --filter @publisher/admin-client test`.
Observed result: `Tests 3 passed (3)`.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-19

Command: `pnpm typecheck`, `pnpm harness:scan`, `pnpm harness:test`, prettier check.
Observed result: 0 type errors; `[harness] 10 scans passed`; `Test Files 44 passed (44)`, `Tests 221 passed (221)`; formatting clean.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
