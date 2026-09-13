---
status: in-progress
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
- `packages/content/docs/SPEC.md` documents the archive projection's bounded
  SEO metadata behavior.
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
- `packages/content/docs/SPEC.md`
- `.agents/tasks/RULE-001.md`

## Completion Criteria

- [ ] TC-01: focused archive restore contract test restores a generic archive
      containing a 71+ string-unit `seoTitle` and observes a persisted title of
      at most 70 string units while the archive fixture object remains unchanged.
- [ ] TC-02: focused content validation test continues to reject a normal
      editor/API post carrying a non-empty `seoTitle` longer than 70 characters.
- [ ] TC-03: `publisher content restore` against the owner archive returns
      `ARCHIVE_RESTORE_ACCEPTED`, creates exactly one restore operation, and
      leaves no private archive body or credential in repository output.
- [ ] TC-04: `pnpm typecheck && pnpm test && pnpm harness:scan` exits 0.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                             | Notes                                                                                                                                                 |
| ----- | ----------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract    | `archive-restore-contract.test.mjs` with generic long-metadata fixture      | Uses no owner archive, provider secret, or production database; asserts source immutability and bounded projection.                                   |
| TC-02 | unit        | Existing content validation test plus a focused over-limit assertion        | Confirms the archive-only exception cannot relax normal human/API editorial writes.                                                                   |
| TC-03 | integration | Existing authenticated CLI against the private archive and production admin | Preconditions: migrated starter fixture, approved media bindings, valid scoped token, and approved operational-release authority; record counts only. |
| TC-04 | regression  | Repository typecheck, test, and harness scan commands                       | Runs after implementation; production archive data is not emitted.                                                                                    |

## Tasks

- [ ] `.agents/tasks/RULE-001.md` — not created (created after GATE-APPROVAL)

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
