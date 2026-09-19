---
status: done
type: BEHAVIOR
tags: [typescript]
authority: delegated
---

# ARCH-005: Configuration at the composition root

## Problem

After ARCH-003 the `env-access` baseline still held 24 entries: every
Postgres adapter defaulted its pool from `process.env.DATABASE_URL`, every
file adapter defaulted its directory from `ADMIN_DATA_DIR`, `http/auth.ts`
read six variables (`ADMIN_DEV_TOKEN`, `ADMIN_BOOTSTRAP_SECRET`,
`ADMIN_PUBLIC_ORIGIN`, `ADMIN_DATA_DIR`, and dynamic `process.env[name]` for
`ADMIN_OWNERS`/`ADMIN_PUBLISHERS`), `automation-auth.ts` read the keyrings,
`comment-moderation.ts` read the comment service origin and token, and
`packages/persistence/src/media.ts` defaulted its connection string. A module
could therefore behave differently from its parameters alone, and a test had
to mutate `process.env` to exercise an adapter. Reproduce:
`node scripts/harness/scan-env-access.mjs --write-baseline` on commit
`5ae22e2` → 24 entries.

## Architecture Review

### Affected Scope

- L3 composition `apps/admin/app/lib/config.ts` (new: `adminConfig()`,
  `adminDataDirectory()` — the only `process.env` reader under `lib`),
  `apps/admin/app/lib/index.ts` (`adminPool`, `accountStore`,
  `getSiteRegistry`, `getAgentGuidanceRepository`, `mediaDependencies`,
  media wrappers, `deskDependencies`, `restoreArchive`, `buildJobsForSite`),
  `apps/admin/app/lib/repository.ts` (`adminPool`, `useFileStores`).
- L1 `apps/admin/app/lib/adapters/{postgres-content-repository,postgres-article-repository,postgres-plugin-repository,file-content-repository,article-repository-adapter,file-plugin-repository,site-registry,agent-guidance,archive-restore,media-service,account-store}.ts`
  (required pool/directory/dependencies parameters; singletons and
  `dependencies()` removed; `AccountStore` is a class over a pool),
  `packages/persistence/src/media.ts`.
- L4 `apps/admin/app/lib/http/{auth,automation-auth}.ts`, L3
  `services/comment-moderation.ts` (read `adminConfig()`).
- L5 `scripts/harness/__tests__/portable-persistence-integration.test.mjs`
  (media wrappers from the composition root), `scripts/harness/layer-map.json`
  (`repository.ts` listed as a composition root), `layer-baseline.json`.

Sibling scan: `packages/persistence` already exposes `*FromEnvironment`
factories for object storage; `adminConfig()` follows that shape for the
admin. `shouldUseIsolatedFileRepository(environment?)` keeps its optional
environment parameter for the existing contract test.

### Alternatives Considered

1. Keep environment defaults in adapters and list every adapter as a
   composition root. Pro: no code change. Con: the map would describe
   nothing; every adapter would remain untestable without `process.env`.
2. A global config singleton read once at startup. Pro: one read. Con: the
   harness changes the environment between cases and the admin dev server
   reloads modules; a cached object would silently go stale.
3. A typed reader called at composition time, adapters with required
   parameters. Pro: adapters are pure over their inputs; the reader is
   trivial and re-read per call; tests construct adapters with pools they
   own. Con: constructor signatures change and every call site is touched.

### Decision

Alternative 3. `adminConfig()` is the reader; `lib/index.ts` and
`lib/repository.ts` are the only modules that turn configuration into
adapter instances. `NODE_ENV` and `NEXT_PUBLIC_*` remain readable anywhere
per the map (`publisher.ts` keeps its production guard).

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Add `config.ts`; strip environment defaults from adapters; move singleton
factories and the media dependency bundle into the composition root; rewire
`auth.ts` to `accountStore()` and `adminConfig()`; re-key the integration
test; rewrite the `env-access` baseline to zero.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `node scripts/harness/scan-env-access.mjs --write-baseline` → `baseline written with 0 entries`; `grep -rln "process.env" apps/admin/app/lib` → `config.ts`, `index.ts`, `repository.ts`, and `adapters/publisher.ts` (`NODE_ENV` only) and nothing else.
- [x] TC-02: `pnpm typecheck` → 0 errors with `PostgresContentRepository`, `PostgresArticleRepository`, `PostgresPluginRepository`, `PostgresSiteRegistry`, `PostgresAgentGuidanceRepository`, `AccountStore` requiring a pool and file adapters requiring a directory.
- [x] TC-03: `pnpm harness:test` → 44 files / 220 tests pass, including `portable-persistence-integration` through the composition-root media wrappers and `admin-taxonomy-contract`'s `shouldUseIsolatedFileRepository(environment)` cases.
- [x] TC-04: File-backed `next dev` with `ADMIN_DATA_DIR`: `GET /api/posts`, `/api/desk`, `/api/plugins`, `/api/auth/session` → 200; `POST /api/publish` with an `Idempotency-Key` → 202 and `build-jobs.json`/`content.json` under the data directory.

## Test Plan

| TC-ID | Test Type | Tool / Approach                   | Notes                                                                         |
| ----- | --------- | --------------------------------- | ----------------------------------------------------------------------------- |
| TC-01 | gate      | `scan-env-access.mjs`, `grep`     | Baseline goes to zero; only roots and the allowed `NODE_ENV` read remain.     |
| TC-02 | gate      | `pnpm typecheck`                  | Required parameters make missing configuration a compile error at call sites. |
| TC-03 | contract  | `pnpm harness:test`               | Precondition: pglite/s3rver fixtures as today; tests pass pools explicitly.   |
| TC-04 | smoke     | `curl` against `next dev -p 3377` | File stores selected by `ADMIN_DATA_DIR` without `DATABASE_URL`.              |

## Tasks

- [x] `.agents/tasks/completed/ARCH-005.md` — implementation and verification record.

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
`pnpm typecheck` (0), `pnpm harness:scan` (10), `pnpm harness:test` (44 / 220).

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-env-access.mjs --write-baseline`; `grep -rn process.env apps/admin/app/lib`.
Observed result: `[env-access] baseline written with 0 entries`; the only non-root hit is `adapters/publisher.ts:40` (`NODE_ENV`, allowed by `envAllowedNames`).

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `pnpm typecheck`.
Observed result: 0 errors after the constructor changes; the first run listed the removed account-store exports and `auth.ts` was rewired to `accountStore()`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `pnpm harness:test`.
Observed result: `Test Files 44 passed (44)`, `Tests 220 passed (220)`; the first run failed `prefers an explicit isolated file repository outside production` until `shouldUseIsolatedFileRepository` regained its environment parameter.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `curl` against `next dev -p 3377` with `ADMIN_DATA_DIR`, `ADMIN_DEV_TOKEN`, `ADMIN_OWNERS`.
Observed result: posts/desk/plugins/session 200; `POST /api/publish` → 202 with `"mode":"local"`; `ls` shows `build-jobs.json content.json`.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
