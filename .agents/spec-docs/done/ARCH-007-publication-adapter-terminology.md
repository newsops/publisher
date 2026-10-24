---
status: done
type: AGREEMENT
tags: [typescript, rest, cli]
authority: confirmation-required
---

# ARCH-007: Rename server-core Plugin to Adapter (Desk Plugin keeps the word)

## Problem

The word `plugin` names two unrelated concepts, and the overlap is now structural:

1. `packages/content/src/plugins/index.ts:8` (`PluginDefinition`, `PublicPluginSnapshot`), `apps/admin/app/lib/services/plugin-repository.ts:20` (`PluginRepository`), `publisher_admin.plugin_installations` (`packages/persistence/migrations/admin/0001_initial.sql:20`), and API routes `apps/admin/app/api/plugins/**` plus `apps/admin/app/api/v2/sites/[siteId]/plugins/**` implement the site-scoped reviewed adapter (server core).
2. `packages/claude-plugin/README.md:1` ("Publisher Desk — Claude Code plugin") and `docs/agent-operations.md:64` ("Claude Code plugin") use the same word for the Claude marketplace editorial operator (L5 consumer).
3. Worst nesting: the Desk Plugin bundles the CLI that operates server plugins — `packages/claude-plugin/skills/publisher-cli/SKILL.md:84` documents `plugin list|get|install|configure|validate|enable|disable` inside the plugin. Operators read "plugin inside the plugin".

Reproduction: `grep -rli "plugin" apps packages scripts docs` returns ~120 source files mixing both meanings (excluding `.next/` build output); no file states which meaning it uses. `docs/plugins.md:1` (server adapters) vs `packages/claude-plugin/README.md:1` (desk operator) are both titled as plugin docs.

## Architecture Review

### Affected Scope

- L0 contract `packages/content/src/**`: `plugins/` → `adapters/` (`index.ts`, `google-analytics.ts`, `installation-transitions.ts`), `index.ts`, `seed-parsers.ts`, `managed-validation.ts`, `seed.ts`, `editor.ts`, `data/plugins.json`, `docs/SPEC.md`. Snapshot `PublicPluginSnapshot` (schemaVersion 1) becomes versioned adapter snapshot.
- L1 adapters `packages/persistence/src/**`, `apps/admin/app/lib/adapters/file-plugin-repository.ts`, `postgres-plugin-repository.ts`, `file-publication.ts`, `postgres-publication.ts`, `lib/http/plugin-api-input.ts`, new SQL migration renaming `plugin_installations`.
- L2 publication `packages/publication/src/static-types.ts:59`, `static-renderers.ts`, `static-core-recipes.ts`, `static-runtime-recipes.ts`: `plugins` projection field rename.
- L3 services `apps/admin/app/lib/services/plugin-repository.ts`, `lib/index.ts`, `lib/http/request-repository.ts`.
- L4 surfaces: browser `app/api/plugins/**`, automation `app/api/v2/sites/[siteId]/plugins/**`, UI `PluginManagementPanel.tsx`, `admin-model.ts`, `admin-actions.ts`, `useAdminDashboard.ts`, `AdminDashboardView.tsx`, `globals.css`; site `app/lib/public-plugins.ts`, `components/plugins/PluginContributions.tsx`. `surface-map.json` capability `plugins` re-registers as `adapters`.
- L5 operators: `packages/admin-client/src/*`, `packages/ops-cli/bin/publisher.mjs` (`plugin` command group), `packages/claude-plugin/skills/publisher-cli/SKILL.md`, `scripts/generate-plugin-headers.mjs`, `scripts/harness/*` (contract tests, `scan-plugin-contract.mjs`, `layer-map.json` globs).
- Docs: `docs/plugins.md` → `docs/adapters.md`, `docs/admin-api.md`, `docs/admin-api.openapi.yaml` (`/plugins` paths, `PluginInstallation` schemas), `docs/agent-operations.md`, `docs/publication-platform-plan.ko.md`.

### Alternatives Considered

1. Non-breaking alias: rename docs/UI labels only, keep code/API/DB as `plugin`.
   - Pro: zero migration, no contract bump.
   - Con: the confusion lives in code (`PluginRepository`, `pluginId`, `/plugins`), so the reported problem is not fixed.
2. Rename the Claude side instead (server keeps `plugin`, Claude becomes "Desk Extension").
   - Pro: server API/DB/snapshot untouched.
   - Con: Claude marketplace terms are platform-fixed (`plugin.json`, `marketplace.json`, `/plugin install` commands); the server still uses one word for adapters while every harness/test file says plugin, so the core ambiguity remains.
3. Breaking rename of the server concept `Plugin` → `Adapter`; the Claude marketplace component keeps the word `plugin` as `Desk Plugin`.
   - Pro: each word names one concept everywhere (code, API, DB, docs, CLI); `docs/plugins.md:5` already calls them "reviewed adapters", so the new term matches existing language.
   - Con: breaking change across API paths, CLI verbs, DB table, snapshot schema; requires one atomic migration.

### Decision

Choose alternative 3. On 2026-10-24, after being shown the breaking API/CLI rename and retained Desk Plugin distinction, the owner explicitly selected **"이름과 API·CLI를 함께 변경 (권장)"**; the subsequent GATE-APPROVAL PASS records that exact confirmation. Server-core `Plugin*` (`PluginDefinition`, `PluginInstallation`, `PublicPluginSnapshot`, `PluginRepository`, `pluginId`, `/plugins`, `publisher plugin`, `plugin_installations`) becomes `Adapter*` (`AdapterDefinition`, `AdapterInstallation`, `PublicAdapterSnapshot`, `AdapterRepository`, `adapterId`, `/adapters`, `publisher adapter`, `adapter_installations`). The Claude component is henceforth named `Desk Plugin`. No compatibility shim: old paths/verbs fail closed (404 / USAGE) so stale callers are loud, per fail-loud rule.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — `surface-map.json:154` capability `plugins`, openapi `/api/v2/sites/{siteId}/plugins`, CLI `plugin` group, DB table `plugin_installations` 전수 확인; Next.js `tsconfig` plugin 항목은 프레임워크 개념이므로 제외하고, 관리자 패널과 공개 어댑터 슬롯의 CSS 식별자는 도메인 개명에 포함
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. L0: `packages/content/src/plugins/` → `adapters/`; all exported `Plugin*` types/functions/registries renamed to `Adapter*`; `PublicPluginSnapshot { schemaVersion: 1 }` → `PublicAdapterSnapshot { schemaVersion: 2 }` with `installations[].adapterId`; `seed-parsers.ts` rejects schemaVersion 1 snapshots; fixture `data/plugins.json` → `data/adapters.json`.
2. L1/L3: `plugin-repository.ts` → `adapter-repository.ts` (+ file/postgres variants); new admin migration renames table and its `plugin_id` column; `recovery.ts` orderBy key updated.
3. L4: route directories renamed (`api/plugins/**` → `api/adapters/**`, `api/v2/sites/[siteId]/plugins/**` → `.../adapters/**`, `[pluginId]` → `[adapterId]`); UI panel/component/CSS renamed; site `public-plugins.ts` → `public-adapters.ts`.
4. L2: `PublicationInputs.plugins` → `adapters`; renderers/recipes read the adapter snapshot only.
5. L5: `publisher plugin …` → `publisher adapter …` (old verb returns USAGE without a request); admin-client methods renamed; Desk Plugin skill table regenerated; `generate-plugin-headers.mjs` renamed; harness `surface-map.json`/`layer-map.json`/contract tests updated. Add `scan-adapter-contract.mjs` for the domain prohibition; retain the existing `scan-plugin-contract.mjs`, which validates Desk Plugin packaging rather than site adapters.
6. Docs: replace `docs/plugins.md` with the canonical `docs/adapters.md`, which links to the separate Desk Plugin guide. Remove the old document rather than retaining an old-name shim; update current document links, OpenAPI paths/schemas, `agent-operations.md` CLI examples and its Desk Plugin section.

Applied SQL migration files are immutable because the migration runner checks
their SHA-256 digests. Keep `0001_initial.sql` unchanged and perform the table,
column and stored payload-key conversion in `0006_adapter_terminology.sql`.
These two migration files and negative regression fixtures necessarily retain
the removed spelling; neither creates a compatibility API or runtime mode.
The domain scanner excludes these evidence/transition inputs and permits the
exact Desk Plugin distribution terms and its platform-fixed paths/commands.
ARCH-007 supersedes CLI-005's original command spelling in its current Solution,
Completion Criteria and Test Plan; historical Problem and Evidence Log remain.

## Affected Files

- `.agents/spec-docs/active/ARCH-007-publication-adapter-terminology.md`
- `packages/content/src/plugins/**` → `packages/content/src/adapters/**`
- `packages/content/src/{index,seed-parsers,managed-validation,seed,editor}.ts`, `packages/content/src/data/plugins.json`, `packages/content/docs/SPEC.md`
- `apps/admin/app/lib/services/plugin-repository.ts`, `apps/admin/app/lib/adapters/file-plugin-repository.ts`, `postgres-plugin-repository.ts`, `file-publication.ts`, `postgres-publication.ts`, `lib/http/plugin-api-input.ts`, `lib/http/request-repository.ts`, `lib/index.ts`
- `apps/admin/app/api/plugins/**`, `apps/admin/app/api/v2/sites/[siteId]/plugins/**`
- `apps/admin/app/{PluginManagementPanel.tsx→AdapterManagementPanel.tsx,admin-model.ts,admin-actions.ts,useAdminDashboard.ts,AdminDashboardView.tsx,globals.css}`
- `apps/site/app/lib/public-plugins.ts`, `apps/site/app/components/plugins/PluginContributions.tsx`
- `packages/publication/src/{static-types,static-renderers,static-core-recipes,static-runtime-recipes}.ts`
- `packages/persistence/migrations/admin/0006_adapter_terminology.sql`, `packages/persistence/src/recovery.ts`
- `packages/admin-client/src/{client.js,index.d.ts,client.test.ts}`, `packages/ops-cli/bin/publisher.mjs`, `packages/claude-plugin/skills/publisher-cli/SKILL.md`
- `scripts/{generate-plugin-headers.mjs,harness/surface-map.json,harness/layer-map.json,harness/scan-plugin-contract.mjs,harness/__tests__/plugin-*.test.mjs}`
- `docs/{plugins.md→adapters.md,admin-api.md,admin-api.openapi.yaml,agent-operations.md,publication-platform-plan.ko.md}`

## Completion Criteria

- [x] TC-01: `node scripts/harness/scan-adapter-contract.mjs` exits 0 for current domain sources and docs; its negative fixture exits 1 for the removed spelling and its Desk Plugin fixture exits 0. Removed symbols/paths/fields are absent from runtime domain code; immutable initial DDL, its forward migration and negative regression inputs are explicit exceptions, not aliases.
- [x] TC-02: `pnpm typecheck` passes for the whole workspace.
- [x] TC-03: `pnpm test` passes for the whole workspace (content, publication, admin, CLI unit suites).
- [x] TC-04: adapter API serves and old paths fail closed — authenticated `GET /api/v2/sites/example/adapters` returns 200 with `adapters` list; `GET /api/v2/sites/example/plugins` returns 404; browser `GET /api/adapters` returns 200 and `GET /api/plugins` returns 404.
- [x] TC-05: CLI verbs renamed — `publisher adapter list --site example --json` issues `GET /api/v2/sites/example/adapters`; bare `publisher plugin --json --non-interactive` returns a nonzero USAGE envelope without any HTTP request.
- [x] TC-06: clean-room migration applies — fresh PostgreSQL provision plus migration run creates `adapter_installations` and no `plugin_installations` table remains.
- [x] TC-07: snapshot version bump enforced — a schemaVersion 1 plugin snapshot is rejected by `parsePublicAdapterSnapshot`, and publish projects only enabled adapter installations into a schemaVersion 2 adapter snapshot.
- [x] TC-08: `pnpm harness:scan` passes with updated `surface-map.json`/`layer-map.json` and the new bare-word plugin guard.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract    | `node scripts/harness/scan-adapter-contract.mjs`; `scripts/harness/__tests__/adapter-terminology-contract.test.mjs`                         | Tests: `ARCH-007 breaking adapter contract` / `rejects domain naming while allowing explicit Desk Plugin references` and `removes both old route trees rather than retaining aliases`. The negative spelling fixture exits 1; the exact Desk Plugin fixture exits 0. Immutable migration/negative inputs are explicit exceptions.                                                                                                               |
| TC-02 | regression  | `pnpm typecheck`                                                                                                                            | No separate unit test is added: the full-workspace TypeScript compiler exit status is this criterion's automated assertion; Node 22.23.4 execution exited 0.                                                                                                                                                                                                                                                                                    |
| TC-03 | regression  | `pnpm test`                                                                                                                                 | Tests include `scripts/harness/__tests__/adapter-contract.test.mjs` / `adapter registry contract`, `adapter-api-contract.test.mjs` / `site adapter API contract`, and `adapter-lifecycle-cli.test.mjs` / `CLI-005 adapter lifecycle`, in addition to all package suites and the complete harness. Node 22.23.4 run: 70 harness files / 418 tests passed.                                                                                        |
| TC-04 | integration | `scripts/harness/__tests__/adapter-api-contract.test.mjs`; isolated actual Next HTTP checks                                                 | Tests: `site adapter API contract` / `configures, validates, enables, disables, and lists a site-scoped adapter` and `exposes the same site-scoped list through the authenticated human surface`. `adapter-terminology-contract.test.mjs` / `removes both old route trees rather than retaining aliases` asserts route removal; authenticated isolated Next requests additionally observed both new lists at 200 and both removed paths at 404. |
| TC-05 | integration | `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs`; `adapter-terminology-contract.test.mjs`                                         | Tests: `CLI-005 adapter lifecycle` / `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`; `ARCH-007 breaking adapter contract` / `rejects the removed CLI group before any HTTP request`. Assert exact new list URL and zero network requests with exit 10 / USAGE for removed verbs.                                                                                                            |
| TC-06 | integration | `scripts/harness/__tests__/portable-persistence-integration.test.mjs`                                                                       | Tests: `INFRA-005 PostgreSQL integration` / `creates only the adapter table on a clean migration run` and `renames stored installation IDs and columns through a forward migration`. The isolated PGlite 0.5.8 fixture reports PostgreSQL 18.3 and is accessed through its loopback PostgreSQL protocol socket; assertions query `information_schema` and normal repository reads. No operated instance is involved.                            |
| TC-07 | contract    | `scripts/harness/__tests__/adapter-terminology-contract.test.mjs`; `adapter-snapshot-contract.test.mjs`; `adapter-static-boundary.test.mjs` | Tests: `accepts only adapter snapshot v2 and rejects old schema and fields`; `adapter snapshot secrecy and clone contract` / `publishes only enabled public configuration and removes secret references on clone`; `static adapter boundary contract` / `keeps disabled adapter output inert and has no public runtime configuration path`. Assert v1/old fields rejected, v2 public output and disabled output inert.                          |
| TC-08 | regression  | `pnpm harness:scan`; `scripts/harness/__tests__/adapter-terminology-contract.test.mjs`                                                      | All 13 executable scans are the automated regression assertions; the additional test `rejects domain naming while allowing explicit Desk Plugin references` exercises the new scanner's rejecting and permitted cases. Layer/surface checks and both Adapter-domain and Desk Plugin-bundle scans exit 0.                                                                                                                                        |

## Tasks

- [x] `.agents/tasks/completed/ARCH-007.md` — implementation record created after explicit approval.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-10-04

**Status upgrade:** draft → review-ready

- Frontmatter: file starts with `---` YAML block; `status: draft`, `type: AGREEMENT` (allowed prefix), `tags: [typescript, rest, cli]` present, `authority: confirmation-required` present.
- Problem: concrete symptoms with file:line references (content plugins/index.ts:8, plugin-repository.ts:20, migration 0001_initial.sql:20, api/plugins routes, Desk Plugin README) plus `grep -rli "plugin"` reproduction with ~120 files and docs/plugins.md vs README conflict; no TBD/TODO/vague single sentence.
- Architecture Review Checklist: all 4 items `[x]`; sibling scan `[x]` with completion evidence (surface-map.json:154, openapi /plugins, CLI plugin group, plugin_installations table) plus explicit exclusion reason (tsconfig/CSS not domain concepts); 3 alternatives each with Pro/Con; Decision references tradeoff (authorized breaking change, fail-loud 404/USAGE).
- Completion Criteria: 8 items TC-01–TC-08 all with TC-N prefix, each in Command/Observable form (grep assertion, typecheck/test/harness exit 0, HTTP 200/404 assertions, CLI request assertions, migration/schema assertions); none of the banned vague phrases used.
- Test Plan: `## Test Plan` present with 8 rows TC-01–TC-08 matching Completion Criteria count; every row has non-empty Test Type, Tool/Approach, Notes (no TBD); no `manual` rows so the manual-automation-reason rule is vacuously satisfied.
- Structure: Tasks placeholder present (`.agents/tasks/ARCH-007.md` uncreated note); Evidence Log present and was empty before this entry.
- Operated-instance evidence: no domains/hosts/deploy IDs/screenshots in the spec; TC-06 Notes explicitly states no operated instance involved.

### [GATE-APPROVAL] — ❌ FAIL | 2026-10-24

**Status remains:** review-ready
**Failed criteria:**

- Direct, post-review confirmation for this `authority: confirmation-required` specification is not established. The current owner's exact instruction, **"남은 이슈 모두 처리해"**, follows the local-first architecture and verification-plan discussion; the supplied conversation does not show this breaking server-core terminology proposal being presented as part of that reviewed scope before the instruction. It authorizes remaining work generally but does not establish the spec-specific confirmation required by this gate. The Decision section's historical authorization claim is not an exact owner statement or a recorded approval-gate result.
  **Required action:** Record a direct post-review owner confirmation covering ARCH-007's breaking API, CLI, snapshot, and persistence rename, or provide verifiable conversation evidence that this completed proposal was included in the scope expressly approved by the owner; then rerun GATE-APPROVAL without changing the Architecture Review or authority metadata after that confirmation.
- Scope inspection found no ARCH-007 rename implementation before this gate: the changed CLI and lifecycle documentation still use `plugin`, and the server-core route/type/table rename has not begun. Other in-progress work belongs to separate specifications, so this result is FAIL rather than NON-COMPLIANCE.
- Execution-time exceptions in `.agents/rules/authority-delegation.md` remain in force; this result grants no production mutation or external-resource authority. No operated-instance identifiers or private evidence were added.

### [GATE-APPROVAL] — ✅ PASS | 2026-10-24

**Status upgrade:** review-ready → approved

- `authority: confirmation-required` is satisfied by direct owner confirmation after the completed Architecture Review. The owner was shown the narrow question: **"ARCH-007은 사이트 확장 기능의 이름을 Plugin에서 Adapter로 바꾸고, 기존 API 경로·CLI 명령도 호환 별칭 없이 변경하는 제안입니다. 에이전트 배포용 Desk Plugin 이름은 유지합니다. 이 변경까지 진행할까요? 나머지 구현·테스트 작업은 계속 진행 중입니다."** The owner's exact answer was **"이름과 API·CLI를 함께 변경 (권장)"** (2026-10-24), provided through the explicit user-question reply and relayed by the parent agent as trusted human input.
- This new, scope-specific response resolves the missing direct authorization recorded by the preceding FAIL. It approves the reviewed server-core terminology change together with the breaking API/CLI rename and retained Desk Plugin name; it does not depend on the unverified historical sentence in the Decision section or on treating the earlier broad instruction as item-specific approval.
- The Architecture Review remains complete with four checked items, three alternatives with trade-offs, the selected atomic rename, affected L0–L5 scope, and matching TC-01–TC-08 verification plan. The Architecture Review and frontmatter `type`, `tags`, and `authority` are unchanged after this owner confirmation.
- No ARCH-007 rename implementation has begun before this gate. The current lifecycle CLI and documentation retain the existing `plugin` interface; unrelated active-spec changes are not treated as ARCH-007 implementation. No gate was skipped.
- Execution-time exceptions in `.agents/rules/authority-delegation.md` remain in force, including production data mutation and external resource changes. This approval permits scoped implementation and verification, not an unconfirmed production migration. No operated-instance identifiers or private evidence were added.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-10-24

**Status upgrade:** approved → in-progress

- Prerequisite evidence is present: GATE-WRITE PASS and the later, scope-specific GATE-APPROVAL PASS remain recorded, together with the earlier approval FAIL. The current frontmatter is `status: approved`.
- `.agents/tasks/ARCH-007.md` exists and the specification's `## Tasks` section records that exact path. The task record identifies the Adapter terminology scope and retains the Desk Plugin distinction.
- The task plan contains eight unchecked implementation/verification tasks, one for every Completion Criterion: TC-01 domain terminology, TC-02 workspace typecheck, TC-03 workspace tests, TC-04 adapter API and removed old paths, TC-05 CLI rename and pre-network rejection, TC-06 isolated PostgreSQL migration, TC-07 snapshot version enforcement, and TC-08 harness registration. There are no missing TC-01–TC-08 mappings.
- This gate checks implementation readiness only; it does not attest that the rename, tests, migration, or browser verification have occurred. No operated-instance identifiers or private evidence were added.

### [GATE-VERIFY] — ✅ PASS | 2026-10-24

**Status upgrade:** in-progress → verifying

- Prerequisite GATE-WRITE, scope-specific GATE-APPROVAL and GATE-IMPLEMENT PASS entries are present. The earlier GATE-APPROVAL FAIL remains visible and was resolved by the owner's explicit name/API/CLI confirmation, not erased or treated as implicit approval.
- `.agents/tasks/ARCH-007.md` has all eight TC-01–TC-08 implementation/verification tasks checked. Its Blockers section reports none; the remaining independent lifecycle gates are not unfinished implementation tasks.
- Coordinated Node 22.23.4 verification recorded in that task passed `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm build:admin`, and `pnpm test`. The last command executed the package suites and the full harness: 70 files / 418 tests passed. The root build includes the static site and regenerated Desk Plugin bundle; the separate admin build passed as well.
- This guard independently reran `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/adapter-terminology-contract.test.mjs scripts/harness/__tests__/adapter-api-contract.test.mjs scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs scripts/harness/__tests__/adapter-snapshot-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs` with Node 22.23.4: 5 files / 42 tests passed. Assertions cover removed route trees, no-request USAGE for the removed CLI group, real route-handler lifecycle requests, strict adapter snapshot v2, clean migration table names and forward conversion of stored installation IDs.
- This guard independently reran `node scripts/harness/scan-adapter-contract.mjs`: 219 domain files use Adapter with the distinct Desk Plugin allowance. `node scripts/harness/run-all-scans.mjs` exited 0 with all 13 scans passed, including layer/surface/route/spec checks and repository privacy. The negative naming fixture and exact Desk Plugin fixture pass in the regression suite.
- Agent self-verification is recorded in `.agents/tasks/ARCH-007.md`: Chrome with a generated synthetic-owner account at 1440x1200 and 390x844 inspected the renamed management UI. Actual isolated Next HTTP checks returned authenticated browser and automation adapter lists with status 200, while both removed old-name paths and an unknown route returned 404. This is agent-executed fixture verification, not a manual-only request delegated to the owner; no nonexistent committed test-account file is claimed.
- Scope inspection confirms the initial checksum-verified SQL migration remains immutable and the forward migration performs the table, column, constraint and stored payload-key rename. These transition inputs and negative fixtures do not create runtime compatibility aliases. No production migration, deployment or operated-instance evidence is claimed, and no operated publication identifiers or private paths were added to this log.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-10-24

- Verification: `node scripts/harness/scan-adapter-contract.mjs` exited 0 and reported `219 domain files use Adapter; Desk Plugin is distinct`. The independently executed focused Vitest command recorded in GATE-VERIFY passed `adapter-terminology-contract.test.mjs` / `ARCH-007 breaking adapter contract`, including `rejects domain naming while allowing explicit Desk Plugin references` and route-tree removal. Its rejected-spelling fixture returns 1 and permitted Desk Plugin fixture returns 0. Migration and negative-fixture exceptions are explicit, not runtime aliases.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-10-24

- Verification: the coordinated Node 22.23.4 `pnpm typecheck` execution exited 0 for the whole workspace, as recorded in `.agents/tasks/completed/ARCH-007.md` and the preceding GATE-VERIFY. No separate unit-test function is required for a compiler-exit criterion; the actual compiler command is the automated assertion. The matching Test Plan row states this reason explicitly.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-10-24

- Verification: coordinated Node 22.23.4 `pnpm test` exited 0 after the static/Desk Plugin build, recursive package tests and complete harness; the harness reported `70 files / 418 tests` passed. Relevant named suites include `adapter registry contract`, `site adapter API contract` and `CLI-005 adapter lifecycle` in the exact files listed in the Test Plan. This guard's focused rerun also passed 5 files / 42 tests; it is supporting evidence, not a substitute for the full workspace run.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-10-24

- Verification: agent-executed authenticated requests against the actual isolated Next fixture observed `GET /api/v2/sites/example/adapters` and browser `GET /api/adapters` returning 200 with adapter arrays; the corresponding `/api/v2/sites/example/plugins` and `/api/plugins` returned 404. No compatibility routes remain. The automated `adapter-api-contract.test.mjs` / `site adapter API contract` tests and `adapter-terminology-contract.test.mjs` / `removes both old route trees rather than retaining aliases` passed in the independent 5-file / 42-test rerun. Chrome inspection used the generated synthetic-owner account at 1440x1200 and 390x844, recorded in the archived task; no operated instance was used.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-10-24

- Verification: the focused Vitest execution passed `adapter-lifecycle-cli.test.mjs` / `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`, which observes the list call as exactly `GET /api/v2/sites/example/adapters`. `adapter-terminology-contract.test.mjs` / `rejects the removed CLI group before any HTTP request` observes exit 10 and `USAGE` for the bare removed group and removed subcommands, with an empty request log. The real GET/POST handler bridge regression also passes; validation is not inferred from a permissive mock response.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-10-24

- Verification: the independently executed focused Vitest command passed `portable-persistence-integration.test.mjs` / `creates only the adapter table on a clean migration run` and `renames stored installation IDs and columns through a forward migration`. The fresh fixture's `information_schema` query returns only `adapter_installations`; reapplying migrations returns no work. The existing-row fixture is readable through `PostgresAdapterRepository` with `adapterId`, no `pluginId`, and unchanged revision. A direct fixture `SELECT version()` reports PostgreSQL 18.3 (PGlite 0.5.8); these are isolated PostgreSQL-protocol/SQL checks, not a production database migration or a hosted-provider acceptance claim.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-10-24

- Verification: `adapter-terminology-contract.test.mjs` / `accepts only adapter snapshot v2 and rejects old schema and fields` and `adapter-snapshot-contract.test.mjs` / `publishes only enabled public configuration and removes secret references on clone` passed in the independent focused execution. They reject schemaVersion 1 and old/mixed ID fields, accept version 2, and observe a published version-2 adapter projection without secret references. The complete `pnpm test` run also passes `adapter-static-boundary.test.mjs` / `keeps disabled adapter output inert and has no public runtime configuration path`, covering the disabled-state public boundary.

### [GATE-COMPLETE: TC-08] — ✅ PASS | 2026-10-24

- Verification: this guard reran `node scripts/harness/run-all-scans.mjs` with Node 22.23.4 selected for the process and child `node` commands. It exited 0 and reported `13 scans passed`: layer-import, route-shape, environment-access and surface-parity scans report no new violations with zero baseline entries; spec-contract, Adapter-domain, Desk Plugin-bundle and repository-privacy checks pass. `adapter-terminology-contract.test.mjs` provides the new naming scanner's negative and permitted regression fixtures.

### [GATE-COMPLETE] — ✅ PASS | 2026-10-24

**Status upgrade:** verifying → done

- All eight TC-01–TC-08 Completion Criteria are checked and each has a matching concrete GATE-COMPLETE evidence entry. Every Test Plan row now identifies exact test files/functions or explicitly explains why the command's exit status is the automated criterion without an additional unit-test function.
- `.agents/tasks/completed/ARCH-007.md` exists with all eight tasks checked, and `## Tasks` points to that archived path. The spec remains `status: verifying` for the orchestrator to perform the subsequent status/move; this guard changed only Test Plan alignment and Evidence Log entries.
- The recorded approval FAIL followed by explicit owner confirmation and approval PASS remains intact. Build/test/typecheck/lint, all 13 scans, actual isolated HTTP behavior, synthetic-owner desktop/mobile inspection and independent defect fixes are recorded. Completion covers the program's breaking Adapter rename only; it does not claim production migration, deployment, completion of ARCH-008, or any operated-instance action.
