---
status: done
type: API
tags: [web, rest, typescript, auth]
authority: delegated
---

# API-001: Site-scoped Comment Moderation

## Problem

The comment service exposes moderation only beneath
`/v1/sites/:siteId/moderation/comments`, while the authenticated admin proxy
currently requests the unscoped `/v1/moderation/comments` path. Running the
Node comment adapter with its documented environment and loading the local
admin makes the service return HTTP 404; the moderation panel consequently
reports that it is unavailable. The same discrepancy makes a multi-site admin
unable to prove that a moderation action targets the selected publication.

## Architecture Review

### Affected Scope

- `apps/admin` owns selected-publication lookup and must send its stable site
  identifier only to the private, server-side comment moderation adapter.
- `apps/comments` keeps its existing site-scoped HTTP contract and PostgreSQL
  isolation; it must not gain an unscoped fallback or a default site.
- The admin comment proxy contract tests and operator documentation must state
  the exact scoped upstream paths and preserve the bearer-token boundary.
- `apps/admin/app` supplies the browser icon requested by the private admin so
  the authenticated verification surface has no avoidable first-party 404.

### Alternatives Considered

1. Add unscoped, default-site routes in `apps/comments`. Pro: smallest admin
   diff. Con: ambiguous in a multi-site system and risks cross-publication
   moderation.
2. Encode a site path inside `COMMENTS_ORIGIN`. Pro: no source edit. Con:
   path concatenation produces invalid URLs and hides the actual contract in
   deployment configuration.
3. Resolve the selected site in the authenticated admin route and append it to
   the documented site-scoped upstream path. Pro: preserves explicit isolation
   and the existing public-worker contract. Con: requires route/test updates.

### Decision

Choose alternative 3. The authenticated admin request resolves the same site
context used by the dashboard and passes its validated identifier to the
private comment-service client. The client constructs only
`/v1/sites/:siteId/moderation/comments` paths, so a URL or bearer credential
cannot silently select another publication. This is a contained source fix
rather than a new proxy, provider, database, or runtime layer.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — the comment handler accepts only site-scoped
      moderation routes; the admin proxy alone uses unscoped routes
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Pass the selected site identifier through both list and mutation moderation
handlers into a typed comment-service path helper. Validate it before any
upstream request, retain existing authentication, same-origin, audit, timeout,
and no-store behavior, and add request-contract tests for two distinct sites.
Provide a repository-native static admin icon; it is a visual resource only and
does not add a provider dependency or runtime request.
The Node and Worker comment handlers remain unchanged because their scoped
contract is already the portable boundary.

## Affected Files

- `apps/admin/app/lib/comment-moderation.ts`
- `apps/admin/app/api/comments/moderation/route.ts`
- `apps/admin/app/api/comments/moderation/[id]/route.ts`
- `apps/admin/app/icon.svg`
- `scripts/harness/__tests__/comment-moderation-contract.test.mjs`
- `docs/deployment.md`
- `.agents/tasks/API-001.md`

## Completion Criteria

- [x] TC-01: Authenticated list and update requests for `default` and a second
      valid site call exactly `/v1/sites/:siteId/moderation/comments` and
      `/v1/sites/:siteId/moderation/comments/:id`, with the server-only bearer
      token retained.
- [x] TC-02: Invalid or missing selected site context returns a bounded 4xx
      admin response before an upstream call, while existing authentication and
      cross-origin mutation denial responses remain unchanged.
- [x] TC-03: A local authenticated admin backed by the unmodified Node comment
      adapter displays `No pending comments.` rather than the unavailable
      status; `/icon.svg` returns 200 and Chrome reports no first-party
      moderation or icon request failure.
- [x] TC-04: `pnpm typecheck`, `pnpm test`, `pnpm build`, and
      `pnpm harness:scan` exit 0 after the scoped-contract regression tests
      and deployment documentation are updated.

## Test Plan

| TC-ID | Test Type         | Tool / Approach                                                           | Notes                                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | API integration   | `scripts/harness/__tests__/comment-moderation-contract.test.mjs`          | Automated by `forwards the server-only token on the selected site-scoped list and update paths`; it asserts exact default/second-publication URLs and the bearer header without a network service.                                                                                                                    |
| TC-02 | security contract | `scripts/harness/__tests__/comment-moderation-contract.test.mjs`          | Automated by `rejects an invalid selected site before contacting the comment service` and `rejects a cross-origin moderation mutation`; both assert no upstream fetch.                                                                                                                                                |
| TC-03 | browser smoke     | Authenticated Chrome at local admin with PGlite and Node comments adapter | No browser test is committed because secure browser sessions and local PGlite fixture setup cannot be reproduced in the unit runner; agent-run evidence names `data002-browser@example.test`, desktop 1208x768, iPhone SE 375x667, the visible panel result, icon response, Console result, and overflow measurement. |
| TC-04 | regression        | Root workspace commands and harness scan                                  | Automated by root `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm harness:scan`; `scripts/harness/__tests__/comment-moderation-contract.test.mjs` / `COMMENT-001 admin moderation boundary` is included in the full suite, alongside the six repository scans.                                                 |

## Tasks

- [x] `.agents/tasks/completed/API-001.md` — completed implementation record;
      maps TC-01
      through TC-04 to scoped routing, rejection behavior, browser evidence,
      and workspace regression.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, `type: API`, non-empty `tags`, and delegated authority.
Problem identifies the exact unscoped admin request, documented scoped route, HTTP 404 symptom, and local-admin reproduction condition without placeholders.
Architecture Review records affected boundaries, a completed sibling scan, three alternatives with pro/con trade-offs, and a decision grounded in explicit site isolation.
Completion Criteria define four observable or command-based `TC-N` requirements without vague success language.
Test Plan contains one fully specified, non-manual test strategy and non-empty verification notes for each of TC-01 through TC-04.
Tasks contains the required pre-approval placeholder and this Evidence Log was empty before this first GATE-WRITE record.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved
`authority: delegated` is declared in this spec, and the completed Architecture Review records affected scope, sibling scan, alternatives, decision, and a four-case test plan.
`.agents/rules/authority-delegation.md` establishes standing delegation for this exact review-ready pattern; no current-turn item-by-item confirmation is required.
The review/frontmatter remain unchanged after the recorded GATE-WRITE approval evidence, and no API-001 implementation task, code change, or commit exists before this gate.
Execution-time exceptions remain: any chargeable resource, production DNS/data mutation, external communication, account action, secret disclosure, or new external runtime/proxy/queue/cache/managed service still needs narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress
`.agents/tasks/API-001.md` exists and is recorded in this spec's `## Tasks` section as the active implementation record.
The task plan maps TC-01 to scoped list/update routing, TC-02 to rejection behavior, TC-03 to authenticated desktop/mobile verification, and TC-04 to focused and workspace regression/documentation work.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-15

**Status remains:** in-progress
**Failed criteria:**

- Browser verification evidence: `.agents/tasks/API-001.md` records an "isolated owner fixture" and the iPhone SE `375x667` viewport, but does not identify the authenticated test-account label or state a desktop viewport. The GATE-VERIFY browser-evidence requirement requires both the account label and viewport evidence for the authenticated user-facing flow.
  **Required action:** Record the exact non-production test-account label and explicit desktop plus mobile viewport observations from the agent-run Chrome check, then rerun GATE-VERIFY.

`pnpm --filter @publisher/site build` and `pnpm --filter @publisher/site test` both exited 0 during this gate check; all API-001 task checkboxes are `[x]` and its Blockers section says `None`.

### [GATE-VERIFY] — ✅ PASS | 2026-09-15

**Status upgrade:** in-progress → verifying
All `.agents/tasks/API-001.md` implementation tasks are marked `[x]`, and its Blockers section records `None`.
`pnpm --filter @publisher/site build` exited 0 on 2026-09-15, producing the static site output; `pnpm --filter @publisher/site test` exited 0 immediately afterward.
The agent-run Chrome evidence in `.agents/tasks/API-001.md` identifies the isolated, non-production authenticated test account as `data002-browser@example.test`, records the desktop Chrome window at `1208x768`, and records the iPhone SE mobile viewport at `375x667` with `scrollWidth=375`, `clientWidth=375`, and `overflow=false`.
That same evidence records `No pending comments.`, a successful first-party icon response, and zero Console messages after reload; it is direct agent verification rather than a request for user confirmation.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-15

**Status remains:** verifying
**Failed criteria:**

- Per-criterion completion evidence: TC-01 through TC-04 are checked, but this
  Evidence Log has no `[GATE-COMPLETE: TC-01]`, `[GATE-COMPLETE: TC-02]`,
  `[GATE-COMPLETE: TC-03]`, or `[GATE-COMPLETE: TC-04]` entry that records the
  exact verification command/action and observed result for each criterion.
  **Required action:** Add one exact `[GATE-COMPLETE: TC-N]` evidence entry for
  every TC-N, including the command or browser action and its observed result.

- Test Plan completion references: all four Test Plan rows describe an
  approach, but none names the concrete test file plus `describe`/test
  function, nor states a reason to skip automation. For example, the existing
  scoped regression is
  `scripts/harness/__tests__/comment-moderation-contract.test.mjs` /
  `COMMENT-001 admin moderation boundary`, but that reference is absent from
  the plan.
  **Required action:** Update every TC-N Test Plan row with its concrete test
  file and test function/describe name, or an explicit reason automation is
  skipped; then rerun this gate.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-15

- Ran `pnpm vitest run scripts/harness/__tests__/comment-moderation-contract.test.mjs`; all 4 tests passed.
- `COMMENT-001 admin moderation boundary` / `forwards the server-only token on the selected site-scoped list and update paths` observed exactly `default` and `second-publication` scoped upstream URLs and the server-only bearer header.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-15

- The same focused command passed `rejects an invalid selected site before contacting the comment service` and `rejects a cross-origin moderation mutation`.
- The observed assertions were HTTP 400 or 403 respectively and zero upstream calls for each rejected request.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-15

- Agent ran authenticated Chrome against the isolated PGlite owner fixture `data002-browser@example.test` at desktop 1208x768 and iPhone SE 375x667, backed by the unmodified local Node comments adapter.
- The panel visibly displayed `No pending comments.`, `GET /icon.svg` returned 200, the Console showed zero messages after reload, and a page-context measurement returned `scrollWidth=375`, `clientWidth=375`, `overflow=false`. Browser-session setup is intentionally not unit-automated as recorded in the Test Plan.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-15

- Ran `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm harness:scan`; all exited 0.
- The workspace test run reported 40 files and 191 tests passed, and the harness reported all six scans passed. The focused moderation contract file is included in the regression suite.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-15

**Status upgrade:** verifying → done
TC-01 has checked completion evidence from `scripts/harness/__tests__/comment-moderation-contract.test.mjs` / `COMMENT-001 admin moderation boundary` and its named scoped-path/token assertion; the focused Vitest command passed all four tests.
TC-02 has checked completion evidence from the same named test file and its named invalid-site and cross-origin rejection assertions; the focused Vitest command observed 400/403 and no upstream call.
TC-03 has checked direct agent browser evidence with its exact local test-account label, desktop and mobile viewports, visible empty-state result, icon response, Console result, and overflow measurement; the Test Plan explicitly records why this secure-session/PGlite fixture is not unit-automated.
TC-04 has checked root-command evidence with observed zero exits, 40 test files/191 tests, and six passing scans; its Test Plan now names the included moderation test file and `COMMENT-001 admin moderation boundary` describe.
All Completion Criteria are checked, every Test Plan row contains a concrete automated test reference or an explicit automation-skip reason, `.agents/tasks/completed/API-001.md` is archived, and this spec's Tasks section points to that archive.
