# SECURITY-002: Visitor analytics consent

- **Status**: in-progress
- **Created**: 2026-09-19
- **Branch**: security/visitor-analytics-consent
- **Scope**: packages/content, apps/site, scripts/harness, public static release output

## Objective

Require an explicit visitor analytics choice before the public Google Analytics
runtime can load, while keeping the choice reversible and scoped to each
publication origin.

## Plan

- [x] TC-01: Implement the accessible bottom consent layer and deny-by-default
      runtime ordering for an absent preference on both canonical sites.
- [x] TC-02: Persist an explicit rejection, keep GA disabled after reload, and
      expose a settings/reopen control.
- [x] TC-03: Dispatch the existing consent event after explicit allowance,
      load exactly one configured GA tag, and make repeated actions idempotent.
- [x] TC-04: Add absent/denied/granted regression coverage and pass typecheck,
      site build, and the relevant harness tests.
- [ ] TC-05: Verify the consent layer and allow/reject behavior in production
      desktop and mobile-sized browser sessions for both canonical domains.

## Progress

### 2026-09-19

- GATE-WRITE and delegated GATE-APPROVAL passed.
- GATE-IMPLEMENT created this task record before consent-layer implementation.

## Decisions

- Keep the existing `publisher:consent` event as the integration boundary.
- Treat absent consent as denied and store only the analytics preference in a
  first-party, publication-origin-scoped key.
- Keep the consent layer platform-owned so the public static release does not
  acquire a new third-party runtime dependency.

## Blockers

- TC-05 cannot be performed from this repository's session: it names the
  operated publication domains, and `.agents/rules/repository-scope.md` keeps
  those domains and their production evidence out of the repository. The
  operator performs it from a private checkout after release.

### 2026-09-26

- Rebased onto `main`; stale edits to `packages/admin-client`, `packages/ops-cli`
  and the CLI contract test were dropped so nothing shipped was reverted.
- Implemented the consent layer as `consentRuntimeSource` in
  `packages/publication/src/static-runtime-recipes.ts`, emitted as
  `/site-runtime/consent.v1.js` and referenced from the shared `renderHead`,
  with the identical checked-in copy under `apps/site/public/site-runtime/`.
- TC-01 through TC-04 verified. TC-05 is deferred to the operator: it requires
  the operated domains, which the repository-scope rule keeps out of this
  repository.

## Result

Implemented and verified for TC-01 through TC-04. The public release grants
analytics only after an explicit allow action; an absent or denied preference
loads no Google tag and issues no Google request. TC-05 remains with the
operator.
