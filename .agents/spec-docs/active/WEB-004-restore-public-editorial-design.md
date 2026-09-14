---
status: in-progress
type: SCREEN
tags: [web, mobile-web, a11y]
authority: delegated
---

# WEB-004: Restore the complete public editorial design

## Problem

The production publication renderer currently emits a reduced document shell:
index routes contain only a heading and linked-title list, while article routes
contain a compact header, article, recent link, and comments section. On the
active `https://www.xrtechnews.com/` Pages release this removes the established
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
- `.agents/tasks/WEB-004.md`

## Completion Criteria

- [ ] TC-01: A generated home-page artifact contains a utility bar, centred masthead, section navigation, lead story with image and excerpt, remaining story cards, sidebar sections, and footer.
- [ ] TC-02: A generated article artifact contains the shared editorial shell, category, byline, lead image, prose, recent-stories rail, comments region, and footer while retaining canonical, Open Graph, and `NewsArticle` metadata.
- [ ] TC-03: `rg -n "beditorm" apps/site/app/styles.css packages/publication/src/static-policy.ts packages/content/src/data/theme-presentation.json` produces no matches, and the artifact test rejects recurrence of the malformed property.
- [ ] TC-04: The selected theme artifact contains desktop and mobile rules for the masthead, lead, story feed, rail, article, comments, and footer; every HTML artifact synchronously links `/theme-runtime/current.css`, and article recipes remain independent from the selected-theme dependency.
- [ ] TC-05: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` all exit 0.
- [ ] TC-06: Agent-run browser checks at 1440px and 390px on home, article, category, search, and unknown routes show the restored hierarchy, no horizontal overflow, visible keyboard focus, working same-origin links, and no console errors.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                                        | Notes                                                                                                                                                                      |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract             | `incremental-publication-contract.test.mjs` rich index-shell assertion                                 | Use a populated scale fixture so lead and trailing-story regions are both exercised; a zero-story projection remains a readable empty state.                               |
| TC-02 | contract             | `incremental-publication-contract.test.mjs` rich article-shell assertion                               | Use an article with materialized media and verify both presentation hooks and existing SEO semantics in the emitted HTML.                                                  |
| TC-03 | regression           | Vitest malformed-CSS sentinel plus exact `rg` command                                                  | The test scans all three CSS sources and fails if the corrupted substring returns.                                                                                         |
| TC-04 | contract             | selected-theme artifact, synchronous pointer, and dependency assertions                                | Check concrete responsive selectors, confirm the stable CSS link is present without JavaScript, and confirm no `theme:editorial:*` dependency enters article HTML recipes. |
| TC-05 | build and regression | repository hard-gate commands                                                                          | Run after focused red-green coverage and again before completion.                                                                                                          |
| TC-06 | browser              | Chrome desktop and mobile verification on a locally served candidate, then the activated Pages release | Public-anonymous routes need no test account. Test representative published data, dark system preference fallback, keyboard focus, overflow, console, and links.           |

## Tasks

- [ ] `.agents/tasks/WEB-004.md` - active implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready

- Frontmatter: the file starts with YAML frontmatter and declares `status: draft`, valid type `SCREEN`, non-empty `tags`, and valid authority `delegated`.
- Problem: identifies the reduced production document shell on `https://www.xrtechnews.com/`, enumerates the missing editorial regions, and reproduces malformed `*beditorm` CSS in the local static-site build with a concrete cause; no TBD, TODO, or ambiguous single-sentence placeholder is present.
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
