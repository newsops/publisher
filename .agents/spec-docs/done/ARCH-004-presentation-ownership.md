---
status: done
type: AGREEMENT
tags: [web, typescript]
authority: confirmation-required
---

# ARCH-004: One presentation owner — theme sources in publication, renderer parity test

## Problem

Public HTML is produced twice: `packages/publication/src/static-renderers.ts`
for releases and `apps/site/app/components/*` for the checked-in fixture
preview. The BBC/CNN redesign on this branch had to be applied to both and
nothing verified that they still agree; a marker dropped from one renderer
would only show up as a visual regression on one surface. Meanwhile the
theme stylesheets (`editorial.ts`, `signal.ts`, 454 lines of CSS) lived in
`packages/content`, the L0 contract layer, so the contract package owned
presentation and `scripts/generate-theme-runtime.mts` reached into a content
submodule (`layer-imports` baseline entry
`scripts/generate-theme-runtime.mts -> ../packages/content/src/themes`).
Reproduce: `grep -c "className=" apps/site/app/components/StaticArticlePage.tsx`
(12 markers) against `grep -o 'class="' packages/publication/src/static-renderers.ts`
with no test relating the two.

## Architecture Review

### Affected Scope

- L0 `packages/content/src/theme-ids.ts` (new: `themeIds`, `isThemeId`),
  `index.ts` (drops `getTheme`/`themes`/`ThemeDefinition`),
  `managed-validation.ts` (unchanged import of `isThemeId`).
- L2 `packages/publication/src/themes/**` and `themes.ts` (moved from
  content; registry keyed by the content ids, fails at load on a mismatch),
  `static-policy.ts` (`PRESENTATION_MARKERS`), `index.ts`.
- L5 `scripts/generate-theme-runtime.mts`, `scripts/deploy/publication-worker-core.ts`,
  `scripts/generate-public-metadata.mjs` (package index imports),
  `scripts/harness/__tests__/presentation-parity-contract.test.mjs` (new),
  `content-contract`, `incremental-publication-contract`, `x-oembed-contract`,
  `repository-documentation-contract` tests, `layer-baseline.json`.
- L4 `apps/site/app/styles.css` (comment path only).

Sibling scan: `static-policy.ts` already carries the semantic/baseline
version constants, so the marker contract joins them; `createScaleFixture`
and `renderArticleHtml`/`renderProjectionPage` are already exported for
tests; `apps/site/out` is already required by `scan-static-output.mjs`, so the
parity test can read the built preview.

### Alternatives Considered

1. Delete the `apps/site` renderer and preview the publication renderer
   instead. Pro: one renderer. Con: `apps/site` is the Next.js static
   fixture the repository, clean-room CI and local `pnpm dev` depend on;
   replacing it is a separate product decision.
2. Keep two renderers with no contract. Pro: nothing to maintain. Con: the
   observed drift risk remains and the theme CSS keeps living in L0.
3. Declare publication canonical, move the stylesheets to it, keep the ids
   in content, and add a marker parity test over both renderers and both
   themes. Pro: ownership is explicit, drift fails in `pnpm test`, the L0
   package sheds presentation. Con: markers must be maintained when the
   design changes — which is the point.

### Decision

Alternative 3. `PRESENTATION_MARKERS` (chrome, article, index) is the
contract; both renderers must emit every marker on the relevant page and
every theme must style every marker. The theme registry is derived from
`themeIds` so a stylesheet cannot exist without a contract id or vice versa.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료 — the owner's standing delegation recorded in
      ARCH-001 covers moving theme sources to the presentation owner

## Solution

Move `themes/` and `themes.ts` with `git mv`, add `theme-ids.ts`, rebuild
the registry from the ids, export the markers, re-point scripts and tests,
add the parity test, and remove the two build-script baseline entries.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `ls packages/content/src/themes` → no such directory; `ls packages/publication/src/themes` → `definition.ts editorial.ts signal.ts`; `packages/content/src/index.ts` exports `themeIds` and `isThemeId` only.
- [x] TC-02: `pnpm vitest run scripts/harness/__tests__/presentation-parity-contract.test.mjs` → 4 passing: both renderers emit every chrome/article marker on the article page and every chrome/index marker on the home page; both themes style every marker; the registry keys equal `themeIds`.
- [x] TC-03: `node scripts/harness/scan-layer-imports.mjs` → exit 0 with `scripts/generate-theme-runtime.mts -> ../packages/content/src/themes` and `scripts/generate-public-metadata.mjs -> …/editorial-markdown.ts` removed (1 `layer-imports` entry remains).
- [x] TC-04: `pnpm build` → `[generate-theme-runtime] editorial@1 -> …editorial.fe8a7c25….css` (same stylesheet digest as before the move); `pnpm typecheck`, `pnpm harness:scan`, `pnpm harness:test` pass.

## Test Plan

| TC-ID | Test Type | Tool / Approach                         | Notes                                                                                   |
| ----- | --------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| TC-01 | gate      | `ls`, `grep`                            | Registry lives in L2; content exports ids only.                                         |
| TC-02 | contract  | `presentation-parity-contract.test.mjs` | Precondition: `apps/site/out` built (as `pnpm test` does); renders a 6-article fixture. |
| TC-03 | gate      | `scan-layer-imports.mjs`                | Two stale entries removed; the CLI entry stays for ARCH-006.                            |
| TC-04 | gate      | `pnpm build`, `pnpm typecheck`, harness | Digest equality proves the CSS is byte-identical after the move.                        |

## Tasks

- [x] `.agents/tasks/completed/ARCH-004.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Problem cites the duplicated renderers, the L0-owned CSS and the baseline entry; three alternatives; decision names the marker contract; TC-01–04 have rows.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: confirmation-required`; ARCH-001's GATE-APPROVAL quotes the owner's "이 것도 좋아" and the goal "ARCH-006 처리할 때까지 반복해서 완료해줘" as confirmation of the theme-source move.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying
`pnpm typecheck`, `pnpm build`, `pnpm harness:scan` (10), `pnpm harness:test` (44 files / 220 tests).

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `ls packages/content/src/themes packages/publication/src/themes`; `grep -n theme packages/content/src/index.ts`.
Observed result: content directory absent; publication directory holds `definition.ts editorial.ts signal.ts`; content index exports `isThemeId, themeIds, type ThemeId`.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/presentation-parity-contract.test.mjs`.
Observed result: `Tests 4 passed (4)` — the first run failed until the projection renderer received its `articles` map, which shows the test exercises the real signature.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `pnpm harness:scan`.
Observed result: the two entries were reported stale and removed; `[layer-imports] no new violations (1 baseline entries remain)`.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `pnpm build`, `pnpm typecheck`, `pnpm harness:scan`, `pnpm harness:test`.
Observed result: `editorial@1 -> /theme-runtime/immutable/editorial.fe8a7c25f573c3dd21c814744d399ad5295e6b461a8658915d0c14363b16c656.css` (unchanged digest); 0 type errors; 10 scans; 220 tests.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
