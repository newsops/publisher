# Configuration at the Composition Root

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: apps/admin/app/lib, packages/persistence, harness

## Objective

Confine `process.env` to `config.ts` and the composition root so adapters are
pure over their parameters; drive the `env-access` baseline to zero.

## Plan

- [x] TC-01: baseline 24 → 0.
- [x] TC-02: adapters require pool/directory.
- [x] TC-03: tests pass with explicit pools.
- [x] TC-04: file-backed dev server smoke.

## Progress

### 2026-09-19

- `config.ts` typed reader; `index.ts` wires accounts, registry, guidance,
  media, desk, archive, plugins, and build jobs; `AccountStore` class.

## Decisions

- Configuration is re-read per call, not cached, so the harness and the dev
  server see environment changes immediately.

## Blockers

- None.

## Result

env-access baseline 24 → 0.
