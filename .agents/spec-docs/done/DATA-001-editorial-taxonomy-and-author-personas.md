---
status: done
type: DATA
tags: [web, cli, rest, typescript, auth]
authority: delegated
---

# DATA-001: Editorial Taxonomy and Author Personas

## Problem

The admin currently calls its single existing taxonomy list “Tags,” while a
post stores that selection in `categories`; there is no separate article-tag
contract. As a result, an operator of either `xrtechnews.com` or
`aitrendtimes.com` cannot establish a useful first-level section hierarchy and
then add granular article tags during authoring. The current author profile
contains public display fields only, so an LLM using the CLI/API cannot
automatically obtain the assigned reporter's stored editorial persona before it
drafts or updates an article.

The issue is reproducible when an editor creates a story: the editor can only
tick the overloaded “Tags” control, cannot associate a separate set of
searchable tags, and an automation client receives no reporter-specific
writing context for the selected `authorSlug`.

## Architecture Review

### Affected Scope

- `packages/content`: explicit `categories` and `tags` post contracts;
  deterministic snapshot/publication input that keeps section routes based on
  categories and emits article tags as metadata without changing static reader
  dependencies.
- `packages/persistence`: site-scoped category and tag records plus a private
  bounded `editorialPersona` field on the author record; existing test-only
  taxonomy data is migrated into categories because the product has no legacy
  compatibility requirement.
- `apps/admin`: accessible multi-site management controls for categories,
  tags, and author persona; post editing controls that select at least one
  category and zero or more tags; an author-context preview generated from the
  server record.
- `apps/admin/app/api/v2/sites/[siteId]`: symmetric automation CRUD/list
  routes and post mutation responses that obtain the selected author's current
  persona as agent context. Existing agent-guidance remains site-wide and is
  not duplicated.
- `packages/admin-client` and `packages/ops-cli`: typed category/tag/author
  operations and article create/update planning output that includes selected
  author context without requiring browser automation.
- Site configuration/bootstrap records: initial active categories for both
  production publications, created idempotently without overwriting articles,
  authors, or operator-managed taxonomy.

Sibling scan completed: current `TagProfile` is selected through
`AdminPost.categories`, category routes derive from that field, and author
management already owns the public bio/avatar record. `ADMIN-002` separately
owns site-wide agent guidance; author personas must be per-author and private
to avoid leaking prompts into static profiles. New versioned routes use
`categories`, `tags`, and author update payloads under the existing site
namespace, so they do not shadow existing `settings`, `media`,
`agent-guidance`, or X-embed routes.

### Alternatives Considered

1. Keep one taxonomy and relabel it in the UI. Pro: smallest migration.
   Con: cannot represent a stable section hierarchy and article-level tags at
   the same time; automation payloads remain ambiguous.
2. Put tags and persona only in free-form article HTML or local LLM prompts.
   Pro: no schema work. Con: impossible to validate, query, manage per site,
   or consistently retrieve from the human UI and CLI/API.
3. Create separate categories and tags plus a private server-stored author
   persona. Pro: clear semantics, multi-site isolation, static-safe output,
   and a symmetric source of truth for people and agents. Con: adds migration,
   management UI, and API/client surface.
4. Store personas in an LLM-provider integration. Pro: provider-native prompt
   tools. Con: violates portable agent operation and makes the human UI/CLI
   incomplete.

### Decision

Choose option 3. Categories are a required, bounded primary-section list (one
or more per article) and own static section/archive discovery. Tags are a
separate optional, bounded, normalized list for granular article discovery and
metadata. A reporter's private `editorialPersona` is an operator-managed text
record retrieved by the server whenever that reporter is selected for an
authoring mutation; it supplements, but never overrides, site-wide guidance,
authorization, validation, or editorial review. This costs a small portable
data/API addition in exchange for unambiguous taxonomy and provider-neutral
agent context.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing overloaded taxonomy, static category routes,
      author management, and separate site-wide guidance ownership inspected
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Introduce explicit per-site category and tag collections. Categories have
   normalized slug, display name, active state, and stable ordering; tags have
   normalized slug, display name, and active state. A post must reference one
   or more active categories and may reference zero or more active tags. The
   static site exposes category routes from categories and presents tag links
   and tag metadata from tags, with no database request at reader time.
2. Add `editorialPersona` to the private managed author record. It is bounded
   plain text, revision-safe, omitted from public author pages, archive/static
   snapshots, RSS, and media metadata. The server produces a selected-author
   context envelope for human and agent authoring; it is advisory input only.
3. Make admin management fully multi-site: create/rename/archive categories
   and tags separately; edit each author's display profile and persona; select
   categories and tags from labelled keyboard-operable controls in post editor.
   The authoring screen displays the selected author's current persona without
   exposing it on the public site.
4. Make CLI/API feature-complete with the UI. Automation can list and manage
   categories/tags/authors and creates or updates a post with category/tag
   slugs. Before an article mutation, the client retrieves the selected
   author's persona and includes a redaction-safe `authorContext` planning
   envelope. No browser session or provider-specific integration is required.
5. Bootstrap, idempotently and only when absent, these first-level categories:
   `xrtechnews.com`: XR/AR/VR, AI, Hardware, Gaming, Industry; and
   `aitrendtimes.com`: Models, Research, Products, Industry, Policy. Existing
   article records are not deleted or overwritten; an unclassified existing
   article receives the site's General category during the additive migration.

## Affected Files

- `packages/content/src/types.ts`, editor validation, snapshots, archive
  contract, static adapters, and category/tag rendering inputs
- `packages/persistence/migrations/admin/*`, repository contracts, fixture
  reconciliation, and bootstrap data
- `apps/admin/app/admin-model.ts`, `PostEditor.tsx`, `ManagementPanel.tsx`,
  dashboard actions/state, author/category/tag routes, and automation routes
- `packages/admin-client/src/client.js`, `index.d.ts`, and tests
- `packages/ops-cli/bin/publisher.mjs`, command documentation, and tests
- `scripts/harness/__tests__/*taxonomy*`, editorial publication and archive
  contracts, plus new persona/context regression tests
- `docs/agent-operations.md`, `docs/admin-api.md`, and editorial workflow
  documentation

## Completion Criteria

- [x] TC-01: A repository migration creates separate site-scoped category and
      tag records; a post persists one-or-more valid categories and zero-or-more
      valid tags, rejects inactive/cross-site/unknown slugs, and keeps public
      static output free of database access.
- [x] TC-02: The human admin manages categories, tags, and an author's
      `editorialPersona` independently; a post editor presents labelled,
      keyboard-operable category and tag controls and displays only the
      selected author's private context to authenticated operators.
- [x] TC-03: Versioned automation endpoints and `@publisher/admin-client`
      expose symmetric list/create/update/archive operations for categories,
      tags, and authors; post create/update accepts explicit category/tag
      slugs and returns stable invalid, conflict, and authorization diagnostics.
- [x] TC-04: `publisher` CLI taxonomy/author commands and post mutation
      planning retrieve the selected author's current persona before mutation,
      return a documented machine-readable `authorContext` envelope, and never
      reveal a token or persona in public static output.
- [x] TC-05: Idempotent bootstrap gives `xrtechnews.com` and
      `aitrendtimes.com` the named first-level categories without deleting or
      overwriting operator-managed taxonomy, existing posts, media, or authors.
- [x] TC-06: A static publication fixture with categories, tags, and an author
      persona builds successfully; article/category output contains only
      intended public category/tag metadata, while private persona text is
      absent from HTML, RSS, snapshot export, and archive output.
- [x] TC-07: Focused contract tests, `pnpm typecheck`, `pnpm test`,
      `pnpm build`, and `pnpm harness:scan` pass; authenticated admin browser
      verification at desktop and <=390px records category/tag selection,
      persona visibility, keyboard focus, no horizontal overflow, and no
      console errors.

## Test Plan

| TC-ID | Test Type              | Tool / Approach                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | persistence + contract | PGlite/file repository fixtures and publication contracts                            | `editorial-persona-contract.test.mjs` describe `DATA-001 editorial taxonomy and private author persona`, both test cases; validates separate collections, post assignment, and static snapshot isolation.                                                                                                                                                                                                |
| TC-02 | browser + UI contract  | Local authenticated admin at desktop and 390px-or-narrower                           | No repository browser-test runner exists because UI verification is performed with the required interactive CUA Chrome surface; the agent-run `data002-browser@example.test` action at desktop and 390x844 recorded labels, native checkboxes, selected persona, focus, and overflow.                                                                                                                    |
| TC-03 | API/client integration | Injected authenticated route and `@publisher/admin-client` tests                     | `admin-taxonomy-contract.test.mjs` describe `admin taxonomy contract`, `supports authenticated create, rename, archive, and revision conflicts`; `admin-automation-contract.test.mjs` describe `admin automation API contract`.                                                                                                                                                                          |
| TC-04 | CLI/client contract    | Local HTTP fixture and `publisher` JSON commands                                     | `agent-operations-cli-contract.test.mjs` test `retrieves the selected author persona before planning a Markdown post`; it asserts the private machine-readable `authorContext` and token redaction.                                                                                                                                                                                                      |
| TC-05 | migration/bootstrap    | Repeated repository bootstrap fixture                                                | `admin-taxonomy-contract.test.mjs` test `seeds terms and preserves post assignments in a publish snapshot`; persistence fixture bootstrap is idempotent.                                                                                                                                                                                                                                                 |
| TC-06 | static/export contract | `pnpm --filter @publisher/site build` plus archive/snapshot assertions               | `editorial-persona-contract.test.mjs` test `keeps categories, tags, and private personas separate in a public snapshot`; site build exits 0.                                                                                                                                                                                                                                                             |
| TC-07 | regression + browser   | `pnpm typecheck && pnpm test && pnpm build && pnpm harness:scan`; local admin Chrome | `admin-taxonomy-contract.test.mjs` describe `admin taxonomy contract`; `editorial-persona-contract.test.mjs` describe `DATA-001 editorial taxonomy and private author persona`; and `agent-operations-cli-contract.test.mjs` describe `agent operations CLI contract` all passed. No repository browser runner exists, so the required CUA Chrome action is the explicit browser-verification mechanism. |

## Tasks

- [x] `.agents/tasks/completed/DATA-001.md` — completed implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready

- Frontmatter begins with YAML and declares `status: draft`, valid `type: DATA`, and non-empty `tags`.
- Problem states the overloaded taxonomy/absent persona behavior and reproduces it during article creation for either production site; it contains no TBD/TODO placeholder.
- Architecture Review names affected layers, records a completed sibling scan, evaluates four alternatives with pro/con trade-offs, and selects option 3 with its portability/complexity trade-off.
- Architecture Review Checklist contains all four completed `[x]` items, including sibling-scan evidence.
- Completion Criteria contains seven observable TC-prefixed criteria (TC-01 through TC-07), covering persistence, human admin, API/client, CLI, bootstrap, static output, and regression/browser verification.
- Test Plan has one non-empty strategy row for each of TC-01 through TC-07; every row names a test type, tool/approach, and preconditions/assertions, with no manual-only or TBD entry.
- Tasks placeholder exists and Evidence Log was empty before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved

- The owner granted standing delegated authority in the current conversation: “승인함. 앞으로는 중요한 방향을 바꾸는 이슈에 대해 나에게 물어보고 나머지는 타당한 근거와 함께 추천안을 제안하면 타당할 경우 자동 승인하겠습니다.”
- This specification declares `authority: delegated`; its completed Architecture Review records affected scope, sibling-scan evidence, alternatives with trade-offs, the selected portable data-contract decision, and the TC-mapped test plan. The requested taxonomy/persona management work is an ordinary implementation decision, not a provider, cost-model, or architecture-boundary selection.
- The GATE-WRITE record precedes this check. Inspection of the working tree and scoped history found this new DATA-001 specification but no DATA-001 task record, implementation edit, or implementation commit; existing site-scoped tag APIs predate this specification and are explicitly part of the overloaded contract being replaced rather than evidence of a bypass.
- The Architecture Review and frontmatter `type`, `tags`, and `authority` remain unchanged after the GATE-WRITE record. Execution-time confirmation remains required for any listed irreversible external mutation under `.agents/rules/authority-delegation.md`.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress

- Task record exists at `.agents/tasks/DATA-001.md`, and the spec's `## Tasks` section points to that exact path.
- The task record has one explicitly mapped implementation task for every Completion Criterion: TC-01 persistence/static contracts, TC-02 human admin controls, TC-03 API/client, TC-04 CLI/context, TC-05 bootstrap, TC-06 private-output omission, and TC-07 regression/browser verification.
- The task record is scoped to the same packages named in the specification and lists no blocked or unowned work.

### [GATE-VERIFY] — ✅ PASS | 2026-09-15

**Status upgrade:** in-progress → verifying

- `.agents/tasks/DATA-001.md` marks TC-01 through TC-07 complete and its `## Blockers` section reports `None`.
- `pnpm --filter @publisher/site build` exited 0: the static build rendered 22 routes, normalized 21 static HTML files, and generated public metadata for 8 posts.
- `pnpm --filter @publisher/site test` exited 0.
- Focused DATA-001 verification `pnpm vitest run scripts/harness/__tests__/admin-taxonomy-contract.test.mjs scripts/harness/__tests__/editorial-persona-contract.test.mjs` exited 0 with 2 test files and 5 tests passing; it covers taxonomy mutation/context and private-persona publication omission.
- Although this is a `DATA` specification (so the SCREEN/FLOW/BEHAVIOR/API-specific browser gate is not the trigger), the task independently records agent-run local authenticated Chrome verification with the labelled `data002-browser@example.test` fixture owner at desktop and iPhone 12 Pro emulation (390x844): required category and optional tag controls, authenticated-only selected-author persona, keyboard-reachable sign-out, zero overflow, and an empty console after reload. No production data was touched.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
**Failed criteria:**

- Per-TC completion evidence: TC-01 through TC-07 are checked, but no matching `[GATE-COMPLETE: TC-N]` Evidence Log entries exist with the exact command/action and observed result required for each completion criterion.
  **Required action:** Add one exact-result `[GATE-COMPLETE: TC-01]` through `[GATE-COMPLETE: TC-07]` entry before rerunning this gate.
- Test Plan traceability: each TC row names only a broad test approach/precondition; none records a test file plus test function/`describe` name, nor an explicit reason that automation was skipped.
  **Required action:** Update every TC-01 through TC-07 Test Plan row with its precise test reference (or an explicit automation-skip rationale) before rerunning this gate.

### [GATE-COMPLETE: TC-01] | 2026-09-15

`pnpm vitest run scripts/harness/__tests__/editorial-persona-contract.test.mjs` passed both tests: site-scoped categories/tags persisted separately and an invalid cross-collection tag was rejected; the published snapshot omitted the private persona sentinel.

### [GATE-COMPLETE: TC-02] | 2026-09-15

Authenticated local Chrome action as `data002-browser@example.test` exposed separate labelled category/tag checkbox groups, the selected author's private persona, and author/category/tag management controls. At iPhone 12 Pro 390x844 the observed result was `scrollWidth=390`, `clientWidth=390`, `overflow=false`.

### [GATE-COMPLETE: TC-03] | 2026-09-15

`pnpm vitest run scripts/harness/__tests__/admin-taxonomy-contract.test.mjs scripts/harness/__tests__/admin-automation-contract.test.mjs` passed; the former observed authenticated create/rename/archive and revision conflict behavior plus the returned selected-author context.

### [GATE-COMPLETE: TC-04] | 2026-09-15

`pnpm vitest run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` passed 8 tests, including `retrieves the selected author persona before planning a Markdown post`; the observed `POST_PLAN` payload included the selected private `authorContext` and omitted `test-token`.

### [GATE-COMPLETE: TC-05] | 2026-09-15

`admin-taxonomy-contract.test.mjs` test `seeds terms and preserves post assignments in a publish snapshot` passed, observing seeded terms and preserved assigned posts in the generated snapshot.

### [GATE-COMPLETE: TC-06] | 2026-09-15

`pnpm --filter @publisher/site build` exited 0 and generated 22 static routes; `editorial-persona-contract.test.mjs` observed public category/tag output while `PRIVATE PERSONA SENTINEL` was absent from the serialized snapshot.

### [GATE-COMPLETE: TC-07] | 2026-09-15

`pnpm typecheck`, `pnpm test` (40 files / 191 tests), `pnpm build`, and `pnpm harness:scan` (six scans) exited 0. Chrome DevTools then showed an empty console after reload and no horizontal overflow at 390px.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
**Failed criteria:**

- TC-02 Test Plan traceability: the row records a browser action but neither a test file plus function/`describe` name nor an explicit reason that browser automation was not written.
  **Required action:** Add a precise browser-test reference, or state the intrinsic automation limitation and why the recorded agent-run Chrome action is the required substitute.
- TC-04 Test Plan traceability: `agent-operations-cli-contract.test.mjs` exists and passes, but its listed cases cover archive/configuration/authority/restore/operation/device-flow behavior; it contains no selected-author persona or `authorContext` assertion. The cited test therefore does not evidence the TC-04 author-context requirement.
  **Required action:** Reference the exact CLI/client author-context test (with its function/`describe`), or add and run that focused test before rerunning this gate.
- TC-07 Test Plan traceability: root command results and the browser observation are recorded, but the row gives neither a precise test file plus function/`describe` reference for the regression coverage nor an explicit automation-skip rationale for the browser portion.
  **Required action:** Name the focused regression test references and provide the browser-automation rationale before rerunning this gate.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
**Failed criteria:**

- TC-07 Test Plan traceability: the row now gives three test files and an explicit CUA browser-runner rationale, but it still does not name a test function or `describe` in any of those files. The completion gate requires a test file **and** function/`describe` name for each test-written TC.
  **Required action:** Add the exact `describe` or test function names for the TC-07 focused regression references, then rerun this gate.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-15

**Status upgrade:** verifying → done

- TC-01 is checked and its `[GATE-COMPLETE: TC-01]` entry records the exact Vitest command, both passing taxonomy/persona tests, and the observed private-persona omission; the Test Plan names the matching file and `DATA-001 editorial taxonomy and private author persona` describe.
- TC-02 is checked and its matching entry records the authenticated CUA Chrome action and actual 390px overflow result; the Test Plan explicitly documents why the interactive CUA surface is the browser-verification mechanism instead of a repository browser runner.
- TC-03 is checked and its matching entry records the exact API/client Vitest command and observed CRUD, revision-conflict, and selected-author-context behavior; the Test Plan names both matching files and describes.
- TC-04 is checked and its matching entry records the exact CLI Vitest command, 8 passing tests, `POST_PLAN.authorContext`, and token redaction; the Test Plan names `retrieves the selected author persona before planning a Markdown post`, which was confirmed present and passing.
- TC-05 is checked and its matching entry records the named bootstrap test and observed preservation of assigned posts; the Test Plan names that exact test.
- TC-06 is checked and its matching entry records the static build result and persona-sentinel omission; the Test Plan names the exact snapshot-omission test.
- TC-07 is checked and its matching entry records successful root typecheck/test/build/harness commands plus the browser console/overflow result; the Test Plan names all three focused test-file describes and the explicit CUA browser-runner rationale.
- All seven Completion Criteria are checked, all seven Test Plan rows now contain a test reference or documented browser-runner rationale, and `.agents/tasks/completed/DATA-001.md` exists with no unchecked task.
