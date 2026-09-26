# Per-Publication Agent Guidance

- **Status**: in-progress
- **Created**: 2026-09-15
- **Branch**: feat/infra-005-complete-multisite-management
- **Scope**: apps/admin, packages/persistence, packages/admin-client, packages/ops-cli

## Objective

Provide private, site-scoped editorial guidance that human operators and LLM
agents can each read and edit through their respective complete management
surfaces. The guidance must inform agent planning without becoming public
publication data or a bypass of server validation.

## Plan

- [ ] TC-01: Add private per-site persistence and public/export omission coverage.
- [ ] TC-02: Add authorized, revision-checked automation API and audit behavior.
- [ ] TC-03: Add complete accessible human admin management UI.
- [ ] TC-04: Add typed client and non-interactive CLI get/set operations.
- [ ] TC-05: Surface current guidance before agent-facing content mutations.
- [ ] TC-06: Run focused and workspace regression verification.

## Progress

### 2026-09-15

- GATE-WRITE and delegated GATE-APPROVAL passed; implementation task created.
- Revalidated the implementation boundary: existing publication settings are
  serialized into public snapshots, while site registry records, versioned v2
  routes, the reusable admin client, and the non-browser CLI provide the
  correct private extension points.

## Decisions

- Keep guidance private and site-scoped, outside public settings and static
  snapshots, so it can safely express editorial operating constraints.

## Blockers

- None.

## Result

Pending implementation.
