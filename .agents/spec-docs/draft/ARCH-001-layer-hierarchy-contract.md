---
status: draft
type: AGREEMENT
tags: [typescript, cli, rest, web]
authority: confirmation-required
---

# ARCH-001: Layer hierarchy contract and boundary gates

## Problem

The repository describes package boundaries in prose
(`.agents/project-structure.md`, `AGENTS.md`, `.agents/rules/static-boundary.md`)
but nothing names the layers, nothing maps every source directory to a layer,
and no harness gate checks the dependency direction. The existing scans test
strings (`scan-portable-runtime.mjs` forbids provider words,
`scan-static-boundary.mjs` forbids server-only patterns in `apps/site`); none
of them reads an import.

Observed consequences in the current tree (all reproducible with `grep`):

1. `apps/admin/app/lib/desk-review.ts` imports `sharp` directly, while every
   other image decode lives in `packages/persistence/src/media.ts`. A service
   file now carries a native infrastructure SDK.
2. `scripts/deploy/publication-worker.ts` dynamically imports
   `apps/admin/app/lib/build-job-repository`, so an operator script depends on
   an application's private module instead of a package's public index.
3. `apps/admin/app/lib` is one flat directory of 33 files (~5,500 lines) that
   mixes contracts (`repository-contract.ts`), domain rules
   (`repository-validation.ts`, `desk-review.ts`), persistence adapters
   (`postgres-*-repository.ts`, `file-*.ts`), HTTP concerns (`auth.ts`,
   `api-request.ts`, `request-repository.ts`) and composition
   (`repository.ts`). Nothing in the path says which kind a file is.
4. Browser API routes use three different site-authorization idioms:
   15 of 31 browser `route.ts` files go through `repositoryForRequest`, others
   check `identity.roles.includes('owner')` inline (`api/agent-guidance`), and
   the first version of `api/desk/route.ts` (PR #10) bypassed site
   authorization entirely until review caught it. Route files are not
   mechanically constrained to "auth → parse → service → response".
5. `process.env` is read in 45 places under `apps/admin/app/lib`, in
   `packages/persistence/src/object-storage.ts`
   (`objectStoreFromEnvironment`), and in `apps/site/app` (4). Configuration is
   not confined to composition roots, so a package can silently depend on the
   deployment environment.
6. Public presentation is implemented twice: `apps/site/app/components/*`
   (checked-in fixture / local preview) and
   `packages/publication/src/static-renderers.ts` (production release). The
   BBC/CNN redesign in this branch had to be applied to both, and theme
   stylesheet sources live in `packages/content/src/themes/*` — the contract
   layer owns CSS.
7. Specs name affected packages, but not layers, so a reviewer cannot tell
   from `### Affected Scope` whether a change crosses a boundary.

Without a named hierarchy and a gate that fails on violation, each new feature
re-decides where code goes, and the answers drift.

## Architecture Review

### Affected Scope

- `.agents/project-structure.md` (becomes the human copy of the layer map),
  `.agents/rules/layer-boundaries.md` (new), `.agents/rules/index.md`,
  `.agents/skills/backlog-writer/SKILL.md` (Affected Scope must name layers),
  `CLAUDE.md` (gate list).
- `scripts/harness/layer-map.json` (new, machine-readable single source),
  `scripts/harness/scan-layer-imports.mjs` (new),
  `scripts/harness/scan-env-access.mjs` (new),
  `scripts/harness/scan-route-shape.mjs` (new),
  `scripts/harness/layer-baseline.json` (new ratchet baseline),
  `scripts/harness/run-all-scans.mjs`, `scripts/harness/__tests__/layer-contract.test.mjs` (new).
- Follow-up refactors (separate specs, listed under "Phased backlog"):
  `apps/admin/app/lib/**`, `packages/persistence/src/media.ts`,
  `packages/persistence` (build-job repository), `packages/publication`,
  `packages/content/src/themes/**`, `apps/site/app/components/**`,
  `scripts/deploy/publication-worker.ts`.

Sibling scan: `scan-static-boundary.mjs` already enforces one layer rule
(`apps/site` has no server runtime) by regex; `scan-portable-runtime.mjs`
enforces provider neutrality by regex; `scan-admin-contract.mjs` checks that
required files exist. None resolves imports. `packages/admin-client` and
`packages/ops-cli` already follow a strict one-way dependency
(`ops-cli → admin-client → HTTP`) and serve as the reference shape. No existing
`layer-*` file, rule, or scan exists; the new names do not collide.

### Alternatives Considered

1. **Prose only** — expand `.agents/project-structure.md` with a layer table.
   Pro: zero code. Con: this is what exists today and it did not prevent
   items 1–4 above; `lesson-to-harness` ranks passive documents as the weakest
   tier.
2. **Adopt `dependency-cruiser` (or ESLint `no-restricted-imports`)** — declare
   the matrix in its config. Pro: mature resolver. Con: a new dev dependency
   whose config becomes a second source of truth beside the harness; the
   harness scans are plain Node scripts by convention, and `eslint` is present
   but not configured across packages.
3. **Repository-owned layer map + harness scans with a shrinking baseline** —
   one JSON map assigns every source directory to a layer and states the
   allowed edges; three small scans (imports, env access, route shape) read
   that map; existing violations are recorded in a baseline that the scan
   refuses to let grow and that must be trimmed when a violation disappears.
   Refactors that remove violations follow as separate specs. Pro: single
   source, fails red in `pnpm harness:scan` and CI, no new runtime dependency,
   incremental adoption without a big-bang move. Con: hand-written import
   resolution (limited to `@publisher/*`, relative paths, bare package names,
   `node:` builtins) and a baseline file to maintain.

### Decision

Choose alternative 3. The layer model below is the contract; the JSON map is
its machine form; the scans are the enforcement; the baseline is the migration
path. Prose (`project-structure.md`, the new rule file) describes the
mechanism and never replaces it.

The hierarchy, from the bottom (no dependencies) to the top:

| Layer | Name        | Owns                                                                                                                           | Directories                                                                                                                                          | May import                                                                                                   |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| L0    | Contract    | Public content types, URL derivation, editorial Markdown, validation and desk rules, theme registry (ids/versions), fixtures   | `packages/content/src/**`                                                                                                                            | `node:crypto`, pure parsers (`sanitize-html`, `mdast-*`). No `process.env`, fs, network, framework, SDK.     |
| L1    | Adapters    | PostgreSQL, S3-compatible object store, image decode/variants/pixel analysis, migrations, recovery                             | `packages/persistence/src/**`; `apps/admin/app/lib/adapters/**` (postgres-\*, file-\*, build-job)                                                    | L0 types, `pg`, `@aws-sdk/*`, `sharp`, `node:*`. Never L2–L5.                                                |
| L2    | Publication | Snapshot → release: renderers, indexes, manifest, verification, activation, static host policy                                 | `packages/publication/src/**`                                                                                                                        | L0, `node:*`, L1 **interfaces only** (`ObjectStore` type). Never a client instance, never `apps/*`.          |
| L3    | Services    | Admin domain services: repository contracts, validation, desk review, media service, publisher/release orchestration, guidance | `apps/admin/app/lib/services/**` (contracts + rules), `apps/admin/app/lib/index`-style composition root                                              | L0, L2, L1 contracts/types, own adapters through the repository factory. No `pg`/`sharp`/`@aws-sdk` symbols. |
| L4    | Surfaces    | HTTP transport and UI: browser session routes, automation routes, admin React UI, public site pages, comments worker           | `apps/admin/app/api/**`, `apps/admin/app/lib/http/**` (auth, request parsing, responses), `apps/admin/app/*.tsx`, `apps/site/**`, `apps/comments/**` | Routes: L3 + `http/`; UI: L0 types + `fetch`; `apps/site`: L0 only. Never L1 symbols, never another surface. |
| L5    | Operators   | Reusable clients and tooling: admin API client, CLI, build/deploy/harness scripts                                              | `packages/admin-client/**`, `packages/ops-cli/**`, `scripts/**`                                                                                      | `admin-client`: nothing. `ops-cli`: admin-client + `node:*`. `scripts`: package **index** entry points only. |

Cross-cutting rules that the map encodes:

- **Direction.** An edge is allowed only downward in the table (or sideways
  where listed). `apps/*` never import each other; `packages/*` never import
  `apps/*`; `scripts/**` import `packages/*/src/index.*` only.
- **Composition roots.** `process.env` may be read only in files the map lists
  as composition roots (`apps/admin/app/lib/config.ts` and the
  `*FromEnvironment` factories in L1, `apps/site/next.config.ts` and
  `scripts/**`, `packages/ops-cli/bin/**`). Everything else receives
  configuration as parameters.
- **Route shape.** Every `apps/admin/app/api/**/route.ts` either calls
  `withSiteAutomation`/`requireSiteAutomationIdentity` (automation) or
  `requireIdentity` **and** resolves the site through `repositoryForRequest`
  (browser). A route file imports from `lib/services/**` and `lib/http/**`
  only; business rules live in a service so that browser and automation routes
  share one implementation.
- **Single presentation owner.** `packages/publication` renderers are the
  canonical public HTML; `apps/site` is the fixture preview that must render
  the same semantic markers (`static-policy.ts` semantic-v3). Theme stylesheet
  sources move to the presentation owner; `packages/content` keeps the theme
  registry (ids, versions) so the snapshot schema stays provider- and
  CSS-free. This move is confirmed separately in ARCH-004 (see backlog).
- **Ratchet.** `layer-baseline.json` lists today's violations by file and
  rule. The scan fails when a violation is not in the baseline **and** when a
  baseline entry no longer matches (stale entry), so the file can only shrink.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [ ] 결정 근거 문서화 완료 — layer names, the L3/L4 split of
      `apps/admin/app/lib`, and the theme-source move need owner confirmation
      (`authority: confirmation-required`)

## Solution

### Deliverables of this spec (Phase 0 + Phase 1)

1. `scripts/harness/layer-map.json` — the single machine-readable source:
   `layers[]` with `id`, `name`, `globs[]`, `allow[]` (layer ids and bare
   module allowlists), `compositionRoots[]`, and `routeRules` (required
   helper names for browser and automation route files).
2. `scripts/harness/scan-layer-imports.mjs` — walks every `.ts/.tsx/.mts/.mjs`
   under the mapped globs, extracts static `import`/`export … from` and
   `import()` specifiers, resolves them to a layer (workspace alias
   `@publisher/*`, relative path, bare package, `node:` builtin) and reports
   `file → specifier (layer X → layer Y not allowed)`.
3. `scripts/harness/scan-env-access.mjs` — reports `process.env` reads outside
   `compositionRoots`.
4. `scripts/harness/scan-route-shape.mjs` — reports route files that lack the
   required auth helper for their surface, or that import L1 symbols or other
   route files.
5. `scripts/harness/layer-baseline.json` — the ratchet, generated once from
   the current tree by `node scripts/harness/scan-layer-imports.mjs --write-baseline`
   and then only edited by removing entries.
6. `run-all-scans.mjs` runs the three scans; `CLAUDE.md` lists them under the
   existing `pnpm harness:scan` gate (no new command).
7. `.agents/rules/layer-boundaries.md` (≤80 lines) names the layers, points to
   the map and the scans, and states the ratchet rule;
   `.agents/project-structure.md` is regenerated from the map (or carries the
   same table verbatim with a "generated from layer-map.json" note);
   `backlog-writer` requires `### Affected Scope` to tag each path with its
   layer id, and `scan-spec-contract.mjs` checks the tag on specs created after
   this spec is approved.
8. `scripts/harness/__tests__/layer-contract.test.mjs` — fixture trees that
   prove each scan fails red on a forbidden edge, a stale baseline entry, an
   out-of-root `process.env`, and a browser route without site authorization,
   and passes on the compliant fixture.

### Phased backlog (follow-up specs, created when each phase starts)

| Phase | ID       | Scope                                                                                                                                                                                                                                                                                                                                                                                 | Removes baseline entries                                              | Authority                                  |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| 0–1   | ARCH-001 | This spec: layer map, three scans, ratchet baseline, rule, spec-writer tag, tests.                                                                                                                                                                                                                                                                                                    | none (records them)                                                   | confirmation-required                      |
| 2     | ARCH-002 | Move image pixel analysis (`analyseImagePixels`) from `apps/admin/app/lib/desk-review.ts` into `packages/persistence/src/media.ts`; move `build-job-repository` into `packages/persistence` (or `publication`) and point `scripts/deploy/publication-worker.ts` at the package index.                                                                                                 | `desk-review.ts → sharp`, `publication-worker.ts → apps/admin`        | delegated                                  |
| 3     | ARCH-003 | Split `apps/admin/app/lib` into `services/`, `adapters/`, `http/` and one composition root (`repository.ts` → `lib/index` or `lib/config.ts`); route files import only `services/` + `http/`; every browser route uses `repositoryForRequest`, every automation route uses `withSiteAutomation`. Alternative to decide inside the spec: extract `services/` as `packages/admin-core`. | all `route-shape` and most `layer-imports` entries under `apps/admin` | confirmation-required (directory contract) |
| 4     | ARCH-004 | Presentation ownership: renderer parity test (fixture snapshot rendered by `packages/publication` vs `apps/site` output, compared on semantic-v3 markers), theme stylesheet sources moved from `packages/content/src/themes` to the presentation owner with the registry left in content.                                                                                             | `content → CSS sources` (documented, not an import edge)              | confirmation-required (design ownership)   |
| 5     | ARCH-005 | Configuration at composition roots: replace scattered `process.env` reads in `apps/admin/app/lib` with a typed `config.ts`; `objectStoreFromEnvironment` stays as an L1 factory but is called only from roots. Ratchet `scan-env-access` to zero.                                                                                                                                     | all `env-access` entries                                              | delegated                                  |

Order is fixed: 1 before 2–5 because the gates must exist before refactors so
each refactor is measured by baseline entries removed. 2 and 5 are independent
of 3; 4 depends on nothing but is the largest design decision and is scheduled
last so that the presentation move happens once, after the admin split.

### Out of scope

- Changing any public route, snapshot schema, or admin API contract.
- Adding `dependency-cruiser`/ESLint boundary plugins (revisit if the
  hand-written resolver proves insufficient; record in ARCH-003 if so).
- `apps/comments` internals beyond assigning it to L4.

## Affected Files

- `scripts/harness/layer-map.json` (new), `layer-baseline.json` (new),
  `scan-layer-imports.mjs` (new), `scan-env-access.mjs` (new),
  `scan-route-shape.mjs` (new), `run-all-scans.mjs`, `scan-spec-contract.mjs`,
  `__tests__/layer-contract.test.mjs` (new)
- `.agents/rules/layer-boundaries.md` (new), `.agents/rules/index.md`,
  `.agents/project-structure.md`, `.agents/skills/backlog-writer/SKILL.md`,
  `CLAUDE.md`
- Follow-up phases touch the directories listed in the backlog table.

## Completion Criteria

- [ ] TC-01: `node scripts/harness/scan-layer-imports.mjs` → exit 0 on the
      current tree with every pre-existing violation present in
      `layer-baseline.json`; adding `import 'pg'` to
      `packages/content/src/index.ts` → exit 1 with output containing
      `packages/content/src/index.ts → pg (L0 → adapters-sdk not allowed)`.
- [ ] TC-02: Removing a baseline entry whose violation still exists → exit 1
      naming the file; deleting the violation while its entry remains → exit 1
      with `stale baseline entry`. The baseline can only shrink.
- [ ] TC-03: `node scripts/harness/scan-env-access.mjs` → exit 0 on the
      current tree via baseline; a new `process.env.X` in
      `packages/publication/src/static-builder.ts` → exit 1 naming the file
      and `composition root`.
- [ ] TC-04: `node scripts/harness/scan-route-shape.mjs` → exit 1 on a fixture
      browser `route.ts` that calls `requireIdentity` without
      `repositoryForRequest`, and on a route importing `@publisher/persistence`
      or `sharp`; exit 0 on `apps/admin/app/api/desk/route.ts` as merged in
      PR #10.
- [ ] TC-05: `pnpm harness:scan` → `[harness] 9 scans passed`; `pnpm test`
      includes `layer-contract.test.mjs` with every fixture case above passing.
- [ ] TC-06: `.agents/project-structure.md` and
      `.agents/rules/layer-boundaries.md` contain the L0–L5 table with the
      same directory globs as `layer-map.json`; `scan-spec-contract.mjs` fails
      a new spec whose `### Affected Scope` path lacks an `L0`–`L5` tag and
      passes this spec.
- [ ] TC-07: `layer-baseline.json` lists at least the seven observed
      violations from `## Problem` (by file and rule), and each follow-up
      backlog row names the entries it removes.

## Test Plan

| TC-ID | Test Type | Tool / Approach                                            | Notes                                                                                                                                                              |
| ----- | --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | unit      | `layer-contract.test.mjs` + direct scan run                | Temporary fixture tree under `os.tmpdir()` with a copied `layer-map.json`; assert exit code and message text; then run on the real tree with the baseline.         |
| TC-02 | unit      | `layer-contract.test.mjs`                                  | Two fixture baselines: one missing an entry, one with a stale entry; both must exit 1 with the named reason.                                                       |
| TC-03 | unit      | `layer-contract.test.mjs` + direct scan run                | Fixture file with `process.env.FOO` outside roots; the real tree passes only through baseline entries, which are counted and reported.                             |
| TC-04 | unit      | `layer-contract.test.mjs`                                  | Fixture routes for browser-without-site-auth, route-importing-adapter, and the merged desk route copied verbatim as the compliant case.                            |
| TC-05 | gate      | `pnpm harness:scan`, `pnpm test`                           | Run after wiring `run-all-scans.mjs`; scan count rises from 6 to 9. Precondition: `pnpm build` output exists for the static-output scan, as today.                 |
| TC-06 | contract  | `scan-spec-contract.mjs` + file diff                       | Table equality checked by a test that parses the markdown table and the JSON globs; spec tag check exercised on a fixture spec with and without layer tags.        |
| TC-07 | manual    | Review of `layer-baseline.json` against `## Problem` items | Reviewer maps each Problem item 1–6 to at least one baseline entry (item 7 is covered by TC-06, item 6 by a documented non-import entry `presentation.duplicate`). |

## Tasks

- [ ] `.agents/tasks/ARCH-001.md` — 미생성 (GATE-APPROVAL 통과 후 생성)

## Evidence Log
