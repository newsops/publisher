---
status: done
type: SCREEN
tags: [web, mobile-web, a11y]
authority: delegated
---

# WEB-004: Restore the complete public editorial design

## Problem

The production publication renderer currently emits a reduced document shell:
index routes contain only a heading and linked-title list, while article routes
contain a compact header, article, recent link, and comments section. On the
active `https://news.example.com/` Pages release this removes the established
centred masthead, section navigation, lead-story composition, image-and-excerpt
story cards, editorial rail, and footer that already exist in `apps/site`.
The result is readable but visually much simpler than the prior public design.

The same design source also contains invalid CSS properties such as
`border-beditorm` and `margin-beditorm`. They reproduce in the local static-site
build and were introduced when a forbidden personal-name substring inside the
word `bottom` was replaced too broadly.

The selected theme is currently attached by a deferred JavaScript bootstrap
after baseline CSS has already painted. On a cold mobile load this exposes the
reduced fallback layout before the complete editorial design arrives.

## Architecture Review

### Affected Scope

- `packages/publication/src/static-renderers.ts` owns the HTML structure of the
  production snapshot-specific index and article pages.
- `packages/content/src/data/theme-presentation.json` owns the complete visual
  rules loaded by every production release independently from article data.
- `packages/publication/src/static-policy.ts` owns the readable no-JavaScript
  fallback and currently contains one corrupted CSS declaration.
- `apps/site/app/styles.css` is the local fixture presentation and contains the
  established editorial design plus the corrupted `*beditorm` declarations.
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs` owns the
  release-artifact regression contract.
- Production activation regenerates every semantic HTML route once because the
  document shell changes; future theme-only changes remain independent from
  article HTML.

### Alternatives Considered

1. Restore the established semantic structure in the production renderer and
   style it through the selected theme bundle. Pro: one verified publication
   path retains the current static, provider-neutral architecture and restores
   content hierarchy. Con: this intentional semantic-template change rebuilds
   all current HTML routes once.
2. Deploy `apps/site/out` directly instead of the publication-worker output.
   Pro: the existing React fixture already has the richer layout. Con: it would
   create a second production path, bypass the live PostgreSQL snapshot, and
   allow the fixture and published content to drift.
3. Keep the reduced HTML and add CSS only. Pro: no semantic-template rebuild.
   Con: CSS cannot recover missing images, excerpts, lead-story hierarchy,
   navigation structure, or the footer, so the old design cannot be restored.

### Decision

Choose alternative 1. Reuse the established generic editorial vocabulary from
`apps/site`, not a new brand-specific redesign: a dated utility bar, centred
masthead, one-line section navigation, asymmetric lead story, story-card feed,
useful rail, measured article typography, comments, and footer. Bump the
semantic template version so the one necessary full regeneration is explicit.
Keep all visual styling in the selected theme artifact so later visual changes
still rebuild zero article HTML files. Correct the corrupted CSS declarations
in both the fixture and fallback sources.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 - React fixture, production renderer, selected-theme bundle, baseline fallback, and artifact tests were compared; no route or public identifier is added.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Add reusable static shell, story-card, sidebar, and footer renderers to the
production HTML generator. The home page gives the newest projected story lead
treatment and renders the remaining stories as image cards; other projection
routes use a compact image-and-excerpt list. Article pages use the same shell,
category treatment, readable measure, byline, image, taxonomy, recent rail, and
comment area. Expand the selected theme rules for those semantic classes and
retain a legible no-JavaScript fallback. Repair every `beditorm` CSS corruption.
Publish the selected theme at the stable `/theme-runtime/current.css` route and
link it synchronously from every document. The stable route changes content at
release activation without adding the selected-theme dependency to article
HTML, preventing both first-paint flash and theme-triggered article rebuilds.

The visual target is a modern editorial news publication with design variance
6, motion intensity 3, and visual density 6. It uses the existing monochrome
palette with one restrained red accent, square geometry, static interactions,
and explicit desktop/mobile layouts.

## Affected Files

- `packages/publication/src/static-renderers.ts`
- `packages/publication/src/static-index-data.ts`
- `packages/publication/src/static-indexes.ts`
- `packages/publication/src/static-policy.ts`
- `packages/publication/src/static-runtime-recipes.ts`
- `packages/publication/src/static-builder.ts`
- `packages/publication/src/verification.ts`
- `packages/content/src/data/theme-presentation.json`
- `apps/site/app/styles.css`
- `apps/site/public/.well-known/publisher/runtime.json`
- `apps/site/public/theme-runtime/editorial.*.css`
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs`
- `scripts/harness/__tests__/repository-documentation-contract.test.mjs`
- `.agents/tasks/completed/WEB-004.md`

## Completion Criteria

- [x] TC-01: A generated home-page artifact contains a utility bar, centred masthead, section navigation, lead story with image and excerpt, remaining story cards, sidebar sections, and footer.
- [x] TC-02: A generated article artifact contains the shared editorial shell, category, byline, lead image, prose, recent-stories rail, comments region, and footer while retaining canonical, Open Graph, and `NewsArticle` metadata.
- [x] TC-03: `rg -n "beditorm" apps/site/app/styles.css packages/publication/src/static-policy.ts packages/content/src/data/theme-presentation.json` produces no matches, and the artifact test rejects recurrence of the malformed property.
- [x] TC-04: The selected theme artifact contains desktop and mobile rules for the masthead, lead, story feed, rail, article, comments, and footer; every HTML artifact synchronously links `/theme-runtime/current.css`, and article recipes remain independent from the selected-theme dependency.
- [x] TC-05: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` all exit 0.
- [x] TC-06: Agent-run browser checks at 1440px and 390px on home, article, category, search, and unknown routes show the restored hierarchy, no horizontal overflow, visible keyboard focus, working same-origin links, and no console errors.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                                                                                                                                                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract             | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `WEB-008 incremental publication contract > renders the complete editorial home shell with a lead, feed, rail, and footer`                                                                                                                                                                          | Use a populated fixture so lead and trailing-story regions are both exercised; a zero-story projection remains a readable empty state.                                                                                                                                                                                                                                       |
| TC-02 | contract             | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `WEB-008 incremental publication contract > renders crawlable editorial article content and metadata without JavaScript`                                                                                                                                                                            | Use an article with materialized media and verify presentation hooks plus SEO semantics in the emitted HTML.                                                                                                                                                                                                                                                                 |
| TC-03 | regression           | `scripts/harness/__tests__/repository-documentation-contract.test.mjs` — `repository handoff documentation contract > rejects malformed CSS left by over-broad identity replacement`                                                                                                                                                                                        | The test scans all three CSS sources; the exact `rg -n "beditorm" ...` command must also return no matches.                                                                                                                                                                                                                                                                  |
| TC-04 | contract             | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `emits a complete responsive selected-theme artifact outside article dependencies` and `updates synchronous theme CSS without rebuilding article HTML`; `scripts/harness/__tests__/incremental-publication-scale.test.mjs` — `keeps no-op and visual theme changes at zero article renders/uploads` | Check responsive selectors, synchronous stable CSS, dependency isolation, and zero article renders across 1,000 articles.                                                                                                                                                                                                                                                    |
| TC-05 | build and regression | Exact aggregate commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`                                                                                                                                                                                                                                                                              | No separate test file is used because the criterion is the successful execution of the repository's aggregate build and regression commands themselves.                                                                                                                                                                                                                      |
| TC-06 | browser              | Agent-run `/tmp/verify-publisher-cdp.mjs` against the local candidate and `https://news.example.com`                                                                                                                                                                                                                                                                        | Repository automation is intentionally skipped for the live half because Cloudflare propagation and the public network are nondeterministic CI dependencies. The exact CDP action checks 1440px/390px, JavaScript enabled/disabled, CSS response, hierarchy, overflow, keyboard focus, console errors, and same-origin routes. Public-anonymous routes need no test account. |

## Tasks

- [x] `.agents/tasks/completed/WEB-004.md` - completed implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready

- Frontmatter: the file starts with YAML frontmatter and declares `status: draft`, valid type `SCREEN`, non-empty `tags`, and valid authority `delegated`.
- Problem: identifies the reduced production document shell on `https://news.example.com/`, enumerates the missing editorial regions, and reproduces malformed `*beditorm` CSS in the local static-site build with a concrete cause; no TBD, TODO, or ambiguous single-sentence placeholder is present.
- Architecture Review: all four checklist items are `[x]`; the sibling scan records comparison of the React fixture, production renderer, selected-theme bundle, fallback, and artifact tests; three alternatives each state a pro and con; the decision explicitly weighs the single full HTML regeneration against retaining one static provider-neutral publication path and theme-only rebuild independence.
- Completion Criteria: TC-01 through TC-06 are uniquely prefixed, cover the home shell, article shell and metadata, malformed CSS regression, responsive theme/dependency boundary, repository verification commands, and browser behavior, and each uses a command or observable-result form without prohibited vague phrases.
- Test Plan: exactly six non-empty rows map one-to-one to TC-01 through TC-06; every row provides a test type, concrete tool or approach, and non-empty strategy notes, with no TBD or `manual` tool row.
- Structure: the `Tasks` placeholder exists and the `Evidence Log` was empty before this first GATE-WRITE entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-14

**Status upgrade:** review-ready → approved

- Delegated authority: frontmatter declares `authority: delegated`, and `.agents/rules/authority-delegation.md` provides standing delegation for an ordinary implementation after a complete recommendation.
- Architecture Review: affected scope, three alternatives with explicit pros and cons, the selected decision and trade-off, all four completed checklist items, six completion criteria, and a one-to-one verification plan are present before this approval check.
- Ordering: the preceding GATE-WRITE evidence records the completed Architecture Review and original frontmatter values; no subsequent Architecture Review or `type`/`tags`/`authority` change is present.
- Non-compliance check: `git status --short` shows only this untracked specification and no implementation-file edits or implementation commit before GATE-APPROVAL.
- Execution-time exceptions remain in force: billing changes, production DNS changes, existing production-data deletion or overwrite, external messaging, account creation or closure, secret disclosure, and the final creation of a new external runtime, proxy, queue, cache, or managed service still require narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-14

**Status upgrade:** approved → in-progress

- Tasks file: `.agents/tasks/WEB-004.md` exists and is linked from the spec's `## Tasks` section.
- TC-01 and TC-02: the first task restores the shared masthead, navigation, lead, story feed, rail, article, comments, and footer markup.
- TC-03 and TC-04: the second task restores selected-theme presentation and repairs malformed CSS declarations, and the third task adds the artifact and invalidation regression coverage for those contracts.
- TC-05 and TC-06: the fourth task requires build, typecheck, test, harness, and desktop/mobile browser verification.
- Lifecycle completion: the fifth task records the remaining gate, version-control, review, merge, and verified-release activation work.
- Non-compliance check: `git log -5 --oneline` ends at the unchanged base commit `99a56f7`, while `git status --short` contains only the untracked spec and tasks records; no implementation commit exists before this gate.

### [GATE-VERIFY] — ✅ PASS | 2026-09-14

**Status upgrade:** in-progress → verifying

- Task completion: every plan item in `.agents/tasks/WEB-004.md` is marked `[x]`, and its `## Blockers` section records `None`.
- Affected-package build: `pnpm --filter @publisher/site build` exited 0; Next.js compiled successfully, generated all 22 static pages, normalized 21 HTML files, and generated public metadata and exact static CSP headers.
- Affected-package test: `pnpm --filter @publisher/site test` exited 0 via the package test command.
- Browser evidence: `.agents/tasks/WEB-004.md` records agent-run Chrome verification for the production-snapshot candidate and Pages deployment `<deployment-id>` at 1440px and 390px across home, article, category, search, and not-found routes, including hierarchy, overflow, keyboard focus, links, console, and JavaScript-disabled synchronous-theme checks.
- Test-account label: the public routes are explicitly recorded as `Public-anonymous` in the TC-06 Test Plan notes, so no authenticated test account was required.
- Self-verification and symmetry: the evidence records the agent completing both local-candidate and activated-release browser checks itself; no verification was delegated to the user and no automation skip is claimed.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-14

**Status remains:** verifying
**Failed criteria:**

- TC-specific completion evidence: TC-01 through TC-06 are checked, but the Evidence Log contains no `[GATE-COMPLETE: TC-N]` entries with the exact verification command or action and the observed output or result.
  **Required action:** Add one `[GATE-COMPLETE: TC-N]` Evidence Log entry for every TC-01 through TC-06, recording the exact command or browser action and its observed result.
- Test Plan completion references: the six Test Plan rows describe approaches, but they do not record a test file path plus the concrete test/`describe` name, or an explicit reason why an automated test was skipped, for every TC-N.
  **Required action:** Update every Test Plan row with the exact test file and test/`describe` name; for a criterion without an automated test, record the explicit automation-skip reason instead.

The lifecycle ordering is otherwise valid: frontmatter remains `status: verifying`, all Completion Criteria are `[x]`, `.agents/tasks/completed/WEB-004.md` exists with no blocker or unchecked task, and `## Tasks` points to that archived path.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs -t "renders the complete editorial home shell with a lead, feed, rail, and footer"`.
- Observed: 1 file passed; the named test passed with 26 unrelated tests skipped.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs -t "renders crawlable editorial article content and metadata without JavaScript"`.
- Observed: 1 file passed; the named test passed with 26 unrelated tests skipped.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/repository-documentation-contract.test.mjs -t "rejects malformed CSS left by over-broad identity replacement"`.
- Observed: the named test passed. The exact `rg -n "beditorm" apps/site/app/styles.css packages/publication/src/static-policy.ts packages/content/src/data/theme-presentation.json` command returned no matches.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-14

- Commands: focused Vitest runs for `emits a complete responsive selected-theme artifact outside article dependencies`, `updates synchronous theme CSS without rebuilding article HTML`, and the scale test `keeps no-op and visual theme changes at zero article renders/uploads`.
- Observed: both contract tests and the 1,000-article scale test passed; responsive selectors and synchronous `current.css` were present while theme-only changes rendered and uploaded zero article HTML artifacts.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-14

- Commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`.
- Observed: all exited 0; the full harness reported 37 files and 175 tests passed, and all six repository scans passed. A separate test file is not applicable because these aggregate commands are the criterion itself.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-14

- Action: `node /tmp/verify-publisher-cdp.mjs` drove installed Chrome against the operated public origin (placeholder `https://news.example.com`; evidence kept privately by the operator) at 1440×1000 and 390×844 with JavaScript enabled and disabled.
- Observed: home, article, category, search, and unknown-route scenarios returned their expected 200/404 statuses; `current.css` returned 200 before evaluation; computed brand sizes were 56px/34px; every page had zero horizontal overflow, visible programmatic focus, and zero console errors. The no-JavaScript home and article retained the complete editorial layout. Live browser automation is not committed because public network and CDN propagation are nondeterministic CI dependencies.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-14

**Status upgrade:** verifying → done

- Completion Criteria: TC-01 through TC-06 are all checked, and each has a matching `[GATE-COMPLETE: TC-N]` entry containing the exact verification command or browser action and the observed result.
- Test Plan: TC-01 through TC-04 name the committed test file and concrete test or `describe` name; TC-05 records that the aggregate verification commands are themselves the criterion; TC-06 records why live browser automation is intentionally not committed and identifies the exact CDP action used instead.
- Test references: the six named automated tests were found in `incremental-publication-contract.test.mjs`, `repository-documentation-contract.test.mjs`, and `incremental-publication-scale.test.mjs` with names matching the Test Plan.
- Archive state: `.agents/tasks/completed/WEB-004.md` exists, is marked `completed`, contains no blocker or unchecked plan item, and the spec's `## Tasks` section points to that archived path.
