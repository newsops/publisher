# Surface Parity Backfill

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: docs/admin-api.openapi.yaml, packages/admin-client, packages/ops-cli, harness maps

## Objective

Make every automation capability reachable from the API document, the
client, and the CLI so the surface-parity baseline reaches zero.

## Plan

- [x] TC-01: OpenAPI covers all 22 routes with resolvable refs.
- [x] TC-02: parity and import baselines empty.
- [x] TC-03: CLI commands mapped one-to-one to v2 operations.
- [x] TC-04: client methods mapped one-to-one.
- [x] TC-05: gates green.

## Progress

### 2026-09-19

- 11 paths, 5 request bodies, 8 responses, 12 schemas added to the OpenAPI
  document; duplicate `/posts` and `/publish` keys removed.
- 8 client methods; 15 CLI commands; CLI imports `@publisher/content` for
  archive validation.

## Decisions

- The CLI may use the content contract's public index for pure validation
  (`layer-map.json` `cli` → `index:contract`); it never opens storage.

## Blockers

- None.

## Result

`layer-baseline.json` is empty: every layer and surface rule is enforced
without exceptions.
