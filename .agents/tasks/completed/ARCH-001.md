# Layer Hierarchy Contract and Boundary Gates

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: scripts/harness, .agents rules and skills, docs

## Objective

Name the six layers and three access surfaces, encode them in one
machine-readable map, and fail `pnpm harness:scan` on any new violation while
recording today's violations in a baseline that can only shrink.

## Plan

- [x] TC-01: import-direction scan with layer map.
- [x] TC-02: shrinking baseline (new and stale entries both fail).
- [x] TC-03: `process.env` confined to composition roots.
- [x] TC-04: route shape (auth, site resolution, no adapter/SDK/route imports).
- [x] TC-05: 10 scans in `pnpm harness:scan`; contract tests in `pnpm test`.
- [x] TC-06: rule, structure doc, spec-writer layer tags, spec-contract check.
- [x] TC-07: baseline covers the observed violations; backlog rows name them.
- [x] TC-08: surface registry and parity scan.

## Progress

### 2026-09-19

- `layer-map.json`, `surface-map.json`, `layer-common.mjs`, four scans, the
  baseline (88 entries), `layer-contract.test.mjs`, rule and docs written.
- `scan-spec-contract.mjs` now checks every spec stage and requires layer
  tags for specs after the pre-existing set.

## Decisions

- Baseline entries are keyed by `file -> specifier` so a refactor that moves
  a violation is visible as one stale plus one new entry.
- The automation channel is the `v2` route together with its client and CLI
  wrappers, so `exclusive: automation` still expects client/CLI coverage.

## Blockers

- None.

## Result

All eight criteria verified; evidence in the spec's GATE-COMPLETE entries.
Follow-ups ARCH-002 to ARCH-006 remove the baseline entries.
