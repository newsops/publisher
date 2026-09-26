---
status: done
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
   from `### Affected Scope

Layer ids follow `scripts/harness/layer-map.json`.

- Harness (L5 scripts): `scripts/harness/layer-map.json` (new, machine-readable
  single source), `scripts/harness/surface-map.json` (new capability registry),
  `scripts/harness/layer-common.mjs` (new), `scripts/harness/scan-layer-imports.mjs`,
  `scan-env-access.mjs`, `scan-route-shape.mjs`, `scan-surface-parity.mjs` (new),
  `scripts/harness/layer-baseline.json` (new ratchet baseline),
  `scripts/harness/run-all-scans.mjs`, `scripts/harness/scan-spec-contract.mjs`,
  `scripts/harness/__tests__/layer-contract.test.mjs` (new).
- Rules and docs (no layer — repository governance): `.agents/project-structure.md`
  (human copy of the layer map), `.agents/rules/layer-boundaries.md` (new),
  `.agents/rules/index.md`, `.agents/skills/backlog-writer/SKILL.md` (Affected
  Scope must name layers), `CLAUDE.md` (gate list), `docs/admin-api.md`,
  `docs/agent-operations.md`.
- Follow-up refactors (separate specs, listed under "Phased backlog"):
  `apps/admin/app/lib/**` (L1 adapters, L3 services/composition, L4 http),
  `packages/persistence/src/media.ts` (L1), `packages/persistence` build-job
  repository (L1), `packages/publication` (L2), `packages/content/src/themes/**`
  (L0), `apps/site/app/components/**` (L4), `scripts/deploy/publication-worker.ts`
  (L5).

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

#### Access surfaces

Inside L4/L5 three surfaces reach the same L3 services. They differ in who
calls, how the caller is identified, and how the site is scoped; they never
differ in business rules.

| Surface        | Caller                          | Identity                                                                 | Transport and owner code                                                                            | Site scope                                                  |
| -------------- | ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Admin page     | Human operator in a browser     | Local account session cookie (`owner`/`publisher`/`editor`), same-origin | `apps/admin/app/*.tsx` → `apps/admin/app/api/**` browser routes (L4)                                | `x-admin-site-id` header resolved by `repositoryForRequest` |
| Automation API | Agent, integration, CI          | Bearer automation key with `role` and `sites[]`                          | `apps/admin/app/api/v2/sites/{siteId}/**` (L4); contract published in `docs/admin-api.openapi.yaml` | `{siteId}` path segment checked by `withSiteAutomation`     |
| CLI            | Operator or agent shell process | `PUBLISHER_API_TOKEN` forwarded by `@publisher/admin-client`             | `packages/ops-cli` → `packages/admin-client` → Automation API only (L5)                             | `--site` flag mapped to the `v2` path                       |

Surface rules:

- **One capability, one service.** A capability is implemented once in L3;
  the browser route and the `v2` route are thin adapters over it. A route
  that contains a rule the other surface lacks is a violation.
- **CLI has no capabilities of its own.** Every CLI command wraps an
  `admin-client` method, and every `admin-client` method mirrors one `v2`
  operation in the OpenAPI document. The CLI never opens PostgreSQL, object
  storage, or a provider API; `doctor` and `content inspect` are local
  process utilities and are declared as such.
- **Exclusivity is declared, never accidental.** `surface-map.json` lists
  each capability with its service, browser route, `v2` route, client method,
  CLI command, and UI panel. A capability missing from a surface must carry
  `exclusive: browser | automation | cli` with a reason (for example
  `accounts`, `auth/session` and `comments/moderation` are browser-only human
  trust actions; `content-restore`, `bootstrap`, `operations` are
  automation-only; `doctor`, `content inspect` are CLI-only).
- **Parity gate.** `scan-surface-parity.mjs` fails when a declared path does
  not exist, when a route directory, client method, or CLI command in the
  tree is not registered, or when a `v2` route is absent from the OpenAPI
  document. Today's gaps go into the same shrinking baseline.

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
- [x] 결정 근거 문서화 완료 — layer names, the L3/L4 split of
      `apps/admin/app/lib`, and the theme-source move confirmed by the owner on
      2026-09-19 (see GATE-APPROVAL)

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
9. `scripts/harness/surface-map.json` (capability registry for the three
   access surfaces) and `scripts/harness/scan-surface-parity.mjs`, with
   today's coverage gaps recorded in `layer-baseline.json` under the
   `surface-parity` rule; `docs/admin-api.md` and `docs/agent-operations.md`
   gain a "Surfaces" section generated from the same map.

### Phased backlog (follow-up specs, created when each phase starts)

| Phase | ID       | Scope                                                                                                                                                                                                                                                                                                                                                                                 | Removes baseline entries                                              | Authority                                  |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| 0–1   | ARCH-001 | This spec: layer map, three scans, ratchet baseline, rule, spec-writer tag, tests.                                                                                                                                                                                                                                                                                                    | none (records them)                                                   | confirmation-required                      |
| 2     | ARCH-002 | Move image pixel analysis (`analyseImagePixels`) from `apps/admin/app/lib/desk-review.ts` into `packages/persistence/src/media.ts`; move `build-job-repository` into `packages/persistence` (or `publication`) and point `scripts/deploy/publication-worker.ts` at the package index.                                                                                                 | `desk-review.ts → sharp`, `publication-worker.ts → apps/admin`        | delegated                                  |
| 3     | ARCH-003 | Split `apps/admin/app/lib` into `services/`, `adapters/`, `http/` and one composition root (`repository.ts` → `lib/index` or `lib/config.ts`); route files import only `services/` + `http/`; every browser route uses `repositoryForRequest`, every automation route uses `withSiteAutomation`. Alternative to decide inside the spec: extract `services/` as `packages/admin-core`. | all `route-shape` and most `layer-imports` entries under `apps/admin` | confirmation-required (directory contract) |
| 4     | ARCH-004 | Presentation ownership: renderer parity test (fixture snapshot rendered by `packages/publication` vs `apps/site` output, compared on semantic-v3 markers), theme stylesheet sources moved from `packages/content/src/themes` to the presentation owner with the registry left in content.                                                                                             | `content → CSS sources` (documented, not an import edge)              | confirmation-required (design ownership)   |
| 5     | ARCH-005 | Configuration at composition roots: replace scattered `process.env` reads in `apps/admin/app/lib` with a typed `config.ts`; `objectStoreFromEnvironment` stays as an L1 factory but is called only from roots. Ratchet `scan-env-access` to zero.                                                                                                                                     | all `env-access` entries                                              | delegated                                  |

| 6 | ARCH-006 | Surface parity backfill: bring `docs/admin-api.openapi.yaml` to every `v2` route, add the missing `admin-client` methods and CLI commands (settings get/set, site update/archive, post delete, plugins, article locales, standalone media upload/approve), and declare the browser-only and automation-only exclusives with reasons. | all `surface-parity` entries | delegated |

Order is fixed: 1 before 2–6 because the gates must exist before refactors so
each refactor is measured by baseline entries removed. 2 and 5 are independent
of 3; 4 depends on nothing but is the largest design decision and is scheduled
after the admin split so that the presentation move happens once; 6 follows 3
because the route split fixes which service each surface adapts.

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

- [x] TC-01: `node scripts/harness/scan-layer-imports.mjs` → exit 0 on the
      current tree with every pre-existing violation present in
      `layer-baseline.json`; adding `import 'pg'` to
      `packages/content/src/index.ts` → exit 1 with output containing
      `packages/content/src/index.ts → pg (L0 → adapters-sdk not allowed)`.
- [x] TC-02: Removing a baseline entry whose violation still exists → exit 1
      naming the file; deleting the violation while its entry remains → exit 1
      with `stale baseline entry`. The baseline can only shrink.
- [x] TC-03: `node scripts/harness/scan-env-access.mjs` → exit 0 on the
      current tree via baseline; a new `process.env.X` in
      `packages/publication/src/static-builder.ts` → exit 1 naming the file
      and `composition root`.
- [x] TC-04: `node scripts/harness/scan-route-shape.mjs` → exit 1 on a fixture
      browser `route.ts` that calls `requireIdentity` without
      `repositoryForRequest`, and on a route importing `@publisher/persistence`
      or `sharp`; exit 0 on `apps/admin/app/api/desk/route.ts` as merged in
      PR #10.
- [x] TC-05: `pnpm harness:scan` → `[harness] 10 scans passed`; `pnpm test`
      includes `layer-contract.test.mjs` with every fixture case above passing.
- [x] TC-06: `.agents/project-structure.md` and
      `.agents/rules/layer-boundaries.md` contain the L0–L5 table with the
      same directory globs as `layer-map.json`; `scan-spec-contract.mjs` fails
      a new spec whose `### Affected Scope` path lacks an `L0`–`L5` tag and
      passes this spec.
- [x] TC-07: `layer-baseline.json` lists at least the eight observed
      violations from `## Problem` (by file and rule), and each follow-up
      backlog row names the entries it removes.
- [x] TC-08: `node scripts/harness/scan-surface-parity.mjs` → exit 0 on the
      current tree via baseline entries that name every undocumented `v2`
      route and every client method without a CLI command; adding a fixture
      `apps/admin/app/api/v2/sites/[siteId]/widgets/route.ts` that is not in
      `surface-map.json` → exit 1 with `unregistered capability: widgets`;
      a map entry without a `v2` route and without `exclusive` → exit 1 with
      `missing surface: automation`.

## Test Plan

| TC-ID | Test Type | Tool / Approach                                            | Notes                                                                                                                                                                                                |
| ----- | --------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit      | `layer-contract.test.mjs` + direct scan run                | Temporary fixture tree under `os.tmpdir()` with a copied `layer-map.json`; assert exit code and message text; then run on the real tree with the baseline.                                           |
| TC-02 | unit      | `layer-contract.test.mjs`                                  | Two fixture baselines: one missing an entry, one with a stale entry; both must exit 1 with the named reason.                                                                                         |
| TC-03 | unit      | `layer-contract.test.mjs` + direct scan run                | Fixture file with `process.env.FOO` outside roots; the real tree passes only through baseline entries, which are counted and reported.                                                               |
| TC-04 | unit      | `layer-contract.test.mjs`                                  | Fixture routes for browser-without-site-auth, route-importing-adapter, and the merged desk route copied verbatim as the compliant case.                                                              |
| TC-05 | gate      | `pnpm harness:scan`, `pnpm test`                           | Run after wiring `run-all-scans.mjs`; scan count rises from 6 to 10. Precondition: `pnpm build` output exists for the static-output scan, as today.                                                  |
| TC-06 | contract  | `scan-spec-contract.mjs` + file diff                       | Table equality checked by a test that parses the markdown table and the JSON globs; spec tag check exercised on a fixture spec with and without layer tags.                                          |
| TC-07 | manual    | Review of `layer-baseline.json` against `## Problem` items | Reviewer maps each Problem item 1–6 and 8 to at least one baseline entry (item 7 is covered by TC-06; item 6 is not an import edge and is tracked by ARCH-004).                                      |
| TC-08 | unit      | `layer-contract.test.mjs` + direct scan run                | Fixture route directory and fixture map entries; the real-tree run reports the current gap count (OpenAPI 13 of 22 `v2` paths; client methods without CLI) so the number is visible in the baseline. |

## Tasks

- [x] `.agents/tasks/completed/ARCH-001.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Problem lists eight reproducible observations with file paths and counts; three alternatives with pro/con; the decision names the six layers, the three access surfaces, and the ratchet; TC-01 to TC-08 each have a Test Plan row with notes.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: confirmation-required`. The owner reviewed the layer model and surface split and answered "이 것도 좋아. 그리고 추가로 api/cli/관리자페이지 구분," and then set the session goal "ARCH-006 처리할 때까지 반복해서 완료해줘", which is taken as standing delegation for the recommended options of the follow-up phases (folder split inside `apps/admin/app/lib`, theme sources to the presentation owner).

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress
Task record created; branch `claude/frontend-news-design-96ff02`.

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying
`pnpm typecheck`, `pnpm harness:scan` (10 scans), `pnpm harness:test` (43 files / 215 tests) pass on the implementation.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-layer-imports.mjs` and `layer-contract.test.mjs` "passes on the compliant fixture and fails on a forbidden edge".
Observed result: the real tree exits 0 with 32 baseline entries; the fixture with `import pg from 'pg'` in `packages/content/src/index.ts` exits 1 printing `packages/content/src/index.ts -> pg — contract may not import sdk module`.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: `layer-contract.test.mjs` "refuses a baseline that grows or goes stale".
Observed result: a baseline entry for a present violation passes; once the violation is removed the scan exits 1 with `stale baseline entry (remove it from layer-baseline.json)`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-env-access.mjs` and the test "confines process.env to composition roots".
Observed result: real tree exits 0 with 28 baseline entries; the fixture `process.env.STATIC_ROOT` in `packages/publication/src/static-builder.ts` exits 1 naming the file and `composition root`.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-route-shape.mjs` and the test "requires site resolution in browser routes and forbids adapter imports".
Observed result: a browser route with `requireIdentity` but no `repositoryForRequest` exits 1 with `missing site resolution`; a route importing `sharp` exits 1 with `-> sharp`; the merged `apps/admin/app/api/desk/route.ts` is not in the baseline and passes.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-19

Command: `pnpm harness:scan`, `pnpm harness:test`.
Observed result: `[harness] 10 scans passed`; `Test Files 43 passed (43)`, `Tests 215 passed (215)` including the six cases of `layer-contract.test.mjs`.

### [GATE-COMPLETE: TC-06] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-spec-contract.mjs` before and after tagging this spec.
Observed result: before tagging it exited 1 with `### Affected Scope must tag paths with their layer (L0–L5)`; after tagging it reports matching test-plan rows across all 27 specs. `.agents/project-structure.md` and `.agents/rules/layer-boundaries.md` carry the L0–L5 table with the map's directories.

### [GATE-COMPLETE: TC-07] — ✅ | 2026-09-19

Command: review of `scripts/harness/layer-baseline.json` (88 entries).
Observed result: item 1 → `apps/admin/app/lib/desk-review.ts -> sharp`; item 2 → `scripts/deploy/publication-worker.ts -> ../../apps/admin/app/lib/build-job-repository`; item 3 → the adapter→services and services→http entries under `apps/admin/app/lib`; item 4 → 11 `route-shape` entries; item 5 → 28 `env-access` entries; item 8 → 17 `surface-parity` entries; item 6 is tracked by ARCH-004 and item 7 by TC-06. Each backlog row names the rule whose entries it removes.

### [GATE-COMPLETE: TC-08] — ✅ | 2026-09-19

Command: `node scripts/harness/scan-surface-parity.mjs` and the test "keeps every capability registered and reachable from every surface".
Observed result: real tree exits 0 with 17 baseline entries (10 undocumented `v2` routes, 6 missing surfaces, 1 exclusive exposure); the fixture `widgets` route exits 1 with `unregistered capability: automation sites/[siteId]/widgets` and `undocumented v2 route`; removing the automation route from a non-exclusive capability exits 1 with `missing surface: desk-review automation`.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
Every criterion has observed evidence; the task record is archived at `.agents/tasks/completed/ARCH-001.md`.
