# One Presentation Owner

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: packages/content, packages/publication, scripts, harness tests

## Objective

Make `packages/publication` the owner of public presentation: theme
stylesheets move there, content keeps the theme ids, and a parity test binds
the release renderer and the `apps/site` preview to one marker contract.

## Plan

- [x] TC-01: theme sources in publication, ids in content.
- [x] TC-02: parity test (renderers, themes, registry).
- [x] TC-03: build-script baseline entries removed.
- [x] TC-04: build digest unchanged; gates green.

## Progress

### 2026-09-19

- `git mv` of `themes/` and `themes.ts`; `theme-ids.ts`; registry derived
  from `themeIds`; `PRESENTATION_MARKERS` in `static-policy.ts`;
  `presentation-parity-contract.test.mjs` (4 cases).

## Decisions

- `apps/site` stays as the fixture preview; replacing it with the release
  renderer is a separate product decision, not a layering fix.

## Blockers

- None.

## Result

layer-imports baseline 3 → 1; theme CSS digest unchanged.
