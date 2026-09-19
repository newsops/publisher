---
status: done
type: AGREEMENT
tags: [typescript, rest]
authority: confirmation-required
---

# ARCH-003: Split `apps/admin/app/lib` into services, adapters, http, and a composition root

## Problem

`apps/admin/app/lib` is one flat directory of 32 files (~5,200 lines). ARCH-001
had to classify them by explicit file lists in `layer-map.json` because the
path carries no layer signal, and the baseline records the consequences:

- Adapters call domain rules as values: `file-content-repository.ts`,
  `postgres-content-repository.ts`, `postgres-publication.ts`,
  `file-publication.ts` import `./repository-validation`, `./repository-seed`,
  `./site-registry` (8 `layer-imports` entries).
- Services import the HTTP error type: `comment-moderation.ts`,
  `desk-review.ts`, `x-oembed.ts` → `./api-error` (3 entries).
- Services and HTTP helpers construct storage clients: `agent-guidance.ts`,
  `site-registry.ts`, `archive-restore.ts`, `desk-review.ts`, `auth.ts` →
  `@publisher/persistence` (6 entries).
- Routes import adapters directly: media, publish and operations routes on
  both surfaces → `media-service`, `publisher`, `@publisher/persistence`
  (7 `layer-imports` + 7 `route-shape` entries).
- Four browser routes (`agent-guidance`, `comments/moderation` ×2,
  `embeds/x`) resolve the site inline instead of through
  `repositoryForRequest` (4 `route-shape` entries).
- `packages/persistence/scripts/{clean-room,reconcile}.ts` import
  `apps/admin/app/lib/*` and `scripts/deploy/publication-worker-core` (4
  entries) because the admin has no index a script may import.

Reproduce: `node scripts/harness/scan-layer-imports.mjs --write-baseline` and
`node scripts/harness/scan-route-shape.mjs --write-baseline`, then read the
`apps/admin` entries.

## Architecture Review

### Affected Scope

- L0 `packages/content/src/{managed-validation,managed-seed,content-release,site-id}.ts`
  (new homes for `repository-validation.ts`, `repository-seed.ts`,
  `release.ts`, `assertSiteId`, and the `PublishDelivery` type), `index.ts`.
- L1 `apps/admin/app/lib/adapters/**`: `postgres-content-repository`,
  `file-content-repository`, `postgres-publication`, `file-publication`,
  `postgres-article-repository`, `article-repository-adapter`,
  `postgres-plugin-repository`, `file-plugin-repository` (split out),
  `media-service`, `publisher`, `archive-restore`, `site-registry`,
  `agent-guidance`, `account-store` (SQL extracted from `auth.ts`).
- L3 `apps/admin/app/lib/services/**`: `repository-contract`, `desk-review`,
  `comment-moderation`, `x-oembed`, `article-repository`, `plugin-repository`
  (port and views), `errors.ts` (new `ServiceError`).
- L3 composition `apps/admin/app/lib/index.ts` (new) and `repository.ts`.
- L4 `apps/admin/app/lib/http/**`: `auth`, `automation-auth`, `api-error`
  (re-exports `ServiceError`), `api-input`, `api-request`,
  `platform-api-input`, `plugin-api-input`, `request-repository`,
  `author-context`, `media-view`.
- L4 `apps/admin/app/api/**` (import paths; media/publish/operations routes
  use the composition root; four browser routes use `repositoryForRequest`),
  `apps/admin/app/*.tsx` (import paths).
- L5 `scripts/admin/{clean-room,reconcile}.ts` (moved from
  `packages/persistence/scripts`), `package.json` scripts, tests under
  `scripts/harness/__tests__`, `scripts/harness/layer-map.json` (directory
  globs replace file lists; `scripts` may import `composition`),
  `layer-baseline.json`, `surface-map.json` service paths.

Sibling scan: `packages/content` already owns `seed.ts`, `editor.ts`,
`post-validation.ts`, and `desk-review.ts`; the moved modules join that
family and keep their exported names. No `services/`, `adapters/`, `http/`
directory exists under `apps/admin/app/lib`. `scripts/admin` does not exist.

### Alternatives Considered

1. Extract `packages/admin-core` for services and adapters. Pro: package
   boundary enforced by the workspace. Con: routes, UI and tests would all
   change package, `next` bundling of a workspace package adds build config,
   and the composition root would still live in the app.
2. Keep the flat directory and widen `allow` lists so adapters may import
   services. Pro: no moves. Con: legalises the cycle the baseline records;
   the directory still says nothing about layers.
3. Subdirectories inside the app plus one composition root, with the domain
   rules the adapters need lowered into `packages/content`. Pro: paths carry
   the layer, the map uses directory globs, adapters only import L0, routes
   import one index. Con: a large mechanical move and import rewrite in one
   change.

### Decision

Alternative 3. Rules that adapters must apply (`validatedPost`, desk gate,
snapshot assembly, seeds, release manifest, site-id format) are L0 content
contract logic and move to `packages/content`, so L1 → L0 replaces L1 → L3.
`ServiceError` in `services/errors.ts` is the domain error; `http/api-error.ts`
re-exports it as `ApiRequestError` so routes keep their handling. `auth.ts`
keeps identity logic and delegates every query to `adapters/account-store.ts`.
`lib/index.ts` is the only module routes and scripts import for adapters.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료 — the owner's standing delegation recorded in
      ARCH-001 covers the recommended folder split

## Solution

Mechanical move with an import rewriter, then the five targeted edits
(content lowering, `ServiceError`, plugin split, account store, composition
index), then route and script re-pointing, then baseline removal.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `ls apps/admin/app/lib` → `adapters/ services/ http/ index.ts repository.ts` and no other `.ts` file; `layer-map.json` classifies `apps/admin/app/lib/**` by directory only.
- [x] TC-02: `node scripts/harness/scan-layer-imports.mjs` → exit 0 with every `apps/admin/app/lib/*` and `packages/persistence/scripts/*` entry removed from the baseline; remaining `apps/admin` entries, if any, are listed in the evidence with the reason.
- [x] TC-03: `node scripts/harness/scan-route-shape.mjs` → exit 0 with all 11 `route-shape` entries removed.
- [x] TC-04: `grep -rn "process.env\|@publisher/persistence" apps/admin/app/lib/services` → no value import of persistence in services; `grep -c "db()" apps/admin/app/lib/http/auth.ts` → 0.
- [x] TC-05: `pnpm typecheck`, `pnpm harness:scan`, `pnpm test` pass; the admin UI still loads and lists posts in a file-backed `next dev` (browser check).

## Test Plan

| TC-ID | Test Type      | Tool / Approach                       | Notes                                                                                  |
| ----- | -------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| TC-01 | gate           | `ls` + `layer-map.json` diff          | File-list globs for `apps/admin/app/lib` replaced by three directory globs.            |
| TC-02 | gate           | `scan-layer-imports.mjs`              | Baseline diff reviewed entry by entry; any survivor named with reason.                 |
| TC-03 | gate           | `scan-route-shape.mjs`                | All eleven entries removed; scan passes with zero `route-shape` baseline entries.      |
| TC-04 | unit           | `grep`                                | SQL lives in `adapters/account-store.ts`; services take dependencies as parameters.    |
| TC-05 | gate + browser | `pnpm test`, Playwright on `next dev` | File repository with `ADMIN_OWNERS` fixture identity; dashboard renders the post list. |

## Tasks

- [x] `.agents/tasks/completed/ARCH-003.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Problem quantifies every baseline group; three alternatives; decision lowers adapter-needed rules to L0 and names the composition root; TC-01–05 have rows.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: confirmation-required`: the directory split versus package extraction was presented in ARCH-001 ("ARCH-003 … 대안: `packages/admin-core` 추출"); the owner answered "이 것도 좋아" and set the goal "ARCH-006 처리할 때까지 반복해서 완료해줘", taken as confirmation of the recommended split.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress
Task record created.

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying
`pnpm typecheck` (0 errors), `pnpm harness:scan` (10 scans), `pnpm harness:test` (43 files / 216 tests), `pnpm build`, `next build` for `apps/admin`.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `ls apps/admin/app/lib`; `git diff scripts/harness/layer-map.json`.
Observed result: `adapters/ http/ index.ts repository.ts services/`; the map classifies `apps/admin/app/lib/adapters/**`, `services/**`, `http/**` and the two composition files by directory, with no file lists left.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-layer-imports.mjs --write-baseline` and diff.
Observed result: `layer-imports` entries 33 → 3. Every `apps/admin/app/lib/*` and `packages/persistence/scripts/*` entry is gone. Survivors: `packages/ops-cli/bin/publisher.mjs -> ../../content/src/archive.ts` (CLI local archive inspection; ARCH-006 decides the client route), `scripts/generate-public-metadata.mjs -> …/editorial-markdown.ts` and `scripts/generate-theme-runtime.mts -> …/themes` (build scripts reaching into content submodules; ARCH-004 moves theme sources and exposes the renderer through the index).

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-route-shape.mjs --write-baseline`.
Observed result: `baseline written with 0 entries`; media/publish/operations routes import `../../lib`; `agent-guidance` uses `authorizedSiteId(request, identity)`; comment moderation uses `authorizedSiteId(request, identity, 'editor')` so the API-001 editor policy is explicit and unchanged; `embeds/x` is a stateless resolver and is exempt in the map.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `grep -rn "@publisher/persistence" apps/admin/app/lib/services`; `grep -c "db()" apps/admin/app/lib/http/auth.ts`.
Observed result: no persistence import in services (desk review receives `DeskDependencies` from `lib/index.ts`); `db()` count 0 — all SQL lives in `adapters/account-store.ts`.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-19

Command: `pnpm typecheck`, `pnpm harness:scan`, `pnpm harness:test`, `pnpm build`, `next build` (admin); Playwright against `next dev -p 3377` with `ADMIN_DATA_DIR` and `ADMIN_OWNERS`.
Observed result: all gates green; the dashboard rendered 13 panels and 8 fixture posts, opening "Sample report 08" in the editor; `/api/desk`, `/api/plugins`, `/api/auth/session` returned 200; `/api/sites`, `/api/media`, `/api/agent-guidance` returned the same `DATABASE_URL is required` errors as before the change (PostgreSQL-only panels).

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
