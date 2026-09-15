---
status: in-progress
type: BEHAVIOR
tags: [web, cli, typescript]
authority: delegated
---

# WEB-005: Static X post embeds in editorial articles

## Problem

Editors and automation clients can link to an X post in article prose, but cannot ask the platform to resolve that primary-source URL through X's oEmbed endpoint and publish a durable, recognizable source card. The missing behavior is reproducible whenever an editor prepares an article such as the September 2026 ChatGPT Pro 20X enrollment pause story and needs to cite Tibo Sottiaux's original X post without manually copying its text.

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

| TC-ID | Test Type        | Tool / Approach                         | Notes                                                                                                                                             |
| ----- | ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit/integration | resolver tests with mocked oEmbed fetch | Validate exact canonical/rejected URLs, timeout, malformed response, and malicious oEmbed HTML fixtures without calling X in tests.               |
| TC-02 | unit/integration | publication static-renderer tests       | Uses a resolved oEmbed fixture and asserts semantic output plus the absence of third-party runtime strings.                                       |
| TC-03 | integration      | admin API/client/CLI tests              | Uses an authenticated mocked resolver; validates parity between API payload and CLI command rather than a production request.                     |
| TC-04 | build            | `pnpm --filter @publisher/site build`   | Requires a fresh local fixture snapshot containing one valid embed and no runtime secrets.                                                        |
| TC-05 | browser          | Chrome at 1440px and 390px              | Requires locally generated static fixture output; agent records screenshots and checks no horizontal scrolling before any production publication. |

## Tasks

- [ ] `.agents/tasks/WEB-005.md` — active task covering resolver, static rendering, API/UI/CLI parity, article publication, and verification.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, `type: BEHAVIOR`, and non-empty `tags`.
Problem names the missing author-time X oEmbed resolution behavior and reproduces it with the September 2026 Pro 20X editorial-source use case; no TBD/TODO placeholder remains.
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

The 180-test harness run, full typecheck, build, scan, and production resolver call passed. The production `aitrendtimes.com` article contains two resolved cards and no iframe, provider widget script, or reader-time X runtime. Its live stylesheet contains the card's responsive rules. Chrome visual verification passed on desktop and in the iPhone XR 414px device toolbar: both cards and source links render, and the mobile runtime measurement reported `viewport: 421`, `scrollWidth: 421`, `xCards: 2`.
