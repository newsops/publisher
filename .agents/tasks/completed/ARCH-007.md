# ARCH-007: Adapter terminology

- **Status**: completed
- **Created**: 2026-10-24
- **Branch**: docs/local-first-architecture
- **Scope**: site adapter domain/API/CLI/snapshots/migrations and documentation

## Objective

Rename the site extension domain from Plugin to Adapter in one prerelease
change without aliases. Keep the agent distribution named Desk Plugin.

## Plan

- [x] TC-01: Rename all server-domain symbols, paths, CLI verbs and schema fields; preserve framework/Desk Plugin terms.
- [x] TC-02: Pass supported-runtime workspace typecheck.
- [x] TC-03: Pass actual workspace regression tests, not no-op commands.
- [x] TC-04: Serve adapter API paths; old plugin paths are absent/rejected.
- [x] TC-05: Support adapter CLI and reject old plugin verb with USAGE before any network request.
- [x] TC-06: Verify the forward migration in an isolated PostgreSQL fixture.
- [x] TC-07: Enforce adapter snapshot version 2 and reject old public plugin snapshots.
- [x] TC-08: Update layer/surface/contract registration and pass the harness.

## Progress

### 2026-10-24

- Initial approval gate found no spec-specific confirmation and recorded FAIL.
  No rename implementation started. The owner then explicitly selected
  "이름과 API·CLI를 함께 변경 (권장)" after the exact change was presented.
  The repeated approval gate passed; both entries are retained honestly.
- Added a focused regression suite before implementation. Four tests failed for
  the intended old route trees, accepted removed CLI verb, missing v2 parser and
  missing forward migration. Reruns pass after the rename.
- Renamed domain source paths, interfaces, JSON fields, UI labels/CSS, HTTP
  routes/client methods, CLI group, public runtime path, build headers, fixtures,
  layer/surface registrations and current operational guides. The Desk Plugin
  package identity and marketplace verbs are unchanged; its bundle and command
  table were regenerated from the new CLI.
- Split adapter contracts/registry/installations/contributions and human UI
  cards so newly moved runtime modules remain below 300 lines.
- Preserved the checksum-verified initial SQL migration. A forward migration
  renames the table, column, primary-key constraint and stored JSON ID field;
  isolated PGlite PostgreSQL-protocol fixtures verify fresh installation and an
  existing record, followed by normal repository reads and recovery tests.
- Focused Node 22.23.4 run passed 11 suites / 55 tests, including adapter API
  human/automation reads, exact CLI lifecycle requests, strict v2 snapshots,
  source guard negative fixtures, PostgreSQL migration/recovery, site isolation
  and analytics consent. An additional rejected-option regression was added
  afterward and is included in the coordinated final run.
- Domain, layer-import, route-shape, surface-parity and spec-contract scans pass.
  Full workspace build/typecheck/test/harness and live browser/HTTP old-path 404
  verification remain the root task's final acceptance gates, not claims made
  by these focused tests.
- Independent review caught a real CLI/API mismatch: validation without an
  input file omitted the API's required prospective configuration. The CLI now
  captures the installed public configuration through its scoped read, checks
  exact site/ID/revision and object shape, then sends an explicit configuration.
  Stale, malformed and failed reads block the POST; validation does not save,
  enable or publish. Regression tests bridge the real GET/POST route handlers,
  rather than always returning success from a mock server.
- After that fix, four focused suites / 37 tests pass on Node 22.23.4. The
  response-boundary helper also passes TypeScript `--allowJs --checkJs` without
  casts. Regenerated Desk Plugin output and both naming/bundle scans pass.
- Final root verification on Node 22.23.4: `pnpm test` passed all packages and
  the entire harness (70 files / 418 tests); workspace typecheck/lint, static
  and Desk Plugin build, admin build and all 13 scans passed.
- Against the actual isolated Next server with synthetic credentials, browser
  `/api/adapters` and automation `/api/v2/sites/example/adapters` returned 200
  with adapter lists. Removed browser `/api/plugins` and site-scoped old paths
  returned 404, as did an unknown route. No live provider or publication changed.
- Chrome synthetic-owner verification inspected the renamed adapter UI and
  related management at 1440x1200 and 390x844. New/moved view, registry,
  contribution and route functions were split to satisfy size limits without
  changing their contracts. Task-specific independent review defects are fixed.

## Decisions

- No old-name alias or compatibility production mode.
- Do not rename Next.js/ESLint tooling or Desk Plugin files by blind replacement.

## Blockers

None for implementation after GATE-IMPLEMENT.

## Result

Implementation, isolated verification and independent spec gates are complete.
No production migration or deployment is claimed.
