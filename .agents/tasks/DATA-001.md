# DATA-001 Editorial taxonomy and author personas

- **Status**: in-progress
- **Created**: 2026-09-15
- **Branch**: feat/infra-005-complete-multisite-management
- **Scope**: packages/content, packages/persistence, apps/admin, packages/admin-client, packages/ops-cli

## Objective

Give each publication separate categories and tags, and provide a private,
editable reporter persona that people and CLI/API agents receive while
authoring articles.

## Plan

- [x] TC-01: Add separate category/tag persistence, post validation, and static contracts.
- [ ] TC-02: Add human multi-site taxonomy/persona management and post-editor controls; browser evidence pending.
- [x] TC-03: Add symmetric automation API and typed client contracts.
- [x] TC-04: Add CLI author/taxonomy operations and author-context planning output.
- [x] TC-05: Bootstrap the named first-level categories safely for both sites.
- [x] TC-06: Prove private persona omission from public/export paths.
- [ ] TC-07: Run focused, full, and browser verification.

## Progress

### 2026-09-15

- Added separate category/tag collections, private author personas, browser
  management controls, versioned CRUD routes, typed client operations, and
  agent-first taxonomy/author/post planning commands.
- Added focused contracts that reject cross-collection tags, assert private
  persona omission from publication snapshots, and assert authenticated post
  mutations return the selected author context.
- Production state was bootstrapped idempotently for `default` and
  `aitrendtimes`; no article, author, or media record was deleted.

## Decisions

- Categories are required primary sections; tags are optional granular metadata.
- Personas are private, server-stored authoring context rather than public author bio.

## Blockers

- None.

## Result

- Pending implementation.
