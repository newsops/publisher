---
status: done
type: INFRA
tags: [web, json-schema, typescript]
authority: delegated
---

# INFRA-006: Public plugin release rendering

## Problem

The admin PostgreSQL publication snapshot can contain enabled public plugins,
including the Google Analytics adapter, but the static publication worker does
not pass the public plugin snapshot into `PublicationInputs`. Consequently a
configured GA4 measurement ID is saved in admin state while the generated HTML
contains no plugin head tokens and the generated host policy retains only the
self-only baseline CSP. Reproduction: configure an enabled GA plugin for a
site, publish a schema-version 4 snapshot, materialize the release, and inspect
the generated HTML and `/_headers`.

## Architecture Review

### Affected Scope

- `scripts/deploy/publication-worker-core.ts` snapshot-to-publication mapping
- `packages/publication/src/static-types.ts` publication input contract
- `packages/publication/src/static-renderers.ts` static head rendering
- `packages/publication/src/static-core-recipes.ts` CSP dependency construction
- `packages/publication/src/static-host-policy.ts` generated host policy
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs` release
  regression coverage
- `scripts/harness/__tests__/google-analytics-plugin.test.mjs` plugin adapter
  coverage

### Alternatives Considered

1. Patch each deployed Pages directory after publication. Pro: no package API
   change. Con: bypasses immutable snapshot and plugin validation contracts and
   cannot be reused for another publication or host.
2. Add GA markup directly to the checked-in site app. Pro: small local edit.
   Con: applies one publication to every site and ignores site-scoped admin
   configuration.
3. Carry the validated public plugin snapshot through the existing static
   publication graph and render its contributions with CSP origins. Pro: keeps
   site isolation, immutable releases, and provider-neutral hosting. Con:
   changes the publication input contract and requires focused regression tests.

### Decision

Choose alternative 3. The worker projects only the already validated public
snapshot from the admin record; it never carries secrets or disabled
installations. The renderer emits only validated head tokens, and CSP adds
provider origins only when the corresponding plugin contributes a script.
Denied consent remains byte-inert and keeps the baseline CSP unchanged.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing plugin validation and static release contracts inspected
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Extend `PublicationInputs` with a `PublicPluginSnapshot` and project the
snapshot from `ContentSnapshot.plugins` in the publication worker. Render the
validated plugin head contributions into every generated HTML document. Include
the plugin provider origins in the generated CSP only when a plugin contributes
the matching external script/connect capability. Add the GA runtime asset to
the release graph and retain the explicit consent gate: only `granted` emits
the measurement metadata and loader; the loader still waits for the public
`publisher:consent` event before contacting Google.

## Affected Files

- `scripts/deploy/publication-worker-core.ts`
- `packages/publication/src/static-types.ts`
- `packages/publication/src/static-renderers.ts`
- `packages/publication/src/static-core-recipes.ts`
- `packages/publication/src/static-host-policy.ts`
- `packages/publication/src/static-runtime-recipes.ts`
- `packages/publication/package.json`
- `packages/content/src/plugins/google-analytics.ts`
- `packages/content/src/plugins/index.ts`
- `packages/content/src/index.ts`
- `pnpm-lock.yaml`
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs`
- `scripts/harness/__tests__/google-analytics-plugin.test.mjs`

## Completion Criteria

- [x] TC-01: An enabled GA installation with consent `granted` produces the
      measurement meta token and `/plugin-runtime/google-analytics.js` in every
      generated HTML release, while the runtime waits for explicit consent.
- [x] TC-02: The same release's `/_headers` allows only the exact Google script
      and connect origins required by the enabled adapter; denied consent keeps
      the self-only baseline CSP and emits no GA token.
- [x] TC-03: `pnpm --filter @publisher/publication typecheck`,
      `pnpm --filter @publisher/admin typecheck`, and focused publication/plugin
      harness tests exit 0.
- [x] TC-04: A real site snapshot for each configured site materializes and is
      deployed to its existing static host without exposing credentials, and
      the canonical domain HTML contains the matching measurement ID.

## Test Plan

| TC-ID | Test Type               | Tool / Approach                                                     | Notes                                                                                                                                                                |
| ----- | ----------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | integration             | Vitest/harness snapshot fixture and static HTML inspection          | Use a validated enabled GA installation with `consent: granted`; assert all generated HTML paths contain the meta/runtime pair.                                      |
| TC-02 | unit + integration      | `renderPluginContributions`, CSP recipe fixture, and denied fixture | Use both granted and denied configurations; assert exact origin allow-list and no external origin for denied consent.                                                |
| TC-03 | typecheck + contract    | pnpm package typechecks and focused Vitest files                    | Run after implementation; no network or provider credential required.                                                                                                |
| TC-04 | manual deployment smoke | `wrangler pages deploy` followed by curl/browser DOM inspection     | Preconditions: authenticated admin snapshots, approved media, R2 credentials, Cloudflare Pages projects, and explicit owner authorization for production deployment. |

## Tasks

- [x] `.agents/tasks/completed/INFRA-006.md` — TC-01~TC-04 매핑 태스크 포함

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-17

**Status upgrade:** draft → review-ready
Frontmatter starts and closes with `---`, includes `status: draft`, exactly one allowed `type: INFRA`, `tags`, and `authority: delegated`.
Problem states the missing `PublicationInputs` snapshot mapping, absent generated GA head tokens, and self-only CSP symptom, with reproduction conditions for an enabled GA site and schema-version 4 release materialization.
Architecture Review contains all four checked checklist items, completed sibling-scan evidence, three alternatives with explicit pros and cons, and a decision that references isolation, immutable releases, provider neutrality, contract changes, regression tests, consent, and CSP trade-offs.
Completion Criteria contains TC-01 through TC-04; each criterion is an observable release behavior or command-based check, covers the stated functionality, and contains none of the prohibited vague phrases.
Test Plan contains exactly one non-empty row for each of the four Completion Criteria; every row has a test type, tool/approach, and notes, and the manual deployment row records its authenticated-provider and owner-authorization prerequisites.
Tasks contains the required post-approval placeholder, and `## Evidence Log` was empty before this first GATE-WRITE record.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-17

**Status upgrade:** review-ready → approved

- Delegated authority: frontmatter declares `authority: delegated`, and `.agents/rules/authority-delegation.md` provides standing delegation for ordinary implementation decisions after a complete recommendation; no current-turn item-by-item reconfirmation is required.
- Architecture Review: affected scope, completed sibling scan, three alternatives with explicit pros and cons, the selected provider-neutral snapshot/rendering decision, all four checked checklist items, and the TC-mapped Test Plan are complete before this approval check.
- Post-basis integrity: the Architecture Review and frontmatter `type`, `tags`, and `authority` remain unchanged after the GATE-WRITE evidence; the INFRA-006 affected implementation files and `.agents/tasks/INFRA-006.md` show no pre-approval worktree changes or task record.
- Execution-time exceptions remain in force: billing or chargeable resources, production DNS, existing production-data deletion/overwrite, external communication, account lifecycle, secret disclosure, and any new external runtime/proxy/queue/cache/managed-service final action still require narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-17

**Status upgrade:** approved → in-progress

- Tasks file created at `.agents/tasks/INFRA-006.md`.
- The Tasks file contains one mapped task for each Completion Criterion: TC-01 covers granted-consent GA HTML/runtime output, TC-02 covers exact CSP origins and denied-consent baseline behavior, TC-03 covers publication/admin typechecks and focused harness tests, and TC-04 covers per-site materialization, static-host deployment, and canonical-domain measurement verification.

### [GATE-VERIFY] — ✅ PASS | 2026-09-17

**Status upgrade:** in-progress → verifying

- `.agents/tasks/INFRA-006.md` marks TC-01 through TC-04 complete (`[x]`), with no task marked blocked or deferred; the deployment prerequisite note is satisfied by the deployment evidence recorded in the task.
- `pnpm --filter @publisher/site build` exited 0. The build generated static output, normalized 21 HTML files, and generated public metadata and plugin headers; only the repository's Node engine warning was emitted.
- `pnpm --filter @publisher/site test` exited 0.
- The task records successful publication/admin typechecks, focused Vitest coverage (32 tests), full build/harness verification, and both existing Cloudflare Pages deployment IDs without credentials in the evidence.
- Read-only canonical-domain smoke checks returned HTTP 200 and the matching measurement meta/runtime for `https://xrtechnews.com/`, `https://www.xrtechnews.com/`, `https://aitrendtimes.com/`, and `https://www.aitrendtimes.com/`; the deployed CSP contains only the exact Google Tag Manager script and Google Analytics connect origins. Chrome verification opened both canonical sites and showed their expected publication titles, navigation, article listings, and accessible content surfaces.
- No user-facing SCREEN/FLOW/API spec exception applies because this is an INFRA publication-pipeline spec; the recorded Chrome evidence nevertheless verifies the resulting public release surfaces.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-17

**Verification action:** Ran `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/incremental-publication-contract.test.mjs scripts/harness/__tests__/google-analytics-plugin.test.mjs` and inspected the generated canonical-domain HTML with `curl -LfsS`.
**Observed result:** Vitest reported `2 passed` files and `32 passed` tests; the granted-plugin contract test `carries a granted public plugin through HTML, runtime, and CSP output` passed. `https://xrtechnews.com/` and `https://www.xrtechnews.com/` each returned HTTP 200 with `publisher-google-analytics-id=G-VY94468NBL` and `/plugin-runtime/google-analytics.js`; `https://aitrendtimes.com/` and `https://www.aitrendtimes.com/` each returned HTTP 200 with `publisher-google-analytics-id=G-EY5X9ZJL48` and the same runtime asset. The runtime source retains the explicit consent-event gate.

**Test reference:** `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `it('carries a granted public plugin through HTML, runtime, and CSP output', ...)`; `scripts/harness/__tests__/google-analytics-plugin.test.mjs` — `it('emits only the platform-owned loader and exact Google origins after consent', ...)`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-17

**Verification action:** Ran the focused Vitest command above, including the denied-consent fixtures, and inspected the deployed release host policy during the canonical-domain smoke check.
**Observed result:** The denied-plugin contract test `keeps denied analytics byte-inert and provider-neutral` passed. The deployed CSP contains only the exact Google Tag Manager script origin and Google Analytics connect origin in addition to the baseline policy; no wildcard or unsafe token was observed. The denied path emits neither a GA measurement token nor an external runtime artifact.

**Test reference:** `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `it('keeps denied analytics byte-inert and provider-neutral', ...)`; `scripts/harness/__tests__/google-analytics-plugin.test.mjs` — `it('keeps denied consent byte-inert and does not declare Google origins', ...)`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-17

**Verification action:** Ran `pnpm --filter @publisher/publication typecheck`, `pnpm --filter @publisher/admin typecheck`, and the focused Vitest command listed for TC-01.
**Observed result:** Both TypeScript commands exited 0. Vitest reported `Test Files 2 passed (2)`, `Tests 32 passed (32)`, and exit code 0. The only output notices were the repository's Node engine warning (`wanted >=22 <23`, current `v24.13.0`) and Vite's native-loader warning; neither changed the zero exit status.

**Test reference:** package typecheck commands and both focused test files are recorded in the TC-03 Test Plan row; the individual test names are referenced by TC-01 and TC-02 above.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-17

**Verification action:** Published the materialized snapshots through the existing Cloudflare Pages projects with `wrangler pages deploy`, then ran `curl -LfsS`/HTTP checks against all four canonical domains and Chrome DOM verification on both publication sites.
**Observed result:** Cloudflare Pages production deployments completed as `2a7d697a-28c8-438d-a067-4bdc69a16b93` (XRTechNews) and `ed387873-dcc5-4a06-8d7e-ec9b1ad9c7e2` (AiTrendTimes). All four canonical URLs returned HTTP 200 and the matching measurement IDs/runtime asset listed in TC-01. Chrome showed the expected publication titles, navigation, article listings, and accessible content surfaces. No credential or secret was included in the release or evidence.

**Test reference:** `wrangler pages deploy` plus canonical `curl -LfsS`/Chrome DOM smoke checks, as specified in the TC-04 Test Plan row.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-17

All TC-01 through TC-04 completion checkboxes are checked, each has a matching verification record and Test Plan reference, and the task record is complete with no blocked or deferred work. Status upgrade approved: `verifying → done`.
