# Local-first documentation and test readiness

- **Status**: completed
- **Created**: 2026-10-24
- **Branch**: docs/local-first-architecture
- **Scope**: supporting design documentation only; no product/test implementation

## Objective

Make documentation and executable behavior-test obligations explicit without
treating the unapproved local-first architecture as implemented.

## Plan

- [x] Inspect existing test entry points and actual current suites.
- [x] Map LF scenarios and TC criteria to proposed behavior suites and faults.
- [x] Link the verification plan from the design entry points.
- [x] Independently check scope, traceability and document links/privacy.

## Progress

### 2026-10-24

- A read-only explorer distinguished real current harness tests from missing
  local-first runtime/tests. Several package test scripts are no-op exit paths;
  the plan names the real root/harness commands and limits their evidence.
- Added documentation deliverables, all 24 LF scenarios mapped to 12 TC groups,
  proposed test files, eight concrete fault cases and five evidence tiers.
- Added proposal/contract links. Parent-authored document checks passed four
  files, 17 local links, whitespace/privacy and all LF/TC mappings. Formatting
  and `git diff --check` passed. These are documentation checks only.
- An independent reader found no blocking issue and confirmed current suite
  claims, future-only test paths, evidence boundaries and design-only scope.

## Decisions

- Keep ARCH-008 at review-ready; this request adds a quality requirement, not
  architecture/implementation approval.
- Do not add dummy implementations, skipped placeholder tests or text-only
  tests that purport to establish new runtime guarantees.

## Blockers

None for documentation. New behavior tests require the corresponding approved
implementation slice; actual provider claims require isolated adapter evidence.

## Result

The verification plan is complete and linked. New product/test implementation
remains unstarted; no app, test suite, provider or deployment was executed.
ARCH-008 remains review-ready without implementation approval. Existing
unrelated changes remain untouched. Documentation remains local without a new
commit, push or merge.
