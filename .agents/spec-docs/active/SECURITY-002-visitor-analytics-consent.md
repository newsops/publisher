---
status: in-progress
type: SECURITY
tags: [web, mobile-web, typescript]
authority: delegated
---

# SECURITY-002: Visitor analytics consent

## Problem

The public GA runtime currently loads Google Analytics whenever the visitor
has not explicitly set `window.__publisherConsent.analytics` to `false`.
Therefore a first-time visitor can trigger the Google tag before seeing or
choosing an analytics preference. This is reproduced by opening either
canonical publication domain with no consent state and observing the external
Google tag request. The public sites need a visible, reversible choice before
any analytics tag runs.

## Architecture Review

### Affected Scope

Layer ids follow `scripts/harness/layer-map.json`.

- `packages/content/src/plugins/google-analytics.ts` (L0 contract):
  deny-by-default runtime contract and public plugin behavior.
- `packages/publication/src/static-runtime-recipes.ts` (L2 publication): the
  platform consent runtime source and its `/site-runtime/consent.v1.js`
  release artifact.
- `packages/publication/src/static-renderers.ts` (L2 publication): the consent
  script reference in the shared `renderHead`, so every rendered page carries
  it.
- `apps/site/app/layout.tsx`, `apps/site/public/site-runtime/consent.v1.js`
  (L4 site): the same runtime in the checked-in preview export.
- `scripts/harness/__tests__` (L5 scripts): absent/denied/granted regression
  coverage.
- public static release output and browser verification for each configured
  publication domain.

The consent layer is owned by the publication renderer rather than `apps/site`,
per `.agents/rules/layer-boundaries.md` and ARCH-004: the renderer is the
canonical public HTML and `apps/site` is its preview, so a layer implemented
only in `apps/site` would never reach a release.

Sibling scan completed: the existing GA runtime is the only public analytics
loader, and the static site has no other consent banner or third-party
analytics loader. The existing `publisher:consent` event is the integration
point and will not be replaced by a second consent protocol.

### Alternatives Considered

1. Keep automatic GA loading and only add a notice. Pro: no measurement loss.
   Con: a notice is not a choice and does not prevent pre-consent collection.
2. Add a third-party consent management platform. Pro: broader regional policy
   tooling. Con: adds an external runtime dependency and provider boundary for
   a single analytics category.
3. Ship a platform-owned bottom consent layer with deny-by-default GA and a
   persistent settings entry point. Pro: preserves static hosting, avoids a
   new provider, and directly controls tag ordering. Con: the platform must
   maintain the small UI and operator-specific legal copy.

### Decision

Choose alternative 3. The first-party layer renders before the GA runtime,
stores only the analytics preference, exposes equally prominent Allow and
Reject actions plus Settings, and dispatches the existing
`publisher:consent` event. No Google request or GA cookie is allowed while the
preference is absent or denied. Operators remain responsible for their privacy
notice and regional legal requirements.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing GA loader and consent event identified
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Add a static, accessible bottom consent layer with `Allow analytics`,
   `Reject`, and `Settings` actions; make the reject path one click and do not
   preselect analytics consent.
2. Persist the choice per publication origin using a first-party preference
   key; render the layer again when no decision exists and expose a footer
   control to reopen settings.
3. Set `window.__publisherConsent.analytics` to `false` before the plugin
   runtime executes. Dispatch `publisher:consent` with `analytics: true` only
   after an explicit allow action.
4. Keep the GA release contribution and CSP provider origins site-scoped; the
   static release must remain inert for absent/denied consent.

## Affected Files

- `packages/content/src/plugins/google-analytics.ts`
- `packages/publication/src/static-runtime-recipes.ts`
- `packages/publication/src/static-renderers.ts`
- `apps/site/app/layout.tsx`
- `apps/site/public/site-runtime/consent.v1.js`
- `scripts/harness/__tests__/visitor-analytics-consent-contract.test.mjs`
- this spec and `.agents/tasks/SECURITY-002.md`

## Completion Criteria

- [x] TC-01: With no stored preference, each canonical public site visibly
      renders the bottom consent layer and `script[data-publisher-google-analytics]`
      count remains `0` before interaction.
- [x] TC-02: Rejecting analytics stores a denied preference, keeps the Google
      tag count at `0` after reload, and exposes a settings/reopen control.
- [x] TC-03: Allowing analytics dispatches the existing consent event, loads
      exactly one GA tag, and preserves the configured measurement ID without
      duplicating tags on reload or repeated clicks.
- [x] TC-04: Automated regression tests cover absent, denied, and granted
      states; `pnpm typecheck`, site build, and the relevant harness tests exit 0.
- [ ] TC-05: Production browser verification confirms the layer and consent
      behavior on both publication domains in desktop and mobile-sized
      viewports.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                    | Notes                                                                                                                        |
| ----- | -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | browser contract     | Chrome DOM/network inspection on a fresh origin                    | Preconditions: clear only the publication consent key; verify no external GA request before interaction.                     |
| TC-02 | flow regression      | Vitest/browser smoke with denied preference and reload             | Preconditions: no live credentials; assert persistent denied state and settings control.                                     |
| TC-03 | flow regression      | Vitest/browser smoke with allow action                             | Preconditions: measurement ID comes from the public fixture; assert one tag and one event path.                              |
| TC-04 | typecheck + contract | `pnpm typecheck`, `pnpm build`, focused Vitest/harness tests       | Preconditions: local fixtures only; no production data mutation.                                                             |
| TC-05 | manual browser smoke | Chrome desktop and mobile-sized viewport on both canonical domains | Preconditions: Production Pages deployments already exist; observe the rendered layer and tag state without editing content. |

## Tasks

- [x] `.agents/tasks/SECURITY-002.md` — active implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Frontmatter contains `status: draft`, exactly one allowed `type: SECURITY`, non-empty `tags`, and `authority: delegated`.
Problem states the current first-visit GA behavior, the no-consent reproduction condition, and the required visible preference boundary.
Architecture Review contains the affected scope, completed sibling scan evidence, three alternatives with explicit pros and cons, and a decision tied to the stated trade-offs.
Completion Criteria contains five uniquely prefixed observable criteria (`TC-01` through `TC-05`), and Test Plan contains exactly one non-empty row for each criterion.
Every Test Plan row has a non-empty Notes value; the manual browser row explains its production-browser verification preconditions.
Tasks contains the required post-approval placeholder, and Evidence Log was empty before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: delegated` is present in the spec frontmatter, and the standing delegation in `.agents/rules/authority-delegation.md` authorizes ordinary implementation after a completed Architecture Review without item-by-item reapproval.
The Architecture Review is complete: affected scope and sibling scan are documented, three alternatives include explicit pros and cons, the decision records the trade-offs, and the Test Plan covers TC-01 through TC-05.
No SECURITY-002 implementation, commit, or production mutation was found before this approval gate; the current worktree changes are outside the spec's affected consent-layer scope.
Execution-time exceptions remain in force: chargeable resources, production DNS, production data deletion/overwrite, external communication, account changes, secret disclosure, and new external runtime/provider additions require a narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress
Implementation record exists at `.agents/tasks/SECURITY-002.md`, and the exact path is recorded in the `## Tasks` section.
The task plan maps TC-01 through TC-05 one-for-one to the deny-by-default consent layer, persistent rejection/settings control, idempotent explicit allowance, automated regression/build checks, and desktop/mobile production browser verification.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-26

Command: release page rendered from `renderProjectionPage` with the Google Analytics plugin installed and `consent: 'granted'` (fixture id `G-FIXTURE01`, placeholder origin), served locally and opened in the browser with no stored preference.
Observed result: `[data-consent-layer]` present with `role="region"` and `aria-label="Analytics consent"`, actions `Allow analytics` / `Reject` / `Settings`; `script[data-publisher-google-analytics]` count `0`; no `googletagmanager.com` entry in `performance.getEntriesByType('resource')`; `window.__publisherConsent` absent. Mobile viewport (375×812): layer pinned to the bottom, 45px touch targets, no horizontal overflow, tag count still `0`. Buttons are real `<button type="button">` with `tabIndex 0` and take focus.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-26

Command: `Reject` clicked, then the page reloaded; afterwards the footer control reopened the layer.
Observed result: `localStorage['publisher.consent.analytics']` = `denied`, layer removed, tag count `0`, `Privacy settings` control present inside `.footer-bar-inner`. After reload: no layer, tag count `0`, no Google request, reopen control still present. The reopen control brought the layer back, so the choice is reversible.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-26

Command: `Settings` then `Allow analytics` clicked, then allow repeated through the reopen control, then the page reloaded.
Observed result: settings panel reported the stored choice; preference became `granted`, `window.__publisherConsent.analytics` `true`, exactly one `script[data-publisher-google-analytics]` with `src` `https://www.googletagmanager.com/gtag/js?id=G-FIXTURE01`, and exactly one Google request — fired only after the allow action. Repeating the allow kept the count at `1`; reloading with a stored grant kept it at `1` with no layer shown.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-26

Command: `pnpm typecheck`, `pnpm build`, `pnpm harness:test`, `pnpm harness:scan`.
Observed result: typecheck and build exit 0; `Test Files 50 passed (50)`, `Tests 271 passed (271)` including the new `visitor-analytics-consent-contract.test.mjs` (10 cases covering absent, denied and granted states, both script execution orders, a missing measurement id, and a throwing `localStorage`); `[harness] 12 scans passed`. The test executes the shipped `consentRuntimeSource` and `googleAnalyticsRuntimeSource` strings themselves, so it cannot drift from the release artifacts, and it asserts that the checked-in preview copy equals the exported source.

### [GATE-COMPLETE: TC-05] — ⏸️ DEFERRED TO THE OPERATOR | 2026-09-26

Not performed. TC-05 requires visiting the operated publication domains, which is operating a publication rather than building the program, and `.agents/rules/repository-scope.md` keeps those domains and their evidence out of this repository. The equivalent verification was performed against the canonical renderer output above, in desktop and mobile-sized viewports. The operator runs TC-05 against their own deployments from a private checkout after this change is released and keeps the evidence privately.
