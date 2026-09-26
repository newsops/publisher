# INFRA-006: Public plugin release rendering

- **Status**: complete
- **Created**: 2026-09-17
- **Branch**: feat/cli-plugin-lifecycle
- **Scope**: scripts/deploy/publication-worker-core.ts, packages/publication, scripts/harness

## Objective

Carry validated public plugin snapshots from admin publication inputs through
static rendering and host-policy generation, with consent-aware Google
Analytics release coverage and deployment verification.

## Plan

- [x] TC-01: Project enabled, granted Google Analytics plugin snapshots into every generated HTML release and verify the measurement meta token, runtime asset, and explicit-consent runtime behavior.
- [x] TC-02: Generate the exact provider script/connect CSP origins for enabled adapters and preserve the self-only baseline with no GA token when consent is denied.
- [x] TC-03: Run the publication and admin typechecks plus focused incremental-publication and Google Analytics plugin harness tests, and record exit results.
- [x] TC-04: Materialize and deploy a real site snapshot for each configured site to its existing static host, then verify canonical-domain measurement IDs without exposing credentials.

## Progress

### 2026-09-17

- GATE-WRITE and delegated GATE-APPROVAL passed; implementation task record created.
- GATE-IMPLEMENT maps each Completion Criterion (TC-01 through TC-04) to at least one implementation or verification task.
- Publication code carries validated plugin snapshots into HTML/runtime/CSP output; legacy HTML snapshot bodies were converted to the canonical Markdown contract for release materialization without changing article/media inventory.
- Both publications of an operated instance were deployed to Cloudflare Pages production, branch `main` (deployment IDs kept privately by the operator).
- Canonical `curl -LfsS` checks returned HTTP 200 and matching GA measurement meta/runtime on each apex and `www` origin (verified on an operated instance; evidence kept privately by the operator).
- Chrome DOM checks returned the matching measurement meta IDs and local runtime script on both canonical sites; visible accessibility trees showed the full article/navigation surfaces.
- `pnpm --filter @publisher/publication typecheck`, `pnpm --filter @publisher/admin typecheck`, focused Vitest (32 tests), and `pnpm build` passed. Node 24 engine/Vite native-loader notices are warnings only.
- Full `pnpm typecheck`, `pnpm harness:scan` (6 scans), and `pnpm harness:test` (40 files, 194 tests) passed; `git diff --check` is clean.

## Decisions

- Keep the task boundary aligned with the approved provider-neutral snapshot,
  rendering, CSP, and consent design in the INFRA-006 spec.

## Blockers

- None. The approved execution-time authorization and provider credentials were
  available for the existing Cloudflare Pages projects and both deployments
  completed successfully.

## Result

Complete. GA configuration is present in the generated production HTML for both
existing sites, with consent-aware runtime loading and exact CSP origins; both
Cloudflare Pages production deployments and canonical domains were verified.
