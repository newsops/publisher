---
status: done
type: DATA
tags: [cli, json-schema, typescript]
authority: delegated
---

# CLI-004: Inline media archive rewrite

## Problem

`publisher content restore` uploads and approves every archive media asset, but
the archive contract currently binds only a post's lead image. Historical post
bodies can contain `/media/...` image references. After a restore, those URLs
would point at no generated public asset because the restored release exposes
checksum-addressed approved variants instead. Reintroducing old static paths
would create a legacy compatibility layer and violate the static release
contract.

## Architecture Review

### Affected Scope

- `packages/content/src/archive.ts`: version-1 archive validation and canonical
  representation.
- `apps/admin/app/lib/archive-restore.ts`: archive-to-managed-post conversion.
- `scripts/harness/__tests__/archive-restore-contract.test.mjs`: archive and
  restore behavior contract coverage.
- Private operational archive construction only: it supplies the newly required
  bindings and is never committed.

### Alternatives Considered

1. Copy original files to their historical `/media/...` paths. Pro: no archive
   contract change. Con: creates a legacy static-path compatibility layer and
   duplicates media outside the approved checksum-addressed pipeline.
2. Remove inline images from article HTML. Pro: minimal code change. Con:
   destroys user-owned editorial content and silently degrades restored posts.
3. Bind each inline public reference to an archive asset and rewrite it to the
   approved variant during restore. Pro: preserves content while keeping one
   media pipeline. Con: extends the archive validation and restore conversion.

### Decision

Choose alternative 3. Each archive post may declare `bodyMediaAssets`, an exact
mapping from a body `/media/...` reference to a declared archive asset path.
Validation rejects unknown assets, unsafe reference paths, unused bindings, and
any inline `/media/...` reference without a binding. Restore deterministically
replaces each declared reference with the already approved variant public path
before post validation and persistence. No old static path, runtime fallback,
or provider-specific behavior is introduced.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing `imageAsset` and `approvedMediaPaths` are
      the sole media binding path; no conflicting inline binding contract exists.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Extend the schema-version-1 archive post entry with an optional
`bodyMediaAssets` record. Its keys are exact root-relative `/media/...` values
that occur in `bodyHtml`; its values are declared `media.assetPath` values.
The validator returns the binding record only after checking completeness and
one-to-one usability. During restore, resolve each bound asset through the
same approved media map used for lead images, replace those exact references in
the body, and then run existing managed-post validation. The persisted article
and static snapshot therefore contain only new approved variant paths.

## Affected Files

- `packages/content/src/archive.ts`
- `apps/admin/app/lib/archive-restore.ts`
- `scripts/harness/__tests__/archive-restore-contract.test.mjs`
- `scripts/harness/__tests__/portable-persistence-integration.test.mjs`

## Completion Criteria

- [x] TC-01: archive validation accepts a body-media binding only when every
      bound key is an exact root-relative `/media/...` reference in `bodyHtml` and
      every value names declared archive media.
- [x] TC-02: archive validation rejects an unbound inline `/media/...`
      reference, a binding for an absent reference, and a binding to unknown media.
- [x] TC-03: restoring a valid archive rewrites all bound inline references to
      their approved checksum-addressed variant public paths before state and
      articles are persisted.
- [x] TC-04: `pnpm typecheck`, focused archive/persistence contract tests, and
      the full harness suite exit 0 without adding historical-path output.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                       | Notes                                                                                                                     |
| ----- | ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit        | `scripts/harness/__tests__/archive-restore-contract.test.mjs`         | `retains complete exact body media bindings` checks one exact root-relative reference and declared asset.                 |
| TC-02 | unit        | `scripts/harness/__tests__/archive-restore-contract.test.mjs`         | `rejects an unbound…`, `a binding for…`, and `a binding to…` cover each invalid binding without production data.          |
| TC-03 | integration | `scripts/harness/__tests__/portable-persistence-integration.test.mjs` | Media restore fixture asserts the persisted body has the approved variant path and no historical `/media/pixel.png` path. |
| TC-04 | regression  | `pnpm typecheck && pnpm test && pnpm harness:scan`                    | Observed typecheck exit 0, full harness 164 tests, static build exit 0, and all 6 policy scans passing.                   |

## Tasks

- [x] `.agents/tasks/completed/CLI-004.md` — completed implementation record;
      its four plan items map respectively to TC-01/TC-02, TC-03 restore logic,
      TC-03 persistence coverage, and TC-04 regression verification.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready

- Frontmatter has `status: draft`, one valid `DATA` type, tags, and delegated authority.
- Problem identifies the `publisher content restore` inline `/media/...` failure condition without TBD/TODO placeholders.
- Architecture Review has all four completed checklist items, sibling-scan evidence, three pro/con alternatives, and a trade-off-based decision.
- Completion Criteria contains TC-01 through TC-04 in observable/command form; Test Plan has one fully populated non-manual row for each TC.
- Tasks placeholder and an initially empty Evidence Log were present before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved

- Owner provided the current, explicit production authorization: “운영 복원 및 공개 릴리스 승인”.
- This DATA spec records `authority: delegated`; its completed Architecture Review covers the implementation decision, affected scope, alternatives, and verification plan under the owner’s standing ordinary-implementation delegation.
- The approved action adds no provider, cost model, or architecture boundary; it preserves the existing approved-media pipeline.
- `git status` shows this specification and the separate production-restore task record as untracked only; no CLI-004 implementation file edit or commit preceded this approval gate.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress

- Created `.agents/tasks/CLI-004.md` as the active implementation record.
- The `## Tasks` section now records that exact task-file path and its TC mapping.
- The task plan maps TC-01 and TC-02 to archive validation, TC-03 to restore logic and persistence coverage, and TC-04 to typecheck, focused tests, full harness, and policy scan.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying

- `.agents/tasks/CLI-004.md` has all four implementation and verification tasks marked `[x]`; its Blockers section states `None`.
- `pnpm --filter @publisher/site build` exited 0; the static publication build completed successfully.
- `pnpm --filter @publisher/site test` exited 0.
- This is a `DATA` archive-contract change with no user-facing screen, flow, behavior, or API interaction to verify; browser/self-verification evidence is N/A.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

- Command: `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
- Observed result: exit 0; 2 test files and 25 tests passed. `retains complete exact body media bindings` verifies an exact root-relative `/media/pixel.png` reference bound to declared `media/pixel.png`.
- Test reference: `scripts/harness/__tests__/archive-restore-contract.test.mjs` — `retains complete exact body media bindings`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

- Command: `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
- Observed result: exit 0; the focused suite passed the three invalid-binding cases: `an unbound body media reference`, `a binding for a missing reference`, and `a binding to unknown media`.
- Test reference: `scripts/harness/__tests__/archive-restore-contract.test.mjs` — parameterized `rejects %s` body-media-binding cases.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

- Command: `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
- Observed result: exit 0; the persistence fixture asserts stored `bodyHtml` contains `first.publicPath` and does not contain `/media/pixel.png` after `restoreArchive`.
- Test reference: `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — media restore integration fixture (the `media-restore-fixture-001` restore assertion).

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

- Commands: `pnpm typecheck`; `pnpm test`; `pnpm harness:scan`; and the focused Vitest command used for TC-01 through TC-03.
- Observed result: `pnpm typecheck` exited 0; `pnpm test` exited 0 with 36 files / 164 tests passed and the static build completed; `pnpm harness:scan` exited 0 with all 6 scans passed; focused archive/persistence tests exited 0 with 25 tests passed. The persistence assertion confirms no historical `/media/pixel.png` output remains in stored article HTML.
- Test reference: `scripts/harness/__tests__/archive-restore-contract.test.mjs`; `scripts/harness/__tests__/portable-persistence-integration.test.mjs`; repository commands above.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-13

**Status remains:** verifying
**Failed criteria:**

- Completion archive: `.agents/tasks/CLI-004.md` is still active and the spec `## Tasks` section still points to that active path; the required `.agents/tasks/completed/CLI-004.md` archive does not exist.
  **Required action:** Archive the completed task record at `.agents/tasks/completed/CLI-004.md`, update `## Tasks` to that path, then rerun GATE-COMPLETE.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done (recorded only; status and file movement are owned by the caller)

- TC-01: Ran `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`; observed exit 0, 2 files / 25 tests passed. `retains complete exact body media bindings` in `scripts/harness/__tests__/archive-restore-contract.test.mjs` verifies the declared exact `/media/pixel.png` binding.
- TC-02: The same focused command exited 0 and observed all three invalid-binding cases passing: unbound inline reference, absent-reference binding, and unknown-media binding. Test reference: parameterized `rejects %s` cases in `scripts/harness/__tests__/archive-restore-contract.test.mjs`.
- TC-03: The same focused command exited 0; the restore integration assertion for `media-restore-fixture-001` in `scripts/harness/__tests__/portable-persistence-integration.test.mjs` observes persisted `bodyHtml` containing `first.publicPath` and excluding `/media/pixel.png`.
- TC-04: Ran `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`; each exited 0. Observed `pnpm test` static build completion plus 36 files / 164 harness tests passed, and all 6 policy scans passed. The focused command above also exited 0 with 25 tests; its persistence assertion excludes the historical path.
- Completion bookkeeping: all four Completion Criteria checkboxes are `[x]`; the four Test Plan rows each name their test command/file and concrete assertion; `.agents/tasks/completed/CLI-004.md` exists with all four plan items `[x]`; and `## Tasks` points to that completed-record path.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying (final re-validation; frontmatter remains `verifying`)

- `.agents/tasks/completed/CLI-004.md` has all four plan items marked `[x]` and its `## Blockers` section states `None`.
- `pnpm --filter @publisher/site build` exited 0 and generated the static publication output; `pnpm --filter @publisher/site test` exited 0.
- `pnpm typecheck` exited 0 across all workspace packages.
- `pnpm test` exited 0: 36 harness files and 165 tests passed after the final safety strengthening.
- `pnpm harness:scan` exited 0: all 6 repository policy scans passed; `git diff --check` also exited 0.
- This is a `DATA` archive-contract change, not a SCREEN/FLOW/BEHAVIOR/API user-facing change; browser/self-verification evidence is N/A under `.agents/rules/browser-verification.md` and `.agents/rules/self-verify-first.md`.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done (recorded only; frontmatter status and file locations are owned by the caller)

- TC-01: Re-ran `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`; observed exit 0, 2 files / 26 tests passed. `retains complete exact body media bindings` in `scripts/harness/__tests__/archive-restore-contract.test.mjs` covers the exact declared `/media/pixel.png` binding.
- TC-02: The same focused command exited 0; the parameterized `rejects %s` cases in `scripts/harness/__tests__/archive-restore-contract.test.mjs` cover an unbound inline reference, an absent-reference binding, and unknown declared media.
- TC-03: The same focused command exited 0; `media-restore-fixture-001` in `scripts/harness/__tests__/portable-persistence-integration.test.mjs` asserts persisted `bodyHtml` contains the approved `first.publicPath` and excludes `/media/pixel.png`.
- TC-04: The existing TC evidence records successful `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`; the re-run focused suite observed 26 passing tests and no historical-path persistence assertion failure.
- Completion bookkeeping: TC-01 through TC-04 are all `[x]`; every Test Plan row names a concrete automated test or command and assertion; `.agents/tasks/completed/CLI-004.md` exists with all four plan entries `[x]`; and `## Tasks` points to that archived record.
