# ADMIN-001: Human Media Management

- **Status**: completed
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: apps/admin, packages/persistence, docs, browser and API harnesses

## Objective

Complete the human editorial workflow with an accessible, provider-neutral
media library that uses the same protected media and publication contracts as
agent automation.

## Plan

- [x] TC-01: Add a public-safe, selected-site media read model with isolation
      tests.
- [x] TC-02: Add accessible dashboard media-library states and interactions.
- [x] TC-03: Connect human upload and explicit approval to the protected media
      pipeline.
- [x] TC-04: Add approved-variant selection and post-save/publish separation.
- [x] TC-05: Cover role, origin, size, invalid-file, and cross-site denial.
- [x] TC-06: Run authenticated desktop/mobile browser verification.
- [x] TC-07: Run scoped and full regression without live provider credentials.

## Progress

### 2026-09-13

- GATE-WRITE and GATE-APPROVAL passed; implementation record created.
- Added a site-scoped authenticated media list, dashboard media library, upload,
  explicit approval, and approved-variant selection wiring.
- Removed object-store keys from every browser media response and added an
  authenticated, approved-variant-only preview route; the dashboard now shows
  a bounded upload state and private preview images.
- `pnpm vitest run scripts/harness/__tests__/admin-auth-contract.test.mjs
scripts/harness/__tests__/admin-site-isolation-contract.test.mjs
scripts/harness/__tests__/admin-media-management-contract.test.mjs
scripts/harness/__tests__/portable-persistence-integration.test.mjs` passed
  20 generic local-fixture checks. The portable integration covered image
  upload → explicit approval → approved-variant preview bytes using PGlite and
  S3rver, without a provider credential.
- Authenticated browser smoke passed on 2026-09-13 at desktop `1440x1200` and
  mobile `390x844`, confirming the media-library file control, keyboard focus,
  no horizontal overflow, and no console errors. It used only
  `ADMIN_DATA_DIR=.data/browser-admin` plus a development-only fixture identity.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm -r lint`, and
  `pnpm harness:scan` passed; the full harness reported 35 files / 149 tests.
- `pnpm --filter @publisher/admin typecheck` and
  `pnpm --filter @publisher/admin build` passed on the current worktree.

## Decisions

- Browser management and agent CLI/API are complementary supported surfaces.
- The browser receives no object-store credential or provider-console link.

## Blockers

- None.

## Result

Completed. The human dashboard now has a site-scoped media library, protected
upload and approval actions, approved-variant-only private previews, and
explicit image selection separate from post save and publication. Local
PGlite/S3rver integration, desktop/mobile authenticated browser smoke, and
full workspace regression verification passed without provider credentials.
