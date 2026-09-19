# Split apps/admin/app/lib by Layer

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: apps/admin/app/lib, apps/admin/app/api, packages/content, scripts/admin, harness

## Objective

Make the admin's directory layout carry its layer: `adapters/`, `services/`,
`http/`, and a composition root, with adapter-needed rules lowered into
`packages/content` and routes importing one index.

## Plan

- [x] TC-01: directory split, map by globs.
- [x] TC-02: layer-imports baseline 33 → 3.
- [x] TC-03: route-shape baseline 11 → 0.
- [x] TC-04: no SQL or storage clients in http/services.
- [x] TC-05: gates and browser check.

## Progress

### 2026-09-19

- 244 import specifiers rewritten by a scripted move; `managed-validation`,
  `managed-seed`, `content-release`, `site-id`, and plugin installation
  transitions lowered into `packages/content`.
- `services/errors.ts` (`ServiceError`), `adapters/account-store.ts`,
  `adapters/file-plugin-repository.ts`, `lib/index.ts` composition with
  `DeskDependencies`, `buildJobsForSite`, `findArchiveRestoreOperation`.
- `authorizedSiteId(request, identity, minimumRole)` unifies browser site
  authorization; `scripts/admin/{clean-room,reconcile}.ts` moved from the
  persistence package and wired to the root `package.json`.

## Decisions

- Comment moderation keeps its editor policy (API-001), now stated
  explicitly at the call site instead of implied by the absence of a check.
- `embeds/x` is exempt from site resolution: it resolves a public URL and
  touches no site data.

## Blockers

- None.

## Result

Baseline: layer-imports 33 → 3, route-shape 11 → 0, env-access 27 → 24
(re-keyed to the new paths; ARCH-005 removes them).
