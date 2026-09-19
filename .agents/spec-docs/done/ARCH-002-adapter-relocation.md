---
status: done
type: BEHAVIOR
tags: [typescript]
authority: delegated
---

# ARCH-002: Move image analysis and the build-job repository into adapters

## Problem

Two baseline entries in `scripts/harness/layer-baseline.json` name code that
sits in the wrong layer:

1. `apps/admin/app/lib/desk-review.ts -> sharp`: the desk service decodes
   pixels with the native `sharp` SDK, while every other decode lives in
   `packages/persistence/src/media.ts` (L1). Reproduce with
   `node scripts/harness/scan-layer-imports.mjs --write-baseline` and read the
   entry.
2. `scripts/deploy/publication-worker.ts -> ../../apps/admin/app/lib/build-job-repository`:
   the deployment worker (L5) dynamically imports an application-private
   module. `PostgresBuildJobRepository` and `FileBuildJobRepository` are
   storage adapters (L1) that also re-check the L2 job state machine
   (`assertBuildJobTransition`), so they import an L2 value and default their
   pool from `process.env.DATABASE_URL` (an `env-access` baseline entry).

## Architecture Review

### Affected Scope

- L1 `packages/persistence/src/media.ts` (gains `analyseImagePixels`),
  `packages/persistence/src/build-jobs.ts` (new: both repositories, type-only
  publication imports, no environment default), `packages/persistence/src/index.ts`.
- L2 `packages/publication/src/build-job.ts` (gains
  `guardBuildJobTransitions`, the transition guard as a wrapper), `index.ts`.
- L3 `apps/admin/app/lib/desk-review.ts` (imports the analysis from the
  package index; no `sharp`).
- L1 `apps/admin/app/lib/{file-content-repository,postgres-content-repository,postgres-publication,file-publication}.ts`
  (import repositories from `@publisher/persistence`);
  `apps/admin/app/lib/build-job-repository.ts` deleted.
- L5 `scripts/deploy/publication-worker.ts` (composes
  `guardBuildJobTransitions(new PostgresBuildJobRepository(pool))`).
- Tests: `scripts/harness/__tests__/{desk-review-contract,portable-persistence-integration}.test.mjs`;
  `scripts/harness/layer-baseline.json` shrinks.

Sibling scan: `packages/persistence` already owns `PostgresMediaRepository`
and `sharp`; `packages/publication/src/build-job.ts` already exports the
`BuildJobRepository` port, `assertBuildJobTransition`, and an in-memory
repository that applies the guard. No other module named `build-jobs` exists.

### Alternatives Considered

1. Move both repositories into `packages/publication` next to the port.
   Pro: port and implementations together. Con: L2 would import `pg`
   helpers as values (a new L2 → L1 edge), and publication is meant to be
   storage-free.
2. Keep the repositories in `apps/admin` and export them from a package-like
   index the worker can import. Pro: smallest diff. Con: the worker still
   depends on an application, and `apps/admin` would grow a public surface.
3. Storage in L1 without domain rules, rule as an L2 wrapper, composition at
   the roots. Pro: each piece sits in its layer; the guard is applied once at
   composition instead of duplicated in every adapter. Con: callers that
   construct a repository must remember the wrapper — mitigated by the
   worker being the only caller that transitions jobs.

### Decision

Alternative 3. `packages/persistence/src/build-jobs.ts` keeps the
compare-and-swap on the expected status (storage-level safety) and drops the
transition table; `guardBuildJobTransitions(repository)` in
`packages/publication` asserts the table before delegating, and
`scripts/deploy/publication-worker.ts` composes the two. `analyseImagePixels`
moves to `packages/persistence/src/media.ts` unchanged.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Relocate, re-export from package indexes, wrap at composition, delete the
application module, remove the two baseline entries plus the
`build-job-repository.ts -> process.env.DATABASE_URL` entry, and keep every
existing test passing.

Map correction found while relocating: `packages/persistence/scripts/**` was
not covered by any layer glob, and `packages/persistence/scripts/clean-room.ts`
imported the deleted module. The map now assigns package-owned scripts to
their package's layer and composition roots, and `scan-layer-imports.mjs`
enforces "packages never import applications" as a hard rule. That coverage
records four pre-existing violations (`clean-room.ts` and `reconcile.ts`
importing `apps/admin/app/lib/*` and `scripts/deploy/publication-worker-core`)
in the baseline; they are pre-existing code newly observed, not new code, and
ARCH-003 removes them when the admin repositories gain a package index.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `node scripts/harness/scan-layer-imports.mjs` → exit 0 with the
      entries `apps/admin/app/lib/desk-review.ts -> sharp` and
      `scripts/deploy/publication-worker.ts -> ../../apps/admin/app/lib/build-job-repository`
      removed from `layer-baseline.json` (the scan would report them as stale
      otherwise); `apps/admin/app/lib/build-job-repository.ts` no longer exists.
- [x] TC-02: `node scripts/harness/scan-env-access.mjs` → exit 0 with
      `apps/admin/app/lib/build-job-repository.ts -> process.env.DATABASE_URL`
      removed; `packages/persistence/src/build-jobs.ts` contains no `process.env`.
- [x] TC-03: `pnpm harness:test` → `desk-review-contract` (pixel analysis via
      `@publisher/persistence`), `portable-persistence-integration`,
      `incremental-publication-contract` pass; a guarded repository rejects
      `transition(job, 'queued', 'published')` with `Invalid build job transition`.
- [x] TC-04: `pnpm typecheck`, `pnpm harness:scan` → `[harness] 10 scans passed`.

## Test Plan

| TC-ID | Test Type | Tool / Approach                           | Notes                                                                                      |
| ----- | --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| TC-01 | gate      | `scan-layer-imports.mjs` + `git ls-files` | Baseline diff shows exactly the removed entries; no new entry appears.                     |
| TC-02 | gate      | `scan-env-access.mjs` + `grep`            | Pool is injected by callers; the worker composition root reads `DATABASE_URL`.             |
| TC-03 | contract  | `pnpm harness:test`                       | Existing suites re-pointed at the package; guard assertion added to the incremental suite. |
| TC-04 | gate      | `pnpm typecheck`, `pnpm harness:scan`     | Full workspace gates.                                                                      |

## Tasks

- [x] `.agents/tasks/completed/ARCH-002.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Two baseline entries reproduced by scan; three alternatives; decision assigns each piece to its layer; TC-01–04 have test-plan rows.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: delegated`; ARCH-001's GATE-APPROVAL records the owner's standing delegation for phases 2–6 ("ARCH-006 처리할 때까지 반복해서 완료해줘").

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress
Task record created.

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying
`pnpm typecheck` (0 errors), `pnpm harness:scan` (10 scans), `pnpm harness:test` (43 files / 216 tests).

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-layer-imports.mjs`; `git ls-files apps/admin/app/lib/build-job-repository.ts`.
Observed result: baseline diff removes `desk-review.ts -> sharp`, `publication-worker.ts -> ../../apps/admin/app/lib/build-job-repository`, and `build-job-repository.ts -> @publisher/publication`; the scan reported those three as stale before removal; the file is gone. Four newly covered package-script entries were recorded as described in Solution.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-env-access.mjs`; `grep -c process.env packages/persistence/src/build-jobs.ts`.
Observed result: the `DATABASE_URL` entry was reported stale and removed (27 entries remain); grep count 0; the worker composition root passes `postgresPool(process.env.DATABASE_URL)`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `pnpm harness:test`.
Observed result: `desk-review-contract` imports `analyseImagePixels` from `packages/persistence/src/index.ts` and passes; `portable-persistence-integration` uses `PostgresBuildJobRepository` from the package; the new case "guards a storage adapter that only compare-and-swaps on status" rejects `queued -> published` with `Invalid build job transition` and a wrong expected status with `Build job status conflict`.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `pnpm typecheck`, `pnpm harness:scan`.
Observed result: 0 type errors; `[harness] 10 scans passed`.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
