# INFRA-007: Operating-installation continuity

- **Status**: completed
- **Created**: 2026-10-24
- **Branch**: fix/operating-installation-migration-safety
- **Spec**: ../../spec-docs/done/INFRA-007-operating-installation-continuity.md

## Plan

- [x] TC-01: Version and validate complete current schema/migration coverage.
- [x] TC-02: Preserve two-site durable SQL domains; invalidate only sessions with an explicit authority policy.
- [x] TC-03: Capture through one repeatable-read connection and prove concurrent consistency/release.
- [x] TC-04: Prove fail-closed validation and atomic empty-target restore/verification/sequence progression.
- [x] TC-05: Repair draft-only interchange through the actual validator-to-SQL chain without fabricated review.
- [x] TC-06: Compare clean/incremental HTML for adapter and comment/verification configuration changes.
- [x] TC-07: Compare actual RSS body and lead byline after independent changes.
- [x] TC-08: Serve generated headers and verify external consent CSS, reject/reload/reopen/grant in actual desktop/mobile Chrome.
- [x] TC-09: Verify exact comment/verification CSP origins with controlled HTTP fixtures and reject invalid configuration.
- [x] TC-10: Link one generic runbook covering preservation, rehearsal, old-worker drain, credentials, rollback and full-local blockers.
- [x] TC-11: Pass build/typecheck/test/harness, independent review and privacy checks.

## Evidence

No implementation started before approval. Full local cutover and actual
production changes are outside this bounded correction; ARCH-008 remains open.

### Executed regressions and review

- Recovery RED initially returned format 1 instead of 2. Real PostgreSQL 16
  independent connections then proved a repeatable-read/read-only capture while
  another connection committed related changes. Lossless bigint/JSONB and UTC
  microseconds, all durable domains, invalidated sessions, fault rollback and
  identity restart pass. Distinct site-restricted account/ACL rows and rejected
  comments are retained. Current browser owner-only checks deny both nonowners;
  membership-driven grants are not implemented or claimed.
- Archive RED reproduced validator-default publication without review, category
  edits and independent variant edits being overwritten, and successful concurrent
  inserts/variant writes being lost. Draft validation plus complete untouched
  inventory under a transaction-owned exclusive table lock fixes those cases.
  Independent reviewer reran 3 suites / 45 tests including both true-PG races.
- Publication RED reproduced stale head/comments/feed/byline bytes, missing
  external consent CSS/CSP origins and invalid configuration acceptance. Final
  independent review passed 6 suites / 59 tests, with no unresolved findings.
  The main root package run passed 5 publication suites / 56 tests.
- Review also corrected silent comment disabling for malformed supplied booleans,
  oversized touched modules/functions, and the older-schema backup ordering.
  Pre-0006 source recovery now requires native full capture and isolated upgrade
  before creating a current-format backup. No compatibility runtime was added.

### Root-executed gates

- Node 22.23.4, project-pinned pnpm 9.0.0, existing installed dependencies.
- `pnpm build`, `pnpm build:admin`, `pnpm typecheck`, `pnpm -r lint`: exit 0.
- With `PUBLISHER_RECOVERY_TEST_DATABASE_URL` set only to a disposable loopback
  PostgreSQL 16 server, `pnpm test`: all packages pass; full harness 76 suites /
  472 tests pass, zero skipped. The root independently ran archive/SQL 33 tests
  earlier and the full new concurrent suites in that final run.
- `pnpm harness:scan`: all 13 scans pass, including privacy over all 590 staged
  program files. No operated identities or production evidence are staged.
- CI's existing clean-room job now runs the real independent-connection suites
  on its disposable PostgreSQL, so default local conditional tests cannot hide
  missing concurrency evidence at integration.

### Root browser evidence

- Fixture command: `volta run --node 22.23.4 pnpm exec tsx
scripts/harness/continuity-preview.mts`. It serves actual release artifacts,
  generated CSP and release-policy cache classes on loopback HTTP only.
- Anonymous visitor, actual Chrome desktop 2560x1267 and measured mobile
  390x844. Home, article, category and search render; unknown route returns 404.
  Consent is fixed at the bottom, external same-origin CSS is linked and there
  are zero inline style elements. Mobile buttons fit within width 390 and have
  about 45-pixel height. Screenshots and accessibility snapshots were inspected.
- First visit has no GA loader. Reject/reload preserves the choice; reopening
  Settings displays "analytics rejected". Explicit grant inserts the dummy
  GA script. Native Chrome Network records a successful 204 collection request
  after grant and zero collection matches after reject/reload. Mobile coordinate
  actions preserve real 390x844 mode when the extension's DOM action resets it.
- Article displays approved comments and a real verification frame. The local
  receivers observe comment GET/POST and separate verification script/frame/
  connect requests. A synthetic submission returns "Submitted for moderation."
  Browser error/warning logs are empty. No production comment was submitted.
- Temporary device/viewport settings were reset after responsive verification.

## Delivery tracking

Commit, PR, CI, integration and owned-fixture cleanup are tracked by the parent
audit record, `../operating-installation-migration.md`. They are not a claim of
production cutover or completion of ARCH-008.

## Result

All eleven bounded repair criteria passed implementation, independent review,
SQL/artifact/browser verification and repository checks. Full local product
cutover remains unfinished under ARCH-008; no live installation was modified.
