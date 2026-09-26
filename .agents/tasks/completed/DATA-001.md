# DATA-001 Editorial taxonomy and author personas

- **Status**: completed
- **Created**: 2026-09-15
- **Branch**: feat/infra-005-complete-multisite-management
- **Scope**: packages/content, packages/persistence, apps/admin, packages/admin-client, packages/ops-cli

## Objective

Give each publication separate categories and tags, and provide a private,
editable reporter persona that people and CLI/API agents receive while
authoring articles.

## Plan

- [x] TC-01: Add separate category/tag persistence, post validation, and static contracts.
- [x] TC-02: Add human multi-site taxonomy/persona management and post-editor controls; authenticated browser evidence recorded below.
- [x] TC-03: Add symmetric automation API and typed client contracts.
- [x] TC-04: Add CLI author/taxonomy operations and author-context planning output.
- [x] TC-05: Bootstrap the named first-level categories safely for both sites.
- [x] TC-06: Prove private persona omission from public/export paths.
- [x] TC-07: Run focused, full, and browser verification.

## Progress

### 2026-09-15

- Added separate category/tag collections, private author personas, browser
  management controls, versioned CRUD routes, typed client operations, and
  agent-first taxonomy/author/post planning commands.
- Added focused contracts that reject cross-collection tags, assert private
  persona omission from publication snapshots, and assert authenticated post
  mutations return the selected author context.
- Operated state was bootstrapped idempotently for two sites; no article,
  author, or media record was deleted (verified on an operated instance;
  evidence kept privately by the operator).
- In an isolated local PostgreSQL/PGlite fixture, authenticated as
  `data002-browser@example.test` (owner), Chrome rendered distinct
  `Categories (required)` and `Tags (optional)` labelled checkbox groups,
  author selection, and separate category/tag/author management controls.
  The editor exposed `Private editorial persona` only to the authenticated
  operator. A test-only persona was saved locally and displayed for the
  selected author: “Write concise, factual reports. Cite primary sources and
  distinguish verified facts from analysis.” No production record was read or
  changed.
- The same local Chrome view at 390x844 (iPhone 12 Pro emulation) reported
  `innerWidth === scrollWidth === clientWidth === 390` and `overflow: false`;
  the console was empty after reload.
  Keyboard navigation reaches the visible `Sign out` control, and all category
  and tag choices are native labelled checkboxes.
- Focused evidence: `scripts/harness/__tests__/admin-taxonomy-contract.test.mjs`
  verifies authenticated create/rename/archive revision behavior and selected
  private author context; `scripts/harness/__tests__/editorial-persona-contract.test.mjs`
  verifies taxonomy separation and persona omission from snapshots.
  Full evidence on 2026-09-15: `pnpm typecheck`, `pnpm test` (40 files / 191
  tests), `pnpm build`, and `pnpm harness:scan` (all six scans) exited 0.

## Decisions

- Categories are required primary sections; tags are optional granular metadata.
- Personas are private, server-stored authoring context rather than public author bio.

## Blockers

- None.

## Result

- Completed after all completion criteria and verification evidence were recorded.
