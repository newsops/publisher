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

- [ ] TC-01: Add separate category/tag persistence, post validation, and static contracts.
- [ ] TC-02: Add human multi-site taxonomy/persona management and post-editor controls.
- [ ] TC-03: Add symmetric automation API and typed client contracts.
- [ ] TC-04: Add CLI author/taxonomy operations and author-context planning output.
- [ ] TC-05: Bootstrap the named first-level categories safely for both sites.
- [ ] TC-06: Prove private persona omission from public/export paths.
- [ ] TC-07: Run focused, full, and browser verification.

## Progress

### 2026-09-15

- Created after DATA-001 design approval; implementation has not started.

## Decisions

- Categories are required primary sections; tags are optional granular metadata.
- Personas are private, server-stored authoring context rather than public author bio.

## Blockers

- None.

## Result

- Pending implementation.
