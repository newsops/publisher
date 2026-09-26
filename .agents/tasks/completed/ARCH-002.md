# Move Image Analysis and Build-Job Storage into Adapters

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: packages/persistence, packages/publication, apps/admin/app/lib, scripts/deploy

## Objective

Remove the `desk-review.ts -> sharp` and `publication-worker.ts -> apps/admin`
baseline entries by placing pixel analysis and build-job storage in L1 and the
job state machine guard in L2.

## Plan

- [x] TC-01: import baseline entries removed, app module deleted.
- [x] TC-02: no environment default in the adapter.
- [x] TC-03: suites re-pointed; guard wrapper tested.
- [x] TC-04: typecheck and scans green.

## Progress

### 2026-09-19

- `packages/persistence/src/build-jobs.ts` and `analyseImagePixels` in
  `media.ts`; `guardBuildJobTransitions` in `packages/publication`.
- Layer map now covers `packages/*/scripts` and forbids package → app imports.

## Decisions

- Storage adapters keep compare-and-swap only; the transition table is
  applied once at composition by the L2 wrapper.

## Blockers

- None.

## Result

Baseline: layer-imports 32 → 33 (−3 removed, +4 newly covered), env-access
28 → 27.
