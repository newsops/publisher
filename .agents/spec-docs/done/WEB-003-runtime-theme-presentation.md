---
status: done
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
viewport. This reproduces on `https://news.example.com/` after the private
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

- [x] TC-01: A generated `editorial` theme artifact contains rules for `body`,
      `header`, `main`, navigation, article content, media, and a narrow
      viewport media query; it is not limited to `:root` custom properties.
- [x] TC-02: The publication contract test proves the emitted selected-theme
      artifact has concrete presentation rules while article HTML remains
      independent of the selected theme dependency.
- [x] TC-03: `pnpm --filter @publisher/site build` and
      `pnpm test -- incremental-publication-contract.test.mjs` both exit 0.
- [x] TC-04: On the activated public release, agent-run browser verification at
      desktop and 390px mobile widths observes the selected theme stylesheet,
      no horizontal overflow, and a visually styled home and article page.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                               | Notes                                                                                                                                                                           |
| ----- | -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit                 | `incremental-publication-contract.test.mjs`                                   | Test `emits a complete responsive selected-theme artifact outside article dependencies` checks the built-in `editorial` artifact selectors and responsive rule.                 |
| TC-02 | contract             | `incremental-publication-contract.test.mjs`                                   | The same named test confirms `article-html` has no selected-theme dependency, retaining the 1,000-article invalidation boundary.                                                |
| TC-03 | build and regression | `pnpm --filter @publisher/site build` and focused Vitest command              | The build and focused test passed; the full repository regression subsequently reported 168 passing tests.                                                                      |
| TC-04 | browser              | Chrome DevTools desktop and 390px viewport checks on the active public origin | Restored eight-article production data was present; home, article, category, and search loaded the 32-rule theme without overflow, console errors, or broken same-origin links. |

## Tasks

- [x] `.agents/tasks/completed/WEB-003.md` — completed implementation and verification record.

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
Task record `.agents/tasks/WEB-003.md` exists and is referenced verbatim in `## Tasks`.
Its plan contains one explicit task for each Completion Criterion: TC-01 complete responsive theme rules, TC-02 publication artifact/dependency contract test, TC-03 focused regression and site build, and TC-04 release activation plus desktop/390px browser verification.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
`.agents/tasks/WEB-003.md` marks TC-01 through TC-04 complete, records no blockers, and its Result identifies the completed theme, regression, activation, and browser checks.
`pnpm --filter @publisher/site build` exited 0: the generated `editorial@1` stylesheet was emitted at its checksum-addressed runtime path, Next.js compiled successfully, and 22 static pages were generated.
`pnpm --filter @publisher/site test` exited 0; the focused publication contract run `pnpm harness:test -- incremental-publication-contract.test.mjs` completed with 37 files and 168 tests passing, including the selected-theme presentation/dependency assertion.
Browser self-verification is recorded in the task's 2026-09-13 Progress section: public-anonymous (no login or test account applies) Chrome DevTools checks at 1440px and 390px covered home, article, category, and search; the selected theme exposed 32 CSS rules, keyboard focus worked, horizontal overflow was absent, and no console errors or broken same-origin links were observed after the Cloudflare Pages activation.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

The generated production `editorial` artifact is 3,598 bytes and exposes rules
for `body`, `header`, `main`, `article`, and `@media (max-width: 600px)`.
Test reference: `scripts/harness/__tests__/incremental-publication-contract.test.mjs`,
`emits a complete responsive selected-theme artifact outside article dependencies`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

The named incremental-publication contract test passed and asserts both concrete
selected-theme selectors and the absence of `theme:editorial:1` from article
HTML dependencies.
Test reference: `scripts/harness/__tests__/incremental-publication-contract.test.mjs`,
`emits a complete responsive selected-theme artifact outside article dependencies`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

`pnpm --filter @publisher/site build` exited 0; the focused contract test
passed, and the repository regression reported 168 passing tests with six
harness scans passing.
Test reference: Test Plan TC-03 records the focused build and regression
commands.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

After Cloudflare Pages activation, Chrome DevTools verified home, article,
category, and search at 1440px and 390px. Each loaded the 32-rule selected
theme with keyboard focus and no horizontal overflow, console errors, or broken
same-origin links.
Test reference: Test Plan TC-04 records the public-anonymous browser audit.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-13

**Status remains:** verifying
**Failed criteria:**

- TC-01 through TC-04: all Completion Criteria checkboxes are `[x]`, but no corresponding `[GATE-COMPLETE: TC-01]` through `[GATE-COMPLETE: TC-04]` Evidence Log entries exist with an exact verification command/action and observed result. `rg` found no GATE-COMPLETE entries in either the spec or task record.
  **Required action:** Add one TC-specific GATE-COMPLETE evidence entry per criterion, including the concrete test/build/browser action, observed result, and its Test Plan test reference or explicit skip rationale.
- Task archival: `.agents/tasks/completed/WEB-003.md` does not exist; `test -f .agents/tasks/completed/WEB-003.md` exited 1, and `## Tasks` still points to the active task record.
  **Required action:** Archive the completed task at `.agents/tasks/completed/WEB-003.md` and update `## Tasks` to that archived path before rerunning this gate.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01 through TC-04 are all checked and each has its own `[GATE-COMPLETE: TC-N]` entry with the concrete artifact/test/build/browser action, observed result, and Test Plan test reference.
TC-01 and TC-02 reference `scripts/harness/__tests__/incremental-publication-contract.test.mjs`, test `emits a complete responsive selected-theme artifact outside article dependencies`; TC-03 records the exact site-build command and focused regression result; TC-04 records the public-anonymous Chrome DevTools desktop and 390px audit.
`## Test Plan` supplies a non-empty test approach and result/reference for every TC-01 through TC-04 row.
The task archive exists at `.agents/tasks/completed/WEB-003.md`, no active `.agents/tasks/WEB-003.md` remains, and `## Tasks` now references the archived record.
