# Additive Automation Keyrings

- **Status**: completed
- **Created**: 2026-09-15
- **Branch**: docs/local-first-architecture
- **Scope**: apps/admin, docs, automation contract tests

## Objective

Preserve production automation access while allowing an independently scoped
keyring to be added for a publication's CLI/API agent.

## Plan

- [x] TC-01: Merge valid primary and additional scoped keyrings without leaks.
- [x] TC-02: Fail closed for missing, malformed, invalid, or duplicate keyrings.
- [x] TC-03: Document rotation and run focused regression checks.

## Progress

### 2026-09-15

- GATE-WRITE and delegated GATE-APPROVAL passed; implementation record created.
- Added the additive keyring parser, documentation, and focused regression
  coverage; admin typecheck, harness scan, and workspace lint passed.

### 2026-10-24

- Revalidated the actual automation and consent suites on Node 22.23.4: two
  files, 17 tests passed, including seven automation authorization/error tests.
- Workspace `pnpm typecheck`, `pnpm -r lint`, static site/Desk Plugin build and
  all 13 harness scans passed. Full harness: 66 suites, 370 tests passed after
  obsolete rename/build-order expectations were corrected.
- The old VERIFY failure concerned contradictory task bookkeeping, not a
  missing keyring behavior. The record now separates implemented criteria
  from an optional production rotation; no key was created or transmitted.
- Added 30 actual-runtime keyring matrix cases before the COMPLETE check.
  Both keyrings' role/site boundaries, invalid schemas, duplicate IDs and
  token/hash omission pass. Root independently reran the admin package's
  seven suites / 52 tests. GATE-VERIFY passed; historical FAIL is preserved.

## Decisions

- Add an optional validated keyring rather than replacing an encrypted primary
  secret that the provider cannot reveal.

## Blockers

None for TC-01 through TC-03. A production credential rotation is a separate
owner-authorized operation, not a completion criterion of this code contract.

## Result

Additive parsing, strict authorization/redaction and rotation instructions are
implemented and locally revalidated. No production rotation or deployment is
claimed. Implementation tasks and local verification are complete; the spec's
independent completion gate remains the lifecycle authority.
