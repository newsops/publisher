---
status: done
type: RULE
tags: [cli, typescript]
authority: delegated
---

# RULE-001: Archive SEO metadata normalization

## Problem

`publisher content restore` successfully ingests and approves the private
archive's media, but the final revision-checked restore transaction rejects an
otherwise valid historical post when its `seoTitle` exceeds the current
70-character managed-content limit. The archive remains private and the
transaction rolls back, leaving the generic starter state active. This happens
when a pre-existing publication used a longer SEO title than the generic
Publisher validation contract allows.

## Architecture Review

### Affected Scope

- `apps/admin/app/lib/archive-restore.ts` owns the archive-only projection
  before it calls the normal managed-post validator.
- `scripts/harness/__tests__/archive-restore-contract.test.mjs` owns the
  private-archive-independent regression coverage.
- `.agents/tasks/RULE-001.md` records the implementation and live restore
  verification without recording archive text or secrets.

Sibling scan completed: the normal editor's `packages/content/src/post-validation.ts`
must continue to reject an over-limit user-provided SEO title; the only
archive projection is `apps/admin/app/lib/archive-restore.ts`. No existing
normalization or archive-import policy conflicts with this scoped operation.

### Alternatives Considered

1. Reject the archive and require manual editing of every historical value.
   Pro: no transformation. Con: blocks the agent-first recovery path and makes
   a private archive dependent on browser or hand editing.
2. Relax the managed-content SEO limit for every editor and API write. Pro:
   preserves the historical string verbatim. Con: changes normal editorial
   validation and permits metadata outside the documented publication bound.
3. Normalize only archive-projected SEO titles to the existing 70-character
   limit before normal validation. Pro: preserves titles, bodies, media, and
   source archive bytes while yielding valid bounded publication metadata.
   Con: a long imported SEO title is deterministically shortened and can be
   refined later in the human admin editor.

### Decision

Choose alternative 3. The archive file and primary article title/body remain
unchanged. During the server-side archive projection only, a non-empty
`seoTitle` is trimmed and truncated at Unicode code-point boundaries to the
ordinary validator's 70-string-unit maximum before the ordinary validator is
invoked. Empty SEO metadata continues to use the
existing title-derived fallback. The normal editor and normal API continue to
reject over-limit values, so this does not broaden their contract. No route,
provider, runtime, or schema boundary is added.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — normal post validation remains strict; archive
      projection is the only scoped transformation point
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Add an archive-projection helper that normalizes only a supplied non-empty SEO
title to the managed 70-code-point maximum. Call it immediately before
`validatedPost` in `managedPosts`. Keep the input archive immutable and retain
the existing validation for every other post field. Add a generic fixture whose
over-limit SEO title restores successfully and whose persisted title is
bounded, plus a test that ordinary post validation still rejects an over-limit
editor value.

## Affected Files

- `apps/admin/app/lib/archive-restore.ts`
- `scripts/harness/__tests__/archive-restore-contract.test.mjs`
- `.agents/tasks/RULE-001.md`

## Completion Criteria

- [x] TC-01: focused archive restore contract test restores a generic archive
      containing a 71+ string-unit `seoTitle` and observes a persisted title of
      at most 70 string units while the archive fixture object remains unchanged.
- [x] TC-02: focused content validation test continues to reject a normal
      editor/API post carrying a non-empty `seoTitle` longer than 70 characters.
- [x] TC-03: the authenticated archive-restore API against the owner archive
      returns HTTP 202, creates exactly one restore operation, and leaves no
      private archive body or credential in repository output.
- [x] TC-04: `pnpm typecheck && pnpm test && pnpm harness:scan` exits 0.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                                    | Notes                                                                                                                                                                                                       |
| ----- | ----------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract    | `portable-persistence-integration.test.mjs`                                        | Test `restores an archive exactly once from the untouched starter fixture` asserts immutable 71-unit source metadata and 70-unit persisted projection without owner data.                                   |
| TC-02 | unit        | `content-contract.test.mjs`                                                        | Test `keeps the normal editorial SEO title limit strict` asserts that the ordinary validator rejects a 71-unit value.                                                                                       |
| TC-03 | integration | Authenticated archive-restore API against the private archive and production admin | Preconditions: migrated starter fixture, approved media bindings, valid scoped token, and approved operational-release authority. Observed HTTP 202 and one restore-operation record; only counts recorded. |
| TC-04 | regression  | `pnpm typecheck && pnpm test && pnpm harness:scan`                                 | All commands passed after implementation; production archive data is not emitted.                                                                                                                           |

## Tasks

- [x] `.agents/tasks/completed/RULE-001.md` — completed implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter is a YAML block with `status: draft`, permitted `RULE` type, tags, and delegated authority.
Problem names the restore command behavior, the over-limit `seoTitle` condition, and the resulting rollback/starter-state symptom without placeholders.
Architecture Review has four completed checklist items, a completed sibling scan with scope evidence, three alternatives with pro/con trade-offs, and a decision tied to preserving normal editorial validation.
Completion Criteria define four observable or command-form TC-N outcomes; Test Plan has one non-TBD, non-empty-notes row for each TC-01 through TC-04.
Tasks placeholder and an otherwise empty Evidence Log are present.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
The frontmatter declares `authority: delegated`, and the completed Architecture Review records the affected scope, sibling scan, alternatives, decision, and test plan.
Standing delegated authority is defined in `.agents/rules/authority-delegation.md`; the owner's explicit operational restoration and public-release approval remains recorded in the current conversation.
No implementation file or task record for RULE-001 exists in the inspected worktree, so this gate was not bypassed before approval.
Execution-time exceptions in `.agents/rules/authority-delegation.md` remain in force for any production mutation, billing, DNS, secret, or other irreversible external action.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Tasks record exists at `.agents/tasks/RULE-001.md` and is referenced from this spec's Tasks section.
TC-01 through TC-04 each have a corresponding unchecked implementation, validation, operational-restore, and regression task in that record.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
`.agents/tasks/RULE-001.md` marks TC-01 through TC-04 complete and records no blocked or deferred task.
`pnpm --filter @publisher/site build` exited 0 and completed the static-site production build, postbuild normalization, public metadata, and plugin-header generation.
`pnpm --filter @publisher/site test` exited 0; the site package's configured test command completed successfully.
This `RULE` spec changes archive-only server-side normalization and does not change a SCREEN/FLOW/BEHAVIOR/API user-facing interaction, so browser-verification evidence is not required for this gate.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`scripts/harness/__tests__/portable-persistence-integration.test.mjs` test `restores an archive exactly once from the untouched starter fixture` passed; it observed the untouched 71-unit source SEO metadata and the persisted 70-unit archive projection.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

`scripts/harness/__tests__/content-contract.test.mjs` test `keeps the normal editorial SEO title limit strict` passed; the normal validator rejected the 71-unit non-empty `seoTitle` with `seoTitle must be 70 characters or fewer`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

The authenticated production archive-restore API action returned HTTP 202 and the recorded operational result contains exactly one restore operation with 8 posts and 17 media; no private archive body or credential was recorded in this spec or task archive.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

`pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` each exited 0; `pnpm test` completed 167 tests.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01 through TC-04 are checked and each has a dedicated verification and test-reference entry above.
The Test Plan names automated tests for TC-01 and TC-02, an authenticated production API action for TC-03, and the exact regression commands for TC-04.
The completed task record is archived at `.agents/tasks/completed/RULE-001.md`, and the Tasks section points to that archived path.
