# Remaining issue execution

- **Status**: in-progress
- **Created**: 2026-10-24
- **Branch**: docs/local-first-architecture
- **Scope**: ADMIN-002, CLI-005, SECURITY-001, SECURITY-002, INFRA-005, ARCH-007, ARCH-008

## Objective

Resolve the repository's outstanding implementation, test and verification
issues without confusing stale records, local evidence and production delivery.

## Plan

- [x] Inventory GitHub and local gated specifications against current source.
- [x] Obtain ARCH-008 post-design implementation approval through the gate.
- [x] Repair agent guidance and lifecycle CLI contract gaps with regression tests.
- [x] Revalidate existing security/consent work and record actual remaining external gates.
- [ ] Implement and verify the local-first capability-proof slice, then complete its callers/intake/cutover.
- [ ] Coordinate ARCH-007 terminology and INFRA-005 full multisite surface parity without adding hosted dependencies.
- [x] Run real package/workspace tests, independent review and required browser checks for the implemented slice.
- [ ] Commit/release only verified units and preserve uncompleted work accurately.

## Progress

### 2026-10-24

- GitHub has one open architecture terminology issue; five local active specs
  and the two architecture backlog specs comprise the repository work list.
- Source inspection found missing guidance preflight/UI conflict handling,
  partial CLI lifecycle validation and real surface parity gaps. Existing
  consent and keyring code needs current verification, not another rewrite.
- ARCH-008 GATE-APPROVAL passed; external execution exceptions remain.
- ARCH-007 initially lacked narrow breaking-change confirmation; approval FAIL
  was retained, then the owner's exact confirmation resolved it and approval/
  implementation gates passed. The atomic Adapter rename is implemented;
  final real HTTP, browser and completion checks remain.
- Guidance preflight/conflict editing, real package-test entry points and the
  local SQLite/private-sync proof slice are implemented. Independent reviews
  reproduced defects before their regression fixes; the full target is not
  declared complete from proof tests.
- Current regression checkpoint: site/Desk Plugin build, admin build, workspace
  typecheck/lint and 13 scans passed; full harness 66 suites / 370 tests passed
  before adding a 30-case automation matrix and two framework-loader tests.
  Updated admin package selection executes seven suites / 52 passing tests.
- SECURITY-001 VERIFY passed after contradictory historical task bookkeeping
  was repaired. No production credential rotation or secret transfer occurred.
- Actual Chrome synthetic-owner flow verified sign-in, guidance two-editor
  revision conflict, unsaved draft preservation, explicit reapply/save and
  copyable machine context. Responsive and post-refactor checks remain.
- Final post-refactor Chrome verification completed at actual 1440x1200 and
  390x844 viewports, including empty guidance, keyboard focus, explicit reload,
  mobile edit/save/copy and per-tab publication isolation. Actual Next HTTP
  checks prove new adapter routes 200 and removed routes 404.
- Latest full `pnpm test` passed: all packages plus 72 harness suites / 426
  tests. Admin package runs eight real suites / 56 tests; operator runs eleven / 57. The owner's content-plus-version save rule is explicit in the target
  contracts and implemented as one atomic versioned workspace read with stale
  saves rejected through real SQLite connections. SECURITY-001 is now done;
  the full local-first cutover and external acceptance remain open.

- ADMIN-002, CLI-005 and ARCH-007 each passed independent VERIFY/COMPLETE and
  moved to done with completed task records. Their code is not a production
  deployment or a completed ARCH-008 transition. GitHub release state remains
  separate from local spec lifecycle.
- Static-fixture Chrome smoke also exercised home, article, category, search
  filtering (eight to one result), unknown route, consent rejection and persistent
  privacy settings. Desktop/mobile scroll widths matched viewports; no console
  errors were observed. It has no active GA installation and is not evidence of
  an operated site's analytics or comment service.
- Final focused read-only review confirmed atomic read/version and stale-save
  rejection; both selected regression files passed independently. Workspace
  typecheck/lint, formatting, secret checks and all 13 scans also passed. The
  synthetic browser tabs and both task-owned local preview servers were closed.
- Committed and pushed the reviewed checkpoint in draft PR #2. Initial CI
  rejected ANSI-colored summary parsing and unavailable MinIO fixture images;
  the failures are not waived. The targeted summary assertion passes after
  terminal-control normalization. Exact-release fixture corrections have
  separate source, download, build and runtime checks; current remote results
  are tracked in the PR checks. No main merge or deployment occurred.

## Remaining work

- ARCH-008: complete local management/auth/key/media/intake/publication/recovery,
  both callers, migration rehearsal and removal of replaced paths.
- INFRA-005: remaining full domain/lifecycle UI/CLI parity and separate external
  activation evidence, carried into the approved local-first cutover instead of
  expanding the hosted architecture.
- SECURITY-002: operated-installation acceptance and its separate release gate.
  Local consent/browser results do not satisfy the operated-instance criterion.

## Decisions

- Complete capability proofs before broad local-first cutover; keep every
  missing criterion visible rather than closing it from paperwork alone.
- Do not perform production mutation from a broad implementation request.

## Blockers

None for local work. External evidence and approval are evaluated at the
specific operation, not treated as a reason to stop unrelated implementation.

## Result

In progress.
