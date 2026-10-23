---
status: done
type: AGREEMENT
tags: [web, cli, rest, typescript, auth]
authority: delegated
---

# ADMIN-002: Per-Publication Agent Guidance

## Problem

An operator can configure a publication's public identity and use either the
human admin interface or the agent CLI/API to manage content, but cannot store
the publication-specific editorial constraints that an LLM agent must receive
before it creates, updates, or publishes content. For example, Second Example
needs the explicit instruction that an article must not be published without a
representative image. Today an agent invoking the CLI/API has no supported,
site-scoped source for that instruction and can accidentally treat a generic
platform capability as permission to publish an image-less article.

## Architecture Review

### Affected Scope

- `packages/persistence`: a private, site-scoped agent-guidance record with a
  bounded instruction body, revision, timestamps, and site foreign key; it is
  deliberately outside the public content snapshot and static export.
- `apps/admin`: one authenticated human settings panel and equivalent browser
  read/update route; server-owned authorization, optimistic revision checks,
  audit events, and response serialization.
- `apps/admin/app/api/v2/sites/[siteId]`: versioned automation read/update
  routes that return an explicit agent-context envelope for a selected site.
- `packages/admin-client` and `packages/ops-cli`: typed client methods and
  non-interactive JSON CLI commands for retrieving and changing the same
  guidance without browser automation.
- `docs/agent-operations.md`, admin API documentation, and contract/browser
  tests. Public site packages and publication snapshots are excluded.

Sibling scan completed: `PublicationSettingsPanel` and `/api/settings` expose
only public publication settings; `ManagedPublicationSettings` is serialized
into the public snapshot, so adding private agent instructions there would
leak them to the static site. `packages/admin-client` already owns site-scoped
settings calls, while `packages/ops-cli` is the official non-browser agent
surface. No existing guidance route, persistence field, or CLI command exists.
The new route uses the distinct `agent-guidance` path segment and cannot shadow
existing `settings`, `posts`, `media`, or `publish` routes.

### Alternatives Considered

1. Put instructions in public publication settings. Pro: no new table or
   route. Con: every static snapshot would disclose private operating guidance
   and revisions would be coupled to public rendering.
2. Require every LLM caller to supply a free-form prompt on each operation.
   Pro: no persisted state. Con: rules drift across agents, cannot be audited,
   and a CLI client cannot reliably discover the site's current policy.
3. Store an opaque provider-specific prompt in an LLM integration. Pro: can
   use a provider's native format. Con: adds an LLM provider dependency and
   makes the guidance unavailable to the project's CLI/API clients.
4. Store a private, versioned per-site guidance document and expose the same
   read/write capability through the human UI and agent CLI/API. Pro: portable,
   auditable, multi-site safe, and available to any LLM integration. Con: adds
   a small private persistence/API surface and requires callers to use the
   returned context before mutating content.

### Decision

Choose alternative 4. The system will store one bounded, plain-text editorial
guidance document per publication, separately from public settings and
snapshots. The admin UI and CLI/API will each be capable of listing, reading,
editing, and revision-checking it. The automation response will label it as
operator-provided `agentContext` and include a stable version; it is contextual
input for an LLM, not executable instructions, credentials, or a bypass of
server-side validation and authorization. A first rule for Second Example can
state that publication requires a representative image. Automated content
creation/publish flows will fetch and surface this context, while durable
server policy validation remains a future explicit rule only if separately
specified.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — public snapshot boundary, settings UI/API, and CLI
      client routes inspected; collision-free route namespace recorded
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Add a migration and persistence contract for private site guidance:
   `site_id`, normalized nonempty-or-empty bounded text, `revision`, and
   timestamps. It must never be included in `PublicationSettings`, content
   archive exports, static JSON, RSS, HTML, or media metadata.
2. Add authenticated browser and `/api/v2/sites/{siteId}/agent-guidance`
   read/update operations with the existing publisher/site authorization and
   optimistic concurrency behavior. Responses expose only the selected site's
   `agentContext`, revision, and safe metadata; writes produce an audit event.
3. Add an accessible multi-site admin panel with an explicit save action,
   revision-conflict recovery, empty-state explanation, and a copyable
   machine-facing context preview. It must be fully usable without the CLI.
4. Add typed `getAgentGuidance` and `updateAgentGuidance` client methods plus
   non-interactive `publisher site guidance get|set` commands with redacted,
   documented JSON envelopes. They must be fully usable without the browser.
5. Ensure each agent-facing content mutation command obtains and displays the
   selected site's current guidance before executing. The API still enforces
   authorization, validation, revision, and publication rules independently of
   LLM compliance with natural-language guidance.

## Affected Files

- `packages/persistence/migrations/admin/0005_site_agent_guidance.sql` (new)
- `packages/persistence/src/*` (site-guidance query contract, if owned there)
- `apps/admin/app/lib/*guidance*` (new server service and validation)
- `apps/admin/app/api/agent-guidance/route.ts` (new browser route)
- `apps/admin/app/api/v2/sites/[siteId]/agent-guidance/route.ts` (new)
- `apps/admin/app/AgentGuidancePanel.tsx` (new)
- `apps/admin/app/AdminDashboardView.tsx`, `admin-actions.ts`,
  `admin-model.ts`, and `useAdminDashboard.ts`
- `packages/admin-client/src/client.js`, `index.d.ts`, and tests
- `packages/ops-cli/bin/publisher.mjs` and tests
- `docs/agent-operations.md`, `docs/admin-api.md`, and focused harness/browser
  tests

## Completion Criteria

- [x] TC-01: A migrated repository can create, read, and revision-update one
      private agent-guidance record per site; cross-site reads/writes are
      denied and the record is absent from public snapshots, static exports,
      archive exports, RSS, and article HTML.
- [x] TC-02: `GET` and revision-checked `PATCH`
      `/api/v2/sites/{siteId}/agent-guidance` return a selected-site
      `agentContext` envelope only to an authorized automation identity, emit
      stable denial/conflict errors, and audit successful writes without
      recording credentials.
- [x] TC-03: The authenticated human admin can select a publication, view,
      edit, clear, save, and recover from a revision conflict for its guidance
      using labelled keyboard-operable controls at desktop and mobile widths.
- [x] TC-04: `publisher site guidance get --site <id> --json` and
      `publisher site guidance set --site <id> --file <path> --revision <n>
--json` use `@publisher/admin-client`, return documented machine-readable
      envelopes, and never require browser automation or expose a bearer token.
- [x] TC-05: Agent-facing CLI content mutation commands fetch the selected
      site's current guidance before their mutation request and expose its
      revision/context in their local planning output; server authorization and
      validation remain mandatory even when the guidance is empty or ignored.
- [x] TC-06: Contract, persistence, CLI, admin browser, typecheck, test,
      build, lint, and harness verification pass with local fixtures and no
      live provider credential; fixture coverage includes the Second Example
      instruction requiring a representative image before publication.

## Test Plan

| TC-ID | Test Type                     | Tool / Approach                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | persistence + export contract | PostgreSQL/PGlite fixture and static publication fixture                         | `scripts/harness/__tests__/agent-guidance-contract.test.mjs`, describe `ADMIN-002 private guidance persistence and authenticated API`, test `revision-updates only its selected site and rejects stale, oversized, or invalid input`: real migrations, two sites, stale-write rejection, archive projection, and actual article/feed artifact omission.                                                                                                                                                                                    |
| TC-02 | API integration               | Injected authenticated admin route requests                                      | `scripts/harness/__tests__/agent-guidance-contract.test.mjs`, describe `ADMIN-002 private guidance persistence and authenticated API`, test `enforces identity/site/revision boundaries and audits safe metadata only`: unauthorized and cross-site denial, 428 missing revision, 409 stale revision, safe audit output.                                                                                                                                                                                                                   |
| TC-03 | browser + editor regression   | Local authenticated admin smoke at 1440x1200 and 390x844                         | Agent-operated synthetic-owner Chrome actions from `scripts/harness/admin-browser-fixture.mjs`, recorded in `.agents/tasks/completed/ADMIN-002.md`: select/read/edit/clear/save/copy, conflict preservation, explicit reapply/save or reload, keyboard focus, no overflow. Automated regressions: `scripts/harness/__tests__/agent-guidance-editor.test.mjs`, describe `ADMIN-002 human guidance editor`; `scripts/harness/__tests__/admin-site-tab-isolation.test.mjs`, describe `INFRA-005 browser publication selection is tab scoped`. |
| TC-04 | CLI/client contract           | Local HTTP fixture and temporary local guidance file                             | `scripts/harness/__tests__/agent-guidance-cli.test.mjs`, describe `ADMIN-002 agent guidance CLI preflight`, test `gets and revision-updates a private selected-site context`: actual CLI subprocess through the shared client, exact GET/PATCH routes, JSON context, quoted revision header, token omission.                                                                                                                                                                                                                               |
| TC-05 | CLI behavior contract         | Local HTTP fixture for content mutations                                         | `scripts/harness/__tests__/agent-guidance-cli.test.mjs`, describe `ADMIN-002 agent guidance CLI preflight`, parameterized tests `fetches current guidance before post %s and includes its revision`, `fails closed on a malformed successful guidance response`, and `preflights %s before mutation and stops on guidance failure`; image-required instructions come from `scripts/harness/__tests__/cli-fixture.mjs`. Server authorization is independently exercised by the TC-02 API test.                                              |
| TC-06 | regression                    | `pnpm typecheck && pnpm test && pnpm build && pnpm -r lint && pnpm harness:scan` | All named TC-01 through TC-05 suites are implemented. Node 22.23.4 workspace verification passed all package suites plus 70 harness files / 418 tests; static/Desk Plugin and admin builds, typecheck, lint, and all 13 scans passed. Local generic fixtures require no live provider credential.                                                                                                                                                                                                                                          |

## Tasks

- [x] `.agents/tasks/completed/ADMIN-002.md` — implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter begins with YAML and declares `status: draft`, `type: AGREEMENT`, populated `tags`, and `authority: delegated`.
Problem identifies the missing site-scoped agent instruction source, the CLI/API mutation context in which it occurs, and the resulting image-less publication risk without placeholder language.
Architecture Review contains four checked checklist items, completed sibling-scan evidence, four alternatives with pro/con trade-offs, and a Decision that selects and explains the private versioned-guidance trade-off.
Completion Criteria define TC-01 through TC-06 in observable or command form; each affected capability has coverage and avoids prohibited vague completion wording.
Test Plan has one nonempty, non-manual test strategy row with substantive notes for each of TC-01 through TC-06; the criteria and test-plan counts both equal six.
Tasks placeholder and initially empty Evidence Log structure were present before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved
Delegated authority is declared by frontmatter (`authority: delegated`) and the standing delegation in `.agents/rules/authority-delegation.md` permits ordinary implementation after the completed Architecture Review.
The Architecture Review records affected boundaries, a completed sibling scan, four alternatives with trade-offs, the selected private per-site guidance decision, and a six-criterion verification plan.
`git status --short`, scoped `git log`, and `rg` found only this unimplemented backlog spec and no ADMIN-002 implementation file, task, commit, or pre-existing `agent-guidance` surface; no implementation has bypassed this approval gate.
Execution-time exceptions remain in force: any production DNS, billing, production-data mutation, external communication, account lifecycle, secret disclosure, or new external runtime/proxy/queue/cache/managed-service final action requires narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress
Implementation record exists at `.agents/tasks/ADMIN-002.md`, and the spec's `## Tasks` section records that exact path.
The task record contains one planned task for each completion criterion: TC-01 persistence/export isolation, TC-02 authorized revision-checked API/audit behavior, TC-03 accessible human admin UI, TC-04 typed client and non-interactive CLI operations, TC-05 guidance retrieval before agent content mutations, and TC-06 regression verification.

### [GATE-VERIFY] — ✅ PASS | 2026-10-24

**Status upgrade:** in-progress → verifying
The implementation record at `.agents/tasks/ADMIN-002.md` marks all six TC-01 through TC-06 tasks `[x]`, records the final verification results, and declares no remaining blockers. Its earlier browser-pending progress entry is resolved by the subsequent completed Chrome verification entry.
The caller's supported Node 22.23.4 workspace verification and the task record report successful `pnpm test` (all package suites and 70 harness files / 418 tests), `pnpm typecheck`, `pnpm build:admin`, `pnpm -r lint`, and `pnpm harness:scan` (13 scans). The `pnpm test` command first runs `pnpm build`, which builds the static site and Desk Plugin before package and harness tests; these are local program checks, not deployment evidence.
The guard independently reran `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/agent-guidance-contract.test.mjs scripts/harness/__tests__/agent-guidance-editor.test.mjs scripts/harness/__tests__/agent-guidance-cli.test.mjs scripts/harness/__tests__/admin-site-tab-isolation.test.mjs` on Node 22.23.4: four files and 20 tests passed. These execute real migrated PGlite persistence and authenticated API requests, static article/feed privacy projection, stale-revision rejection, preserved editor drafts, CLI guidance preflight, and per-tab publication selection.
The task's final Chrome evidence identifies the synthetic local owner from `scripts/harness/admin-browser-fixture.mjs` and both required viewports, 1440x1200 and 390x844. The agent directly verified login, labelled read/edit/save/copy controls, two-editor conflict and draft preservation, explicit reapply/save or reload, empty guidance, keyboard focus, cross-publication tab isolation, and matching document/scroll widths. This was an agent-operated isolated fixture, not a manual-only login deferral or an operated account; no production acceptance is claimed.
The guard inspected the guidance repository's site-and-revision-constrained update, selected-site authenticated route and safe audit metadata, bounded fail-closed CLI context validation, and explicit UI conflict controls. The Evidence Log contains no operated-publication identity, production host or deployment identifier, or production screenshot path.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-10-24

**Verification:** The guard reran `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/agent-guidance-contract.test.mjs scripts/harness/__tests__/agent-guidance-editor.test.mjs scripts/harness/__tests__/agent-guidance-cli.test.mjs scripts/harness/__tests__/admin-site-tab-isolation.test.mjs` on Node 22.23.4; all four files and 20 tests passed. In `agent-guidance-contract.test.mjs`, `revision-updates only its selected site and rejects stale, oversized, or invalid input` applied the actual admin migrations, read blank per-site records, updated only one site, rejected a stale revision, and built actual article/feed artifacts. The private sentinel was absent from the public snapshot, normalized archive, and every emitted static artifact. The same suite's authenticated API test denied cross-site reads and writes.
**Test reference:** `scripts/harness/__tests__/agent-guidance-contract.test.mjs`, describe `ADMIN-002 private guidance persistence and authenticated API`, both named tests in the TC-01 and TC-02 Test Plan rows.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-10-24

**Verification:** In the successful four-suite guard command recorded for TC-01, the action `enforces identity/site/revision boundaries and audits safe metadata only` invoked the real versioned GET/PATCH handlers against the migrated local repository. Observed statuses were 401 without authentication, 403 for another site, 428 without a revision, 200 for the matching-revision save, and 409 with `revision_conflict` for the stale save. The successful response carried the selected site's incremented context revision; captured audit metadata included the update event but neither the bearer token nor instruction text.
**Test reference:** `scripts/harness/__tests__/agent-guidance-contract.test.mjs`, describe `ADMIN-002 private guidance persistence and authenticated API`, test `enforces identity/site/revision boundaries and audits safe metadata only`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-10-24

**Verification:** The caller directly logged into the current isolated admin using the synthetic owner created by `scripts/harness/admin-browser-fixture.mjs` and operated Chrome at 1440x1200 and 390x844. Actions covered selecting a publication, reading, editing, explicitly saving, copying machine context, clearing to the explained empty state, keyboard focus, and independently selected publications in two tabs. Document and scroll widths matched at both viewports. A second-editor save produced a conflict without losing the first draft; explicit reapply followed by Save succeeded, while explicit Reload discarded the old draft only by that choice. Post-refactor Chrome checks repeated the labelled controls, empty/read/edit/save/copy flow, tab isolation, keyboard focus, and overflow checks. The archived task records these actual browser observations; no user-only verification or production acceptance is substituted.
**Test reference:** `scripts/harness/__tests__/agent-guidance-editor.test.mjs`, describe `ADMIN-002 human guidance editor`, and `scripts/harness/__tests__/admin-site-tab-isolation.test.mjs`, describe `INFRA-005 browser publication selection is tab scoped`, passed in the guard's four-suite rerun. Browser fixture and exact action evidence are recorded in `.agents/tasks/completed/ADMIN-002.md`; browser interaction was performed by the agent rather than skipped as manual-only.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-10-24

**Verification:** In the guard's successful four-suite command, `gets and revision-updates a private selected-site context` spawned the actual `publisher site guidance get` and `set` commands with `--site example --json`, a temporary guidance input, and `--revision 4 --non-interactive` for the write. The local HTTP fixture observed exactly GET then PATCH on `/api/v2/sites/example/agent-guidance`, the PATCH carried `If-Match: "4"`, the JSON result exposed the expected context, and output did not contain the synthetic bearer-token sentinel. Source inspection confirms these commands invoke the shared client's typed `getAgentGuidance` and `updateAgentGuidance` methods, not browser automation.
**Test reference:** `scripts/harness/__tests__/agent-guidance-cli.test.mjs`, describe `ADMIN-002 agent guidance CLI preflight`, test `gets and revision-updates a private selected-site context`; typed methods are declared in `packages/admin-client/src/index.d.ts` and checked by the successful workspace typecheck.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-10-24

**Verification:** In the same guard rerun, parameterized CLI actions for post plan/create/update observed the selected site's guidance GET before any mutation and included its instruction/revision in the planning/result context. Malformed successful guidance responses failed with `AGENT_CONTEXT_UNAVAILABLE` and no write. Guidance-service failures before post delete, article set, media approval, submit, desk decision, and publish resulted in only the guidance GET and no mutation request. The fixture's context required a representative image. The separate real API test retained identity, site, and revision authorization regardless of natural-language guidance; the instructions are planning context, not an authorization bypass.
**Test reference:** `scripts/harness/__tests__/agent-guidance-cli.test.mjs`, describe `ADMIN-002 agent guidance CLI preflight`, the three parameterized test names listed in the TC-05 Test Plan row; `scripts/harness/__tests__/cli-fixture.mjs` owns the generic image-required context; TC-02's contract test verifies server enforcement.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-10-24

**Verification:** The caller's latest Node 22.23.4 `pnpm test` passed all workspace package suites and the full harness, 70 files / 418 tests. `pnpm typecheck`, `pnpm build` (static site and Desk Plugin), `pnpm build:admin`, `pnpm -r lint`, and `pnpm harness:scan` also passed; the scan runner completed all 13 scans. The guard's additional focused rerun passed four files / 20 tests. These results use checked-in generic fixtures, local PGlite and local HTTP transports without live provider credentials; the current-admin browser fixture uses the synthetic owner and the two viewports recorded above.
**Test reference:** All exact files and describe/test names are recorded in the six Test Plan rows. No TC is silently untested. The unavailable media-storage and comments runtimes in this browser fixture are outside this private-guidance criterion and are not claimed as verified publication or comment functionality.

### [GATE-COMPLETE] — ✅ PASS | 2026-10-24

**Status upgrade:** verifying → done
All six Completion Criteria are checked, each has a matching TC-specific verification entry with observed results, and every Test Plan row now names its actual automated suite/test or agent-operated browser action evidence. The completed implementation record exists at `.agents/tasks/completed/ADMIN-002.md`, all six task checkboxes are checked, and the spec's Tasks section points to that archived path. Required prior gates are present. Only Test Plan rows and Evidence Log were changed by this guard; frontmatter and lifecycle movement remain the caller's responsibility. This gate completes the local program feature, not an operated-instance deployment or the separate local-first architecture migration. The Evidence Log contains no operated-publication identity, production host/deployment identifier, or production screenshot path.
