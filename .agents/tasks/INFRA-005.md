# INFRA-005: Complete multi-publication management and AiTrendTimes activation

- **Status**: in-progress
- **Created**: 2026-09-14
- **Branch**: feat/infra-005-complete-multisite-management
- **Scope**: apps/admin, apps/comments, packages/admin-client, packages/ops-cli, packages/persistence, docs

## Objective

Make every supported management capability site-qualified and independently
complete in the authenticated web UI and agent CLI/API. Activate AiTrendTimes
only after the complete multi-publication boundary is verified.

## Plan

- [ ] TC-01: Create the PostgreSQL site registry and replace the environment-only catalog in UI/API reads.
- [ ] TC-02: Add authenticated, idempotent blank-state site bootstrap with exact site authorization.
- [ ] TC-03: Prove site-qualified release manifests and S3-compatible object paths.
- [ ] TC-04: Provision and verify a separate AiTrendTimes static Pages deployment.
- [ ] TC-05: After narrow owner confirmation, connect production DNS and verify both publications remain independent.
- [ ] TC-06: Write the provider-neutral Korean publication-addition manual.
- [ ] TC-07: Add redacted JSON CLI bootstrap support to the versioned API contract.
- [ ] TC-08: Implement and test equivalent UI/API/CLI site lifecycle operations.
- [ ] TC-09: Complete and test UI/API/CLI parity for every supported management domain.
- [ ] TC-10: Remove default-only and environment-catalog paths; add cross-site isolation regressions.

## Progress

### 2026-09-14

- Recorded the non-functional operating target: CDN-served static public reads
  scale independently of PostgreSQL and remain suitable for a free/Hobby
  budget; database work is restricted to authenticated management and comment
  write/moderation paths.

### 2026-09-14

- Read-only inspection confirmed the current partial catalog and site-qualified
  persistence paths; no implementation began before GATE-APPROVAL.
- AiTrendTimes.com resolves to Cloudflare nameservers, while no matching Pages
  project currently exists.
- Updated the canonical platform design to define UI and CLI/API as independent,
  complete control planes and expanded INFRA-005 to cover every management
  domain before any production activation.
- Added the PostgreSQL site registry migration, owner UI/API site creation,
  idempotent agent bootstrap endpoint, and CLI site commands. Full regression
  suite passes while the remaining site-management parity routes are in work.

## Decisions

- PostgreSQL is the sole application site registry; no `ADMIN_SITES_JSON` or
  default-only compatibility reader remains after the migration.
- UI and CLI/API are independent, complete control planes over one domain
  contract; neither requires the other for a supported operation.
- Existing XRTechNews data and production DNS are protected. New publication
  data uses only `aitrendtimes`-qualified records and object keys.

## Blockers

- No implementation blocker. Production DNS and any chargeable resource action
  require a narrow owner confirmation at execution time.

## Result

Pending.
