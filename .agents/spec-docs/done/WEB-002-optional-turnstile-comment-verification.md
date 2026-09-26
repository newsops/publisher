---
status: done
type: SECURITY
tags: [web, rest, typescript, auth]
---

# WEB-002: Optional Turnstile verification for comment submissions

## Problem

The comment form already refuses a submission without a human-verification
token, but a newly deployed installation has no first-party browser component
that obtains one. On a static article page configured with a comments origin
and submissions enabled, a visitor can enter a name and comment yet receives
"Complete human verification first." because no token-producing provider is
loaded. The approved production Turnstile widget must enable protected comment
writes without making Cloudflare, Turnstile, or any paid plan an application
contract for other operators.

## Architecture Review

### Affected Scope

- `apps/site/app/components/CommentSection.tsx`: public build-time provider
  configuration and non-secret widget container markup.
- `apps/site/public/site-runtime/comments.v1.js`: provider-neutral comment
  submission flow and verification-token event boundary.
- `apps/site/public/site-runtime/turnstile.v1.js` (new): optional browser
  adapter that loads Turnstile only when the static build opts in.
- `scripts/generate-plugin-headers.mjs` and `apps/site/public/_headers`:
  exact CSP origins for an enabled widget, including its frame origin.
- `apps/comments`: existing generic Siteverify request configuration and
  fail-closed token validation, with no provider-specific persistence or proxy.
- `docs/deployment.md`, `docs/ai-assisted-deployment.ko.md`, and harness
  tests: operator setup, omission behavior, CSP, and token-flow regressions.

### Alternatives Considered

1. Put Turnstile directly into the generic comments runtime. Pro: one script
   path. Con: makes a Cloudflare vendor dependency part of the portable comment
   contract and loads a third party for every installation.
2. Leave token acquisition entirely to custom operator code. Pro: no new
   shipped adapter. Con: the approved first pilot cannot submit comments from
   its static site without bespoke integration work and has no tested reference
   implementation.
3. Ship an opt-in, static Turnstile adapter behind explicit public build
   configuration while retaining the existing provider-neutral token event.
   Pro: the first pilot has an auditable integration, while omitted config
   loads no Turnstile code or CSP origin and other operators retain provider
   choice. Con: enabled builds have an external client-side availability and
   privacy dependency for comment submission.

### Decision

Choose alternative 3. The static site will emit the Turnstile widget and its
small adapter only when a non-secret `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
alongside the existing comments origin and enabled-submission configuration.
The adapter loads Cloudflare's documented HTTPS challenge script, writes the
verified token through the existing `publisher:verification-token` event, and
resets the widget after a submission attempt. The Worker continues to use the
generic `HUMAN_VERIFICATION_URL` and secret configuration, pointed by this
operator to Cloudflare Siteverify, and continues to fail closed for absent,
expired, reused, or invalid tokens. An omitted site key leaves the public
bundle provider-neutral: no Cloudflare script, frame, CSP origin, or submission
control is emitted. This is an operator-selected integration, not a new proxy,
database, queue, or mandatory default.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing `CommentSection`, `comments.v1.js`, generic
      `publisher:verification-token` event, and CSP generator were inspected;
      no Turnstile adapter or external challenge script exists.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Treat the site key and Turnstile public origin as build-time public data;
   never expose the Siteverify secret in static files, source control, logs, or
   `NEXT_PUBLIC_*` output.
2. Render the form only when a comments origin, submissions enabled, and the
   opt-in site key are all present. Keep approved-comment reads independent of
   the widget, so a verification outage never hides static articles or public
   comment reads.
3. Load the provider script asynchronously from the exact documented origin,
   create one widget for each enabled comment form, dispatch only the token
   through the existing event contract, and show a recoverable status on script
   or challenge failure.
4. Generate exact `script-src`, `connect-src`, and `frame-src` CSP additions
   only for an enabled build. The baseline CSP remains self-only with no
   wildcard, unsafe-inline, or Cloudflare origin when the feature is omitted.
5. Configure the comments Worker with `HUMAN_VERIFICATION_URL` set to the
   documented Siteverify endpoint and its secret stored only in Cloudflare
   Worker Secrets. This task creates no new database, connection proxy, storage
   binding, DNS record, paid plan, or Cloudflare runtime contract.

## Affected Files

- `apps/site/app/components/CommentSection.tsx`
- `apps/site/public/site-runtime/comments.v1.js`
- `apps/site/public/site-runtime/turnstile.v1.js` (new)
- `scripts/generate-plugin-headers.mjs`
- `scripts/harness/__tests__/comment-isolation-contract.test.mjs`
- `scripts/harness/__tests__/plugin-static-boundary.test.mjs`
- `scripts/harness/browser-smoke.mjs`
- `docs/deployment.md`
- `docs/ai-assisted-deployment.ko.md`

## Completion Criteria

- [x] TC-01: a site build with `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, enabled
      comments, and a valid comments origin emits a non-secret site key,
      Turnstile widget container, and `turnstile.v1.js` reference, while no
      HTML or JavaScript output contains the Siteverify secret or a database URL.
- [x] TC-02: a site build without the opt-in site key emits no Turnstile script,
      frame, CSP origin, or comment submission form, while approved-comment
      read markup remains present for a configured comments origin.
- [x] TC-03: runtime contract tests prove a successful provider callback
      dispatches the existing verification-token event, submission failure
      resets the widget, and script/challenge failure leaves the article and
      approved-comment read path usable.
- [x] TC-04: generated static headers add only
      `https://challenges.cloudflare.com` to exact `script-src`, `connect-src`,
      and `frame-src` directives when enabled, and preserve the self-only
      baseline when omitted.
- [x] TC-05: deployment documentation names the public site key, the Worker
      Siteverify URL, and the Worker-only verification secret; it states that
      Turnstile is optional, free-plan eligibility is an operator billing
      question, and no app consumer is required to adopt Cloudflare.
- [x] TC-06: `pnpm --filter @publisher/site build`,
      `pnpm --filter @publisher/site test`, `pnpm typecheck`, and `pnpm test`
      exit 0 after the implementation and static-output tests complete.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                                                      | Notes                                                                                                                                                                                                                                                                                       |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | static boundary      | Enabled fixture build plus `turnstile-comment-contract.test.mjs`                                                     | A fake public site key and test comments origin produced widget/script output; scanner rejected verification secrets and PostgreSQL URLs.                                                                                                                                                   |
| TC-02 | static boundary      | Omitted fixture build plus `turnstile-comment-contract.test.mjs`                                                     | Omitted key removed the runtime file, external CSP origin, and form; an empty public comment list remains a valid read state.                                                                                                                                                               |
| TC-03 | integration          | `scripts/harness/__tests__/turnstile-comment-contract.test.mjs`                                                      | The focused DOM harness stubs provider callback, reset, and script failure; it does not call Cloudflare or require a live token.                                                                                                                                                            |
| TC-04 | contract             | Enabled/omitted fixture builds and `turnstile-comment-contract.test.mjs`                                             | Enabled headers contain only the documented origin; omitted headers preserve no external Turnstile origin or wildcard.                                                                                                                                                                      |
| TC-05 | documentation review | `docs/deployment.md` and `docs/ai-assisted-deployment.ko.md` reviewed with contract source assertions                | Documents exact variable destinations and optional-provider/billing language without account IDs or secret values.                                                                                                                                                                          |
| TC-06 | regression           | `pnpm typecheck`, `pnpm test`, `pnpm -r lint`, `pnpm harness:scan`, and `PUBLIC_BROWSER_ONLY=1 pnpm harness:browser` | Repository regression passed after focused adapter coverage. The public-only browser mode records route status, focus, overflow, console errors, and internal-link checks without requiring an unrelated admin session; Node 24 issued the existing engine warning while commands exited 0. |

## Tasks

- [x] `.agents/tasks/completed/WEB-002.md` — optional Turnstile implementation and verification checklist.

## Evidence Log

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

**Verification:** `NEXT_PUBLIC_COMMENT_ORIGIN=https://comments.example.test NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED=true NEXT_PUBLIC_TURNSTILE_SITE_KEY=public-test-site-key pnpm --filter @publisher/site build`, followed by static-output checks for `public-test-site-key`, `/site-runtime/turnstile.v1.js`, the adapter file, and absence of `HUMAN_VERIFICATION_SECRET`, `COMMENTS_DATABASE_URL`, and PostgreSQL URL patterns.
**Observed result:** the build exited 0; article HTML contained the public test key, widget container, form, and adapter reference; `apps/site/out/site-runtime/turnstile.v1.js` existed; no scanned private verification secret or database URL was found.
**Test reference:** `scripts/harness/__tests__/turnstile-comment-contract.test.mjs` — `optional Turnstile comment verification > keeps the provider opt-in and excludes every private value from static input`; included in `pnpm test` (32 files, 129 tests passed).

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

**Verification:** `env -u NEXT_PUBLIC_TURNSTILE_SITE_KEY NEXT_PUBLIC_COMMENT_ORIGIN=https://comments.example.test NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED=true pnpm --filter @publisher/site build`, then `! test -e apps/site/out/site-runtime/turnstile.v1.js`, `! rg -l -F 'challenges.cloudflare.com' apps/site/out`, `! rg -l --glob '*.html' -F 'data-comment-form' apps/site/out`, and `rg -l -F 'data-comment-list' apps/site/out/2026/09/sample-report-01.html`.
**Observed result:** the omitted-key build exited 0 with the self-only CSP generator result; no adapter file, Turnstile CSP origin, or submission form appeared in static HTML, while the article retained `data-comment-list` approved-comment read markup.
**Test reference:** `scripts/harness/__tests__/turnstile-comment-contract.test.mjs` — `optional Turnstile comment verification > keeps the provider opt-in and excludes every private value from static input`; omitted-output assertions above supply the fixture-build boundary absent from the source-level contract.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

**Verification:** `pnpm test` executed the focused adapter contract as part of the harness suite.
**Observed result:** Vitest reported `Test Files 32 passed (32)` and `Tests 129 passed (129)`; the DOM fixture observed `publisher:verification-token` with `verified-token`, `turnstile.reset(17)` after `publisher:verification-reset`, and `Human verification is unavailable. Try again.` after provider-script failure.
**Test reference:** `scripts/harness/__tests__/turnstile-comment-contract.test.mjs` — `dispatches the provider-neutral token event and resets after a submission attempt` and `leaves a recoverable status when the provider script cannot load`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

**Verification:** the enabled build command from TC-01 followed by `rg -n -F 'challenges.cloudflare.com' apps/site/out/_headers`, and the omitted-key commands from TC-02.
**Observed result:** enabled `_headers` contained `https://challenges.cloudflare.com` only in `script-src`, `connect-src`, and `frame-src`; the omitted output contained no such origin. Both builds completed successfully.
**Test reference:** `scripts/harness/__tests__/turnstile-comment-contract.test.mjs` — `keeps the provider opt-in and excludes every private value from static input`, which asserts the exact origin constant, frame addition, and omitted-runtime removal.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

**Verification:** reviewed `docs/deployment.md` lines 171–205 and `docs/ai-assisted-deployment.ko.md` lines 89–99 with `rg -n 'Turnstile|HUMAN_VERIFICATION|NEXT_PUBLIC_TURNSTILE'`.
**Observed result:** documentation separates the public `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Worker `HUMAN_VERIFICATION_URL`, and Worker-only `HUMAN_VERIFICATION_SECRET`; it explicitly says Turnstile is optional and that free-plan eligibility is an operator billing decision, not a Cloudflare requirement for application consumers.
**Test reference:** no automated test was added because this criterion is a human-readable operator-documentation requirement; the exact line review above is the recorded verification method.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-13

**Verification:** `pnpm --filter @publisher/site build`, `pnpm --filter @publisher/site test`, `pnpm typecheck`, and `pnpm test`; supplementary `pnpm -r lint` and `pnpm harness:scan` were also run.
**Observed result:** every required TC-06 command exited 0; `pnpm test` included a successful static site build and reported 32 passing test files / 129 tests; lint completed for all seven scoped packages and the scanner reported six scans passed. Node v24.13.0 emitted the known engine-range warning only. The archived task also records a successful prior `PUBLIC_BROWSER_ONLY=1 pnpm harness:browser` public-flow run; a later repeat in this environment could not start its Chrome DevTools endpoint before app assertions, so it is recorded as an environment startup observation rather than a product assertion failure.
**Test reference:** `scripts/harness/__tests__/turnstile-comment-contract.test.mjs` (all three adapter contracts), `scripts/harness/browser-smoke.mjs` (public browser flow), and the repository regression commands above.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01 through TC-06 are all checked and each has a matching command/action, observed result, and test reference or explicit documentation-review rationale above.
The archived task record exists at `.agents/tasks/completed/WEB-002.md`, and this spec's `## Tasks` section points to that archive.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
All four tasks in `.agents/tasks/WEB-002.md` are checked, and its Blockers section records `None`.
`pnpm --filter @publisher/site build` exited 0; it produced the static site and generated the self-only CSP baseline for the omitted local configuration.
`pnpm --filter @publisher/site test` exited 0.
The user-facing public-flow evidence is recorded in `.agents/tasks/WEB-002.md`: unauthenticated/public-anonymous account is explicitly N/A; Headless Chrome covered home, article, category, search, and unknown routes at desktop `1280x900` and mobile `390x844`; the explicit public-only browser run reported expected route statuses, keyboard focus true, horizontal overflow false, zero console errors, and passing internal-link/feed/sitemap checks.
The fake public site key's inability to complete a live challenge is documented as an intentional non-production test boundary, while the focused DOM contract covers callback, reset, and recoverable provider failure without requesting user-side verification.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-13

**Status remains:** in-progress
**Failed criteria:**

- Browser-verification completeness: `.agents/tasks/WEB-002.md` now records the public-anonymous account N/A label, required route responses and screenshots, desktop/mobile viewports, native keyboard-focus boundary, and the reason a fake site key cannot perform a live challenge. It still does not record agent-observed console-error results, broken-link results, or desktop/mobile layout-overflow results required by `.agents/rules/browser-verification.md`.
  **Required action:** Run and record those three agent-side checks for the required public routes and viewports, including the observed results, then rerun GATE-VERIFY.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-13

**Status remains:** in-progress
**Failed criteria:**

- Browser verification evidence: `.agents/tasks/WEB-002.md` records only the enabled local article at desktop `1280x900` and mobile `390x844` with a fake public site key. It does not record the required home page, category page, search shell, unknown-route, console-error, broken-link, keyboard-focus, and overflow checks from `.agents/rules/browser-verification.md`; nor does it explicitly record that no test account is applicable for this public, unauthenticated flow.
  **Required action:** Complete and record agent-run browser checks for the required public routes and checks at the required viewports, including an explicit `N/A` account label for this unauthenticated flow, then rerun GATE-VERIFY.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Task record exists at `.agents/tasks/WEB-002.md` and is referenced in this spec's `## Tasks` section.
Task 1 maps to TC-01, TC-02, and TC-03; task 2 maps to TC-02, TC-03, and TC-04; task 3 maps to TC-05; task 4 maps to TC-06.
All six Completion Criteria therefore have at least one corresponding task in the created task record.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
Direct post-design approval: after the completed WEB-002 opt-in adapter, exact CSP, and omission behavior were presented, the user explicitly stated: "그 설계대로 진행하세요."
Approval is unambiguously directed to the just-presented WEB-002 design in the current conversation.
Architecture Review and frontmatter `type`/`tags` were not changed after that approval.

### [GATE-APPROVAL] — ❌ FAIL | 2026-09-13

**Status remains:** review-ready
**Failed criteria:**

- Direct, post-design approval: the current-conversation statement `Turnstile 승인함` explicitly approves Turnstile, but it predates this new WEB-002 Architecture Review and does not unambiguously approve this spec's opt-in static adapter, CSP changes, and omission behavior after those choices were documented.
  **Required action:** Present the completed WEB-002 design to the user and obtain an explicit approval for this spec; then rerun GATE-APPROVAL without changing its Architecture Review or frontmatter type/tags afterward.

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter begins with YAML and declares `status: draft`, valid `type: SECURITY`, and non-empty `tags`.
Problem identifies the configured static comment-form reproduction condition and the observed missing-token rejection without unresolved placeholders.
Architecture Review lists affected scope, records completed sibling inspection, compares three alternatives with pro/con trade-offs, and ties the selected opt-in adapter to portability and privacy trade-offs.
Completion Criteria contains six observable TC-N criteria (TC-01 through TC-06), covering each described behavior without prohibited vague success language.
Test Plan has one populated, non-manual strategy row for each of TC-01 through TC-06; all notes describe the verification approach or fixture boundary.
Tasks placeholder and previously empty Evidence Log are present.
