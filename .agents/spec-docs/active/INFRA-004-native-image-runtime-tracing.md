---
status: in-progress
type: INFRA
tags: [web, typescript]
authority: delegated
---

# INFRA-004: Native image runtime tracing

## Problem

The production admin deployment successfully builds but the media upload route
returns HTTP 500 while restoring an archive. Vercel runtime logs identify the
failure as a missing Linux `libvips` shared library while dynamically loading
`sharp`. The existing tracing globs are evaluated from the admin project root,
but point at monorepo-root dependency paths as if they were local to that
project, so the native runtime payload is not reliably included.

## Architecture Review

### Affected Scope

- `apps/admin/next.config.ts` — deployment artifact tracing for the admin API.
- `apps/admin/package.json` and `pnpm-lock.yaml` only if an explicit runtime
  package declaration must change.
- `apps/admin` build verification and a regression test or artifact assertion.
- `.agents/tasks/production-archive-restore.md` — operational progress record.

### Alternatives Considered

1. Correct the Next output-file tracing include paths relative to `apps/admin`.
   Pro: keeps image validation and variant generation in the current service;
   Con: must be tested against the Linux deployment artifact.
2. Remove image validation and variant generation during archive restore.
   Pro: avoids a native dependency; Con: weakens the media safety and generated
   derivative contract for all uploads.
3. Add a separate image-processing service or queue. Pro: isolates native work;
   Con: adds a new runtime/provider layer and operational complexity.

### Decision

Choose alternative 1. Keep the existing Node image-processing contract and
trace `sharp` plus its Linux binary and `libvips` payload from the correct
monorepo-relative paths. Add a regression assertion that makes a missing
native payload observable before deployment. This is an implementation-level
deployment correction, not a new provider or runtime boundary.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — `packages/persistence/src/media.ts` is the only
      runtime image processor and no sibling admin configuration owns tracing.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Make the tracing paths unambiguously relative to the admin project root and
cover the `sharp`, Linux native binding, and `libvips` package payload used by
the Node runtime. Preserve the public static site's database- and
secret-independence. Verify the generated production artifact locally and the
deployed API by uploading archive media through the existing authenticated CLI.

## Affected Files

- `apps/admin/next.config.ts`
- `apps/admin/package.json` (only if required for runtime tracing)
- `apps/admin/test/native-image-runtime-tracing.test.mjs` (or equivalent)
- `.agents/tasks/production-archive-restore.md`

## Completion Criteria

- [ ] TC-01: `pnpm --filter @publisher/admin build` → exit 0 and the traced
      server artifact includes the Linux `sharp` binding and `libvips` payload when
      built on Linux.
- [ ] TC-02: the native-runtime regression test → exit 0 and fails if either
      Linux payload path is omitted from the tracing configuration.
- [ ] TC-03: authenticated archive media upload against the new production
      admin deployment → HTTP success rather than a `sharp` module-load HTTP 500.
- [ ] TC-04: `pnpm typecheck && pnpm test && pnpm harness:scan` → exit 0.

## Test Plan

| TC-ID | Test Type        | Tool / Approach                                                                                             | Notes                                                                                                                                  |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | build artifact   | `pnpm --filter @publisher/admin build` plus Linux CI/deployment artifact inspection                         | Local macOS build proves configuration syntax; the production Linux deployment is the required platform-specific precondition.         |
| TC-02 | regression       | Node test reads `apps/admin/next.config.ts` and asserts the three monorepo-relative native tracing patterns | The test is configuration-level because macOS dependency installation does not carry Linux binary files.                               |
| TC-03 | HTTP integration | Existing authenticated `publisher content restore` CLI with the private archive                             | Requires the owner-provided archive, valid API token, deployed production admin, and R2/Neon configuration; no archive body is logged. |
| TC-04 | regression suite | `pnpm typecheck && pnpm test && pnpm harness:scan`                                                          | Runs after implementation; no production data is required.                                                                             |

## Tasks

- [ ] `.agents/tasks/INFRA-004.md` — active implementation record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, one valid `type: INFRA`, and non-empty `tags`.
Problem records the production archive-restore HTTP 500, missing Linux `libvips` during `sharp` loading, and the admin-project-root tracing condition without TBD/TODO placeholders.
Architecture Review has all four checklist items checked; the sibling scan identifies `packages/persistence/src/media.ts` and explicitly finds no sibling tracing owner.
Alternatives Considered contains three options with pro/con trade-offs, and the Decision selects option 1 while explaining the native-runtime versus provider-boundary trade-off.
Completion Criteria contains four uniquely numbered TC entries, each expressed as a command result or observable behavior, with no prohibited vague wording.
Test Plan contains one populated row for each of TC-01 through TC-04; every Test Type, Tool / Approach, and Notes cell is populated, with no manual-only rows.
Tasks contains the required placeholder, and Evidence Log existed empty before this first gate record.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
User provided explicit, unambiguous approval for this operational restoration and public release: “운영 복원 및 공개 릴리스 승인”.
The approval applies directly to INFRA-004's production archive-restore native-image runtime correction; no Architecture Review or frontmatter `type`/`tags` changes were made after that approval.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Task record exists at `.agents/tasks/INFRA-004.md` and is linked from `## Tasks`.
The task record contains one unchecked implementation task for each Completion Criterion: TC-01 build/Linux artifact, TC-02 tracing regression, TC-03 authenticated production upload, and TC-04 repository verification suite.
The actual worktree history is `68a902a`, `2cc08ed`, `3df70af`, `752eb2b`, and `c0aecd4`; it contains no INFRA-004 implementation commit, so the prior non-compliance claim based on commits outside this worktree is not applicable.
