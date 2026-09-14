---
status: in-progress
type: AGREEMENT
tags: [web, cli, rest, typescript, auth]
authority: delegated
---

# ADMIN-002: Per-Publication Agent Guidance

## Problem

An operator can configure a publication's public identity and use either the
human admin interface or the agent CLI/API to manage content, but cannot store
the publication-specific editorial constraints that an LLM agent must receive
before it creates, updates, or publishes content. For example, AI Trend Times
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
server-side validation and authorization. A first rule for AI Trend Times can
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

- [ ] TC-01: A migrated repository can create, read, and revision-update one
      private agent-guidance record per site; cross-site reads/writes are
      denied and the record is absent from public snapshots, static exports,
      archive exports, RSS, and article HTML.
- [ ] TC-02: `GET` and revision-checked `PATCH`
      `/api/v2/sites/{siteId}/agent-guidance` return a selected-site
      `agentContext` envelope only to an authorized automation identity, emit
      stable denial/conflict errors, and audit successful writes without
      recording credentials.
- [ ] TC-03: The authenticated human admin can select a publication, view,
      edit, clear, save, and recover from a revision conflict for its guidance
      using labelled keyboard-operable controls at desktop and mobile widths.
- [ ] TC-04: `publisher site guidance get --site <id> --json` and
      `publisher site guidance set --site <id> --file <path> --revision <n>
--json` use `@publisher/admin-client`, return documented machine-readable
      envelopes, and never require browser automation or expose a bearer token.
- [ ] TC-05: Agent-facing CLI content mutation commands fetch the selected
      site's current guidance before their mutation request and expose its
      revision/context in their local planning output; server authorization and
      validation remain mandatory even when the guidance is empty or ignored.
- [ ] TC-06: Contract, persistence, CLI, admin browser, typecheck, test,
      build, lint, and harness verification pass with local fixtures and no
      live provider credential; fixture coverage includes the AI Trend Times
      instruction requiring a representative image before publication.

## Test Plan

| TC-ID | Test Type                     | Tool / Approach                                                                  | Notes                                                                                                                                         |
| ----- | ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | persistence + export contract | PostgreSQL/PGlite fixture and static publication fixture                         | Preconditions: two seeded sites and one guidance document; asserts separate storage plus complete public/archive omission.                    |
| TC-02 | API integration               | Injected authenticated admin route requests                                      | Preconditions: publisher and non-member identities; checks envelope, revision conflict, site isolation, audit shape, and credential omission. |
| TC-03 | browser                       | Local authenticated admin smoke at 1440x1200 and 390x844                         | Preconditions: a selected seeded site; checks labels, keyboard flow, conflict state, empty state, and no horizontal overflow.                 |
| TC-04 | CLI/client contract           | Injected transport and temporary local guidance file                             | Preconditions: no live admin origin or token; checks exact routes, JSON schema, revision header, and redaction.                               |
| TC-05 | CLI behavior contract         | Local HTTP fixture for a content mutation                                        | Preconditions: one site with image-required guidance; observes guidance read before mutation and confirms no authorization bypass.            |
| TC-06 | regression                    | `pnpm typecheck && pnpm test && pnpm build && pnpm -r lint && pnpm harness:scan` | Uses generic local fixtures; no deployment, production data, or provider secret is required.                                                  |

## Tasks

- [ ] `.agents/tasks/ADMIN-002.md` — implementation record

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
