# Per-Publication Agent Guidance

- **Status**: completed
- **Created**: 2026-09-15
- **Branch**: docs/local-first-architecture
- **Scope**: apps/admin, packages/persistence, packages/admin-client, packages/ops-cli

## Objective

Provide private, site-scoped editorial guidance that human operators and LLM
agents can each read and edit through their respective complete management
surfaces. The guidance must inform agent planning without becoming public
publication data or a bypass of server validation.

## Plan

- [x] TC-01: Add private per-site persistence and public/export omission coverage.
- [x] TC-02: Add authorized, revision-checked automation API and audit behavior.
- [x] TC-03: Add complete accessible human admin management UI.
- [x] TC-04: Add typed client and non-interactive CLI get/set operations.
- [x] TC-05: Surface current guidance before agent-facing content mutations.
- [x] TC-06: Run focused and workspace regression verification.

## Progress

### 2026-09-15

- GATE-WRITE and delegated GATE-APPROVAL passed; implementation task created.
- Revalidated the implementation boundary: existing publication settings are
  serialized into public snapshots, while site registry records, versioned v2
  routes, the reusable admin client, and the non-browser CLI provide the
  correct private extension points.

### 2026-10-24

- Reproduced missing guidance preflight with real local HTTP CLI fixtures before
  implementation; new CLI/editor regressions failed before the fixes.
- Added a fail-closed selected-site guidance preflight shared by content mutation
  commands. Planning and result envelopes include the observed instructions and
  revision; unavailable, malformed, or wrong-site context cannot proceed to write.
- Added typed guidance client responses and CLI get/set contracts.
- Completed the human panel's copyable context, explicit compare/reload/reapply
  controls, and preserved-unsaved-draft conflict behavior. Browser verification
  at desktop/mobile sizes remains required before TC-03 completion.
- PGlite fixtures exercise the actual migrations and guidance repository, API
  authentication/site authorization, revision conflicts, safe audit metadata,
  archive projection, and actual static article/feed artifacts without guidance.
- Focused verification on Node 22.23.4: six harness files, 39 tests passed;
  `node node_modules/typescript/bin/tsc --noEmit -p apps/admin/tsconfig.json`
  passed. Workspace regression and browser verification are coordinated by the
  root task; no production service or publication was changed.
- Final Chrome verification used the isolated synthetic-owner account in
  `admin-browser-fixture.mjs`, not an operated account. At 1440x1200 and
  390x844, the agent directly checked labels, read/edit/save/copy, two-editor
  revision conflict, retained draft, explicit reapply/save, explicit reload,
  empty guidance and keyboard focus. Observed document/scroll widths matched
  at both sizes. Screenshots were inspected in the browser tool.
- Two real browser tabs selected different generic publications. Saving the
  first publication advanced only its guidance revision; comparing the second
  retained its own empty document/revision. A shared-localStorage defect was
  reproduced by three runtime tests before switching selection to per-tab
  sessionStorage, with no old-storage fallback.
- Final Node 22.23.4 `pnpm test` passed all package suites and the complete
  harness (70 files / 418 tests). Workspace typecheck, static/Desk Plugin build,
  admin build, lint and all 13 scans passed. The isolated fixture intentionally
  has no media storage/comment runtime; their unavailable states are not a
  claim of complete media/comment browser acceptance.

## Decisions

- Keep guidance private and site-scoped, outside public settings and static
  snapshots, so it can safely express editorial operating constraints.

## Blockers

- None.

## Result

Implementation and local browser/workspace verification are complete.
Independent VERIFY and COMPLETE gates passed. No production deployment is claimed.
