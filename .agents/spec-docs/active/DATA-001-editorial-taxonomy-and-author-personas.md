---
status: in-progress
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

- [ ] TC-01: A repository migration creates separate site-scoped category and
      tag records; a post persists one-or-more valid categories and zero-or-more
      valid tags, rejects inactive/cross-site/unknown slugs, and keeps public
      static output free of database access.
- [ ] TC-02: The human admin manages categories, tags, and an author's
      `editorialPersona` independently; a post editor presents labelled,
      keyboard-operable category and tag controls and displays only the
      selected author's private context to authenticated operators.
- [ ] TC-03: Versioned automation endpoints and `@publisher/admin-client`
      expose symmetric list/create/update/archive operations for categories,
      tags, and authors; post create/update accepts explicit category/tag
      slugs and returns stable invalid, conflict, and authorization diagnostics.
- [ ] TC-04: `publisher` CLI taxonomy/author commands and post mutation
      planning retrieve the selected author's current persona before mutation,
      return a documented machine-readable `authorContext` envelope, and never
      reveal a token or persona in public static output.
- [ ] TC-05: Idempotent bootstrap gives `xrtechnews.com` and
      `aitrendtimes.com` the named first-level categories without deleting or
      overwriting operator-managed taxonomy, existing posts, media, or authors.
- [ ] TC-06: A static publication fixture with categories, tags, and an author
      persona builds successfully; article/category output contains only
      intended public category/tag metadata, while private persona text is
      absent from HTML, RSS, snapshot export, and archive output.
- [ ] TC-07: Focused contract tests, `pnpm typecheck`, `pnpm test`,
      `pnpm build`, and `pnpm harness:scan` pass; authenticated admin browser
      verification at desktop and <=390px records category/tag selection,
      persona visibility, keyboard focus, no horizontal overflow, and no
      console errors.

## Test Plan

| TC-ID | Test Type              | Tool / Approach                                                                      | Notes                                                                                                                                                             |
| ----- | ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | persistence + contract | PGlite/file repository fixtures and publication contracts                            | Preconditions: two sites, active/inactive taxonomy, and posts; assert validation, site isolation, and static-only reader boundary.                                |
| TC-02 | browser + UI contract  | Local authenticated admin at desktop and 390px-or-narrower                           | Preconditions: an editor account, two authors, categories, tags, and private personas; check labels, keyboard selection, context visibility, and public omission. |
| TC-03 | API/client integration | Injected authenticated route and `@publisher/admin-client` tests                     | Preconditions: member and non-member identities; assert CRUD, revision, error envelopes, and post payload category/tag behavior.                                  |
| TC-04 | CLI/client contract    | Local HTTP fixture and `publisher` JSON commands                                     | Preconditions: selected author with a persona; observe context retrieval before create/update and absence of credential leakage.                                  |
| TC-05 | migration/bootstrap    | Repeated repository bootstrap fixture                                                | Preconditions: both target site IDs plus pre-existing records; assert named categories appear once and unrelated records retain identity.                         |
| TC-06 | static/export contract | `pnpm --filter @publisher/site build` plus archive/snapshot assertions               | Preconditions: fixture with populated taxonomy/persona; verify intended public metadata and private-field omission.                                               |
| TC-07 | regression + browser   | `pnpm typecheck && pnpm test && pnpm build && pnpm harness:scan`; local admin Chrome | Preconditions: completed focused fixtures and test account; no production credentials, public writes, or provider dependency are required.                        |

## Tasks

- [ ] `.agents/tasks/DATA-001.md` — implementation record

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
