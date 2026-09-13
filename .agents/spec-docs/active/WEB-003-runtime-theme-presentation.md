---
status: in-progress
type: SCREEN
tags: [web, mobile-web, a11y]
authority: delegated
---

# WEB-003: Runtime theme presentation

## Problem

The restored public release loads its checksum-addressed baseline stylesheet and
runtime theme stylesheet successfully, but the selected `editorial` theme
contains only CSS custom-property declarations. The static publication markup
therefore retains baseline fallback spacing and browser-default list treatment,
which appears unstyled on both the Safari desktop rendering and a narrow mobile
viewport. This reproduces on `https://www.xrtechnews.com/` after the private
archive release because the public runtime manifest selects a theme bundle that
does not provide visual layout rules.

## Architecture Review

### Affected Scope

- `packages/content/src/data/themes.json` and
  `packages/content/src/data/theme-presentation.json` — selected-theme tokens
  and shared semantic-slot visual rules.
- `packages/content/src/themes.ts`, `scripts/generate-theme-runtime.mjs`, and
  `scripts/deploy/publication-worker-core.ts` — every local and production
  theme-artifact reader composes the same selected tokens and visual rules.
- `packages/publication` runtime-theme artifact contract and its harness tests
  — verify that a theme payload supplies presentation beyond the baseline.
- `docs/publication-platform-plan.ko.md` — clarify that visual bundles own
  layout presentation while baseline CSS remains the readable fallback.
- `.agents/tasks/WEB-003.md` — implementation and browser-verification record.

### Alternatives Considered

1. Add complete visual rules to each selected theme bundle. Pro: preserves the
   existing static semantic HTML and theme-only invalidation boundary; Con: each
   supported theme must explicitly style the shared semantic slots.
2. Enlarge the global baseline stylesheet to carry the full editorial design.
   Pro: all pages look richer without runtime JavaScript; Con: theme changes
   would require article HTML dependency changes and erase the intended
   baseline-versus-visual-theme separation.
3. Render visual styles from a public runtime API. Pro: centrally configurable;
   Con: adds a runtime dependency to a static public page and violates the
   provider-independent static boundary.

### Decision

Choose option 1. Keep the baseline stylesheet small, readable, and available
when JavaScript is unavailable; make every shipped theme CSS payload fully own
the non-semantic visual layout for the existing header, navigation, index,
article, metadata, media, sidebar, and comment slots. The checksum-addressed
theme artifact and tiny runtime manifest remain the only visual update surface,
so changing a theme does not rebuild article HTML or introduce a server-side
runtime dependency.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — `apps/site/app/styles.css` is a separate local
      fixture presentation and `packages/publication/src/static-runtime-recipes.ts`
      is the sole production static theme-artifact producer; no public route
      collision is introduced.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Expand the built-in theme CSS definitions from token-only payloads to complete,
responsive visual styles for the semantic static templates. Maintain a minimal
baseline for JavaScript-disabled resilience, then load the selected theme from
the existing self-hosted runtime manifest. Add an automated contract assertion
that a theme artifact contains concrete layout selectors, and record desktop
and mobile browser checks against the public release after activation.

## Affected Files

- `packages/content/src/data/themes.json`
- `packages/content/src/data/theme-presentation.json`
- `packages/content/src/themes.ts`
- `scripts/generate-theme-runtime.mjs`
- `scripts/deploy/publication-worker-core.ts`
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs`
- `docs/publication-platform-plan.ko.md`
- `.agents/tasks/WEB-003.md`

## Completion Criteria

- [ ] TC-01: A generated `editorial` theme artifact contains rules for `body`,
      `header`, `main`, navigation, article content, media, and a narrow
      viewport media query; it is not limited to `:root` custom properties.
- [ ] TC-02: The publication contract test proves the emitted selected-theme
      artifact has concrete presentation rules while article HTML remains
      independent of the selected theme dependency.
- [ ] TC-03: `pnpm --filter @publisher/site build` and
      `pnpm test -- incremental-publication-contract.test.mjs` both exit 0.
- [ ] TC-04: On the activated public release, agent-run browser verification at
      desktop and 390px mobile widths observes the selected theme stylesheet,
      no horizontal overflow, and a visually styled home and article page.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                 | Notes                                                                                                                                                                      |
| ----- | -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit                 | Vitest artifact-content assertion                                               | Uses the built-in `editorial` publication fixture and checks semantic selectors plus the responsive rule rather than unstable pixel values.                                |
| TC-02 | contract             | `incremental-publication-contract.test.mjs`                                     | Retains the 1,000-article invalidation boundary: selected-theme changes must not become an article HTML dependency.                                                        |
| TC-03 | build and regression | `pnpm --filter @publisher/site build` and focused Vitest command                | Confirms the source static export and provider-neutral incremental publication contract both pass.                                                                         |
| TC-04 | browser              | Chrome/Playwright desktop and 390px viewport checks on the active public origin | Requires the restored eight-article dataset; verifies rendered CSS, overflow, and home/article presentation rather than treating a 0-content fixture as a release failure. |

## Tasks

- [ ] `.agents/tasks/WEB-003.md` — TC-mapped implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML, declares `status: draft`, valid `type: SCREEN`, and non-empty `tags`.
Problem identifies the concrete unstyled fallback symptom on Safari desktop and narrow mobile release views, its selected token-only `editorial` cause, and the public-release reproduction condition.
Architecture Review has all four completed checklist entries, explicit sibling-scan evidence, three alternatives with pro/con trade-offs, and a decision tied to the static baseline/theme-boundary trade-off.
Completion Criteria contains four `TC-N` observable or command-based criteria covering the theme artifact, dependency contract, build/regression, and desktop/mobile release checks.
Test Plan has exactly one non-TBD row for each of TC-01 through TC-04, with test type, approach, and non-empty automation strategy notes; no row is manual-only.
Tasks provides the required pre-implementation placeholder and Evidence Log was empty before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
`authority: delegated` is declared in the frontmatter, and the completed Architecture Review records affected scope, sibling scan, three alternatives with trade-offs, a selected decision, and a TC-mapped test plan.
Standing delegated authority is defined by `.agents/rules/authority-delegation.md`; the owner's current request to inspect and, if needed, restore the unstyled public release is within this ordinary presentation-fix scope.
The spec remains `type: SCREEN` with its reviewed `web`, `mobile-web`, and `a11y` tags; no Architecture Review or authority/frontmatter change was made after the completed review.
Execution-time exceptions remain in force: no billing change, production DNS mutation, production-data overwrite, account action, secret disclosure, or new external runtime/service may be finalized without its required narrow confirmation.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Task record `/Users/jungyoun/Documents/dev/atmodolpa/publisher-public-302Y6t/.agents/tasks/WEB-003.md` exists and is referenced verbatim in `## Tasks`.
Its plan contains one explicit task for each Completion Criterion: TC-01 complete responsive theme rules, TC-02 publication artifact/dependency contract test, TC-03 focused regression and site build, and TC-04 release activation plus desktop/390px browser verification.
