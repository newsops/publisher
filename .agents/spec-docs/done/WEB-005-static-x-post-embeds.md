---
status: done
type: BEHAVIOR
tags: [web, cli, typescript]
authority: delegated
---

# WEB-005: Static X post embeds in editorial articles

## Problem

Editors and automation clients can link to an X post in article prose, but cannot ask the platform to resolve that primary-source URL through X's oEmbed endpoint and publish a durable, recognizable source card. The missing behavior is reproducible whenever an editor prepares an article that cites a primary source's original X post and needs that post without manually copying its text.

## Architecture Review

### Affected Scope

- `packages/content`: validated, sanitized resolved X-post embed record in article HTML.
- `packages/publication`: deterministic static rendering and embed-card stylesheet.
- `apps/admin`: authenticated oEmbed resolution endpoint, editor/automation validation, and preview of the resolved record.
- `packages/ops-cli` and `packages/admin-client`: article creation and update payload documentation/examples.
- Static-site tests and public-browser verification for desktop and mobile layouts.

### Alternatives Considered

1. Load `platform.twitter.com/widgets.js` in every article. Pro: matches the provider's live widget. Con: adds a third-party runtime, reader tracking surface, nondeterministic rendering, and provider outage dependency.
2. Permit arbitrary iframe or HTML embeds. Pro: supports many providers quickly. Con: creates an unsafe markup and script boundary and makes static build output unpredictable.
3. Resolve canonical X URLs through `publish.twitter.com/oembed` during authenticated editorial mutation, then render a platform-owned static card from the resolved snapshot. Pro: uses the official oEmbed representation without making reader requests dependent on X. Con: the authoring operation fails clearly if X oEmbed is unavailable.

### Decision

Choose option 3. The authenticated admin API resolves only canonical `https://x.com/<handle>/status/<numeric-id>` URLs through X's oEmbed endpoint, parses the returned representation into a strict platform-owned record, and stores that record rather than provider HTML. The publication renders an accessible static card and emits no X script, iframe, reader-time network fetch, or expanded CSP origin. This adds an author-time dependency that fails loudly while preserving the static-first reader boundary.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing comments and reviewed-plugin slots do not own editorial source embeds; token namespace will use `data-publisher-x-post` to avoid collision with existing `data-comment-*` attributes.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Define a content-owned resolved X-post embed record and sanitizer transform. The authenticated oEmbed resolver accepts only canonical X status URLs, fetches the official oEmbed response with an explicit timeout and no credential, parses only text, author and canonical-link fields, and rejects provider HTML/script/iframe content. The renderer converts the stored record to platform-owned semantic HTML and CSS. The admin UI and CLI both expose the same resolve-and-insert capability and validation diagnostics. Existing article body HTML remains valid and is not migrated or interpreted as an embed unless it carries the new explicit record.

## Affected Files

- `packages/content/src/editor.ts`
- `packages/content/src/article-adapter.ts`
- `packages/content/src/types.ts`
- `packages/publication/src/static-renderers.ts`
- `packages/publication/src/static-types.ts`
- `apps/admin/app/*` article editor and automation routes
- `packages/admin-client/*`
- `packages/ops-cli/*`
- affected package tests and static-browser verification evidence

## Completion Criteria

- [x] TC-01: The authenticated oEmbed resolver accepts a canonical X status URL, rejects non-X hosts and non-numeric status identifiers, and returns an observable diagnostic for timeout, malformed response, iframe, or script content.
- [x] TC-02: `pnpm --filter @publisher/site test` renders a deterministic accessible X-post card from a resolved oEmbed fixture containing the canonical source link and quote text, with no `platform.twitter.com`, iframe, or script in output.
- [x] TC-03: Admin UI and `publisher` CLI article create/update paths invoke the same oEmbed resolution contract and report identical invalid-URL or unavailable-provider diagnostics.
- [x] TC-04: `pnpm --filter @publisher/site build` exits 0 with an article containing an X-post card and no runtime database or third-party X dependency.
- [x] TC-05: Browser verification at desktop and 390px mobile widths shows the X-post card, source link, and surrounding article layout without horizontal overflow or layout shift.

## Test Plan

| TC-ID | Test Type        | Tool / Approach                                                                 | Notes                                                                                                                                                                                             |
| ----- | ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit/integration | `x-oembed-contract.test.mjs` resolver cases                                     | `only accepts canonical numeric X status URLs` and `reports provider failure and unsafe provider markup` cover rejection and provider diagnostics without calling X.                              |
| TC-02 | unit/integration | `x-oembed-contract.test.mjs` static-card cases                                  | `turns oEmbed data into a static, sanitized source card` and `keeps the card stylesheet in the shared theme contract` assert semantic output and no third-party runtime strings.                  |
| TC-03 | integration      | authenticated production resolver plus `x-oembed-contract.test.mjs` client case | `gives automation clients the same resolver endpoint and diagnostics` asserts the CLI/client transport contract; the production automation endpoint resolved both cited posts before publication. |
| TC-04 | build            | `pnpm --filter @publisher/site build`                                           | Requires a fixture snapshot containing one valid embed and no runtime secrets; the command exited 0 in the implementation verification run.                                                       |
| TC-05 | browser          | Chrome public visitor at desktop and 375px                                      | Verifies the deployed static output as a public unauthenticated visitor, including public shell routes, 404, keyboard focus, images, console, and horizontal-overflow measurement.                |

## Tasks

- [x] `.agents/tasks/completed/WEB-005.md` — archived task covering resolver, static rendering, API/UI/CLI parity, article publication, and verification.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, `type: BEHAVIOR`, and non-empty `tags`.
Problem names the missing author-time X oEmbed resolution behavior and reproduces it with an editorial-source use case; no TBD/TODO placeholder remains.
Architecture Review checklist is fully checked; the sibling scan records the `data-publisher-x-post` namespace decision, three alternatives include pro/con trade-offs, and the decision explicitly selects the static-first author-time dependency trade-off.
Completion Criteria contains five TC-prefixed, observable or command-form criteria (TC-01 through TC-05), with no prohibited vague success wording.
Test Plan contains exactly five matching TC rows; every row has a test type, concrete tool/approach, and a non-empty automation or browser-verification strategy note.
Tasks placeholder and an otherwise empty Evidence Log were present before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved
The user explicitly directed implementation in the current conversation: “twitter oembed 넣을수 있게 기능을 구현하고, 거기에 기능 구현해서 기사를 작성해줘.”
The direction specifically covers the authenticated author-time X/Twitter oEmbed capability defined by this spec; `authority: delegated` permits this bounded implementation decision.
The reviewed architecture and frontmatter `type`/`tags` remain unchanged after that direction, and no WEB-005 implementation files or commits were found before this approval check.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress
The task record exists at `.agents/tasks/WEB-005.md`, and the spec's `## Tasks` section records that exact active path.
The task plan maps every Completion Criterion to implementation work: resolver safety (TC-01), static card/build coverage (TC-02 and TC-04), authenticated API/admin/client/CLI parity (TC-03), and desktop/mobile verification (TC-05).

### [IMPLEMENTATION] — ✅ TC-01 through TC-04 | 2026-09-15

`apps/admin/app/lib/x-oembed.ts` validates canonical X status URLs, imposes a five-second author-time timeout, rejects malformed/unsafe provider markup, and returns a platform-owned semantic figure. Both the authenticated browser API and the scoped automation API invoke that resolver; `publisher embed x resolve` calls the same automation route. The admin post editor offers Resolve and insert.

The 180-test harness run, full typecheck, build, scan, and production resolver call passed. An operated publication's article contains two resolved cards and no iframe, provider widget script, or reader-time X runtime. Its live stylesheet contains the card's responsive rules. Chrome visual verification passed on desktop and in the iPhone XR 414px device toolbar: both cards and source links render, and the mobile runtime measurement reported `viewport: 421`, `scrollWidth: 421`, `xCards: 2`.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-15

**Status remains:** in-progress
**Failed criteria:**

- Browser-verification evidence: `.agents/tasks/WEB-005.md` records an article check at desktop and an iPhone XR 414px viewport, but does not identify the test account or explicitly identify the public unauthenticated visitor context, and does not record the required home page, category page, search shell, and unknown-route checks from `.agents/rules/browser-verification.md`.
  **Required action:** Perform and record agent-run browser checks for the required public routes using the explicit `public unauthenticated visitor (no test account required)` label, desktop and 390px-or-narrower viewport values, keyboard focus/broken-link/overflow observations, and console findings.
- Browser console evidence: direct Chrome inspection of the live article at the iPhone XR 414px device-toolbar viewport showed one console error: the injected `https://static.cloudflareinsights.com/beacon.min.js/...` script is blocked by `script-src 'self'`. The record neither explains nor resolves this finding, so the required console-error check is incomplete.
  **Required action:** Determine whether the beacon injection or CSP configuration should be removed or aligned, deploy the scoped correction if needed, then record a clean or explicitly accepted console result for the required routes.

The task checklist is fully checked with no recorded blockers. `pnpm --filter @publisher/site test` exited 0 and `pnpm --filter @publisher/site build` exited 0 in this gate run; `pnpm exec vitest run scripts/harness/__tests__/x-oembed-contract.test.mjs` also passed 4/4. Those checks do not cure the missing browser-evidence requirements above.

### [VERIFICATION REMEDIATION] — ✅ | 2026-09-15

Cloudflare Web Analytics RUM was disabled for the operated publication's zone because the optional injected beacon violated this site's intentionally strict `script-src 'self'` policy. The Cloudflare dashboard subsequently reported “RUM is currently disabled for this zone.” A clean Chrome reload of the published article produced **0 console messages**; the previous `static.cloudflareinsights.com/beacon.min.js` CSP error did not recur. No CSP origin was added.

Chrome verification used a **public unauthenticated visitor (no test account required)**. At desktop width, the following public routes rendered their intended shells with working visible links: `/` (new article featured), `/search/label/general/` (category listing), `/search/` (search shell), and `/__web005_missing__` (explicit Page not found shell). The published article route rendered both static source cards and their canonical X links.

At the Chrome iPhone SE device profile (375×667, therefore <=390px), the live article console measurement was `{"viewport":375,"scrollWidth":375,"xCards":2,"brokenImages":0,"focusable":true}`. This records no horizontal overflow, both cards, no broken image, and successful keyboard focus on a real focusable element. The fresh article reload had 0 console messages. The live title was then updated so the organisation, rather than the cited individual, is the headline subject; the production static deployment was observed with that title in both `<title>` and `<h1>`.

### [GATE-VERIFY] — ✅ PASS | 2026-09-15

**Status upgrade:** in-progress → verifying
`.agents/tasks/WEB-005.md` has every task checked and records `Blockers: None`.
`pnpm --filter @publisher/site build` exited 0 in this gate run; its static build generated the site without a runtime database or X dependency.
`pnpm --filter @publisher/site test` exited 0 in this gate run; the focused `x-oembed-contract.test.mjs` suite is documented as 4/4 passing in the prior gate evidence.
Browser self-verification is recorded above and in `.agents/tasks/WEB-005.md`: a public unauthenticated visitor (no test account required) checked home, article, category, search, and unknown routes at desktop; the article was checked at Chrome iPhone SE 375×667, with `viewport=375`, `scrollWidth=375`, two cards, no broken images, focusable keyboard target, and zero fresh console messages.
Current production HTML of the article (verified on an operated instance; URL and evidence kept privately by the operator) contains the updated title and two `data-publisher-x-post` cards, while containing no `platform.twitter.com`, iframe, or Cloudflare beacon string. The earlier CSP beacon error is resolved by disabling the optional RUM beacon rather than weakening CSP.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
The completed task archive exists, but the `## Tasks` entry still named its former active path. Individual TC evidence entries were also absent. Both documentation links and the per-criterion evidence below were required before the completion gate could pass.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-15

Command: `pnpm exec vitest run scripts/harness/__tests__/x-oembed-contract.test.mjs`.
Observed result: 1 file and 5 tests passed, including canonical numeric URL acceptance plus unsafe iframe/provider-unavailable diagnostics; network access to X is mocked in these cases.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-15

Command: `pnpm exec vitest run scripts/harness/__tests__/x-oembed-contract.test.mjs`.
Observed result: the same passing suite verifies the platform-owned figure includes quote/source data and excludes `platform.twitter.com`, script, and iframe content; it also checks the shared theme contains `.publisher-x-post`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-15

Command: `pnpm exec vitest run scripts/harness/__tests__/x-oembed-contract.test.mjs` and authenticated production `publisher embed x resolve` calls for both cited canonical URLs (on an operated instance; evidence kept privately by the operator).
Observed result: the client sends the scoped `POST /api/v2/sites/<site>/embeds/x` request with its bearer authorization and reports a 503 provider failure as `REMOTE_ERROR`; the production resolver returned two static embeds used in the published article.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-15

Command: `pnpm --filter @publisher/site build`.
Observed result: exit 0; static export completed and its postbuild step removed framework runtime from 21 HTML files. The production article source contains two static cards with no runtime database, X widget, iframe, or third-party X script.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-15

Action: Chrome public unauthenticated visitor verification of the live article at desktop and iPhone SE 375×667.
Observed result: desktop showed both source cards and canonical links; mobile returned `{"viewport":375,"scrollWidth":375,"xCards":2,"brokenImages":0,"focusable":true}` and the fresh reload logged 0 console messages. Home, category, search, and unknown-route shells were separately observed as documented above.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
**Failed criteria:**

- Completion-criterion evidence: TC-01 through TC-05 are checked, but the Evidence Log has no individual `[GATE-COMPLETE: TC-01]` through `[GATE-COMPLETE: TC-05]` records containing the exact verification command/action and observed result.
  **Required action:** Add one exact, evidence-backed GATE-COMPLETE record for each TC, including its test reference or explicit automation-skip rationale.
- Archived-task reference: `.agents/tasks/completed/WEB-005.md` exists and declares `Status: completed`, but `## Tasks` still points to `.agents/tasks/WEB-005.md` and calls it active.
  **Required action:** Replace the task reference with `.agents/tasks/completed/WEB-005.md` and describe it as the archived completed task.
- Test-plan completion record: all five Test Plan rows now name a test approach, but no corresponding GATE-COMPLETE TC evidence records tie the listed test files/functions or browser action to each checked completion criterion.
  **Required action:** In the per-TC evidence records, cite the concrete `x-oembed-contract.test.mjs` test name, site build/test command, or documented browser action and its observed result.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-15

**Status upgrade:** verifying → done
TC-01 is checked and its `[GATE-COMPLETE: TC-01]` record names the focused Vitest command and the canonical-input plus unsafe-provider diagnostic results; the current rerun observed 1 file / 5 tests passing.
TC-02 is checked and its `[GATE-COMPLETE: TC-02]` record names the static-card assertions, including source/quote output and the absence of provider runtime, script, and iframe content.
TC-03 is checked and its `[GATE-COMPLETE: TC-03]` record identifies the client transport test and the authenticated production resolver actions for both cited canonical URLs, with the observed request/error behavior.
TC-04 is checked and its `[GATE-COMPLETE: TC-04]` record gives the exact site build command and its observed successful static export/no-runtime result.
TC-05 is checked and its `[GATE-COMPLETE: TC-05]` record gives the Chrome desktop and 375px public-visitor action, measured no-overflow/broken-image/focus results, and clean-console observation.
The Test Plan has one non-empty, concrete test reference or browser-verification approach for each of TC-01 through TC-05; no row is silently untested.
The completed task is archived at `.agents/tasks/completed/WEB-005.md`, and `## Tasks` now records that exact archived completed-task path.
