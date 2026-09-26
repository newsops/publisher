---
status: done
type: INFRA
tags: [web, rest, typescript, auth, postgresql]
---

# INFRA-001: Cloudflare Workers comments runtime with direct Neon PostgreSQL

## Problem

The deployed admin owner session proves that the control plane can access its
PostgreSQL database, but its comment-moderation panel reports that the comment
service is unconfigured. `apps/comments` currently starts a Node HTTP server,
so it cannot be deployed to the selected Cloudflare Workers provider. The
public site must keep delivering static HTML while comment reads and writes are
served by a separate Cloudflare Worker directly connected to Neon PostgreSQL.

## Architecture Review

### Affected Scope

- `apps/comments`: Worker entrypoint, runtime-neutral dependency wiring, and
  Worker build/deploy configuration.
- `packages/persistence`: a Worker-safe PostgreSQL client import boundary, if
  the existing package barrel pulls Node-only modules into the Worker bundle.
- `apps/admin`: moderation client configuration and its integration coverage.
- `apps/site`: build-time comment origin/configuration only; no runtime secret
  or database dependency.
- `docs/`: direct Neon connection, Worker secret, deployment, verification,
  recovery, and free-plan operational guidance.

### Alternatives Considered

1. Deploy the existing Node server to Vercel. Pro: minimal code change. Con:
   violates the selected Cloudflare provider for comments.
2. Replace PostgreSQL with Cloudflare D1. Pro: direct Worker binding. Con:
   changes the product's PostgreSQL persistence contract and couples operators
   to Cloudflare SQLite.
3. Add a Cloudflare Worker adapter using the existing PostgreSQL schema and a
   direct Neon connection over the standard PostgreSQL wire protocol. Pro:
   preserves the portable PostgreSQL contract and adds no proxy, data store, or
   provider-specific persistence layer. Con: each Worker request establishes a
   direct database connection subject to Neon and Worker runtime limits.

### Decision

Implement alternative 3. A Worker-specific entrypoint will construct the same
`createCommentHandler` contract with `COMMENTS_DATABASE_URL` supplied as a
Cloudflare Worker secret. It will never add a provider API, proxy, cache, or
database binding to content or public-site contracts. The Node entrypoint
remains a supported deployment adapter. The Worker owns only HTTP transport and
removes caller-controlled client-IP metadata rather than consuming a
provider-specific forwarding header. `comments` uses a distinct Neon role/database
from `admin`, and neither URL enters source control. The Worker is deployed
separately from the static Pages project; its public origin is injected at
public build time and its moderation origin/token are held only in the admin
secret store.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — `apps/comments/src/node.ts` is the sole runtime
      entrypoint and no Worker configuration exists.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Isolate the PostgreSQL adapter from Node-only package imports and accept an
   explicit Neon PostgreSQL connection string supplied only at runtime.
2. Add a Worker entrypoint and `wrangler.jsonc` with the `nodejs_compat`
   runtime flag required by the `pg` driver, and no database bindings,
   credentials, or account IDs committed.
3. Preserve all comment route semantics: public approved-comment reads,
   pending-only writes, trusted moderation bearer authorization, CORS limited to
   `PUBLIC_ORIGIN`, and database-backed rate limiting. The Node adapter uses its
   direct TCP peer for an IP bucket; the Worker has no provider-specific IP
   dependency, so it enforces its per-thread bucket while human verification
   remains mandatory.
4. Add contract tests that execute the same handler through Node and Worker
   adapters, including rejected cross-origin, missing moderation token, and
   unavailable database paths.
5. Document the operator sequence: create a least-privilege Neon comments role,
   migrate its schema, set Worker/admin/Page environment variables, deploy, and
   run external smoke checks. Document direct connection limits honestly and
   make no Cloudflare paid-plan or proxy dependency part of the application
   contract.

## Affected Files

- `apps/comments/src/worker.ts` (new)
- `apps/comments/src/postgres-db.ts`
- `apps/comments/package.json`
- `apps/comments/wrangler.jsonc` (new)
- `apps/comments/src/*.test.ts` or existing comment test location
- `apps/admin/app/lib/comment-moderation.ts`
- `docs/deployment.md`
- `docs/ai-assisted-deployment.ko.md`

## Completion Criteria

- [x] TC-01: `pnpm --filter @publisher/comments typecheck` and
      `pnpm --filter @publisher/comments build:worker` exit 0 with the Worker
      entrypoint and `nodejs_compat` configuration required by the `pg` driver.
- [x] TC-02: the comment adapter test suite proves public reads, pending writes,
      rate limits, CORS denial, and moderation authorization have identical
      observable responses through Node and Worker transports, while proving the
      Worker never consumes a provider-specific client-IP header.
- [x] TC-03: `pnpm --filter @publisher/site build` exits 0 with comments
      enabled and the generated static output contains no secret, database URL, or
      request-time database import.
- [x] TC-04: an operator can run the documented direct Neon/Worker configuration
      steps without committing account IDs or credentials, and each required secret
      is named with its destination runtime.
- [x] TC-05: external smoke against the deployed Worker verifies an approved
      comment read, pending submission, authenticated moderation approval, and a
      subsequent approved read; the static article remains readable while the
      Worker is unavailable.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                  | Notes                                                                                                                                                                                                                                            |
| ----- | -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | typecheck + build    | `pnpm --filter @publisher/comments typecheck` and Worker bundle dry run          | Automated by `scripts/harness/__tests__/comments-worker-adapter-contract.test.mjs`, `keeps Node HTTP transport out of the Worker entrypoint` and `uses a bounded direct PostgreSQL connection only for one production request`; commands passed. |
| TC-02 | integration          | Vitest/Node handler tests plus Worker transport harness                          | Automated by `scripts/harness/__tests__/comments-worker-adapter-contract.test.mjs`, `preserves write and moderation semantics through the Worker transport`; it covers CORS, pending write, moderation, read, and provider-header removal.       |
| TC-03 | static boundary      | Site build with a public-only comment-origin fixture and static-boundary scanner | Automated by `scripts/harness/__tests__/comment-isolation-contract.test.mjs` plus `pnpm --filter @publisher/site build`; static-boundary scanner passed with no secret/database runtime import.                                                  |
| TC-04 | documentation review | Targeted documentation assertions/manual review                                  | Automated secret/portability coverage is in `scripts/harness/__tests__/free-portable-preflight.test.mjs`; the operator-only Worker/Neon console setup was manually observed because credentials must never be committed to a test fixture.       |
| TC-05 | external integration | `curl` against the selected Worker and Pages URLs                                | No automated test can create a real Turnstile token or mutate the production moderation state safely. The agent observed the production pending submission, authenticated admin approval, public Worker read, and static article rendering.      |

## Tasks

- [x] `.agents/tasks/completed/infra-cloudflare-direct-neon-comments-worker.md` — completed after GATE-VERIFY

## Scope History

The prior Hyperdrive scope was invalidated before deployment. User direction:
“우리 neon쓰기로 했어.” and “새로운 계층 추가는 나에게 허락을 받아라.” This replacement specification selects direct Neon PostgreSQL and requires a new GATE-WRITE and GATE-APPROVAL before implementation continues.

## Evidence Log

### [GATE-WRITE] — ❌ FAIL | 2026-09-13

**Status remains:** draft
**Failed criteria:**

- Evidence Log must be empty for the first GATE-WRITE execution: it already contains a `[RESCOPE]` entry.
  **Required action:** Move the rescope rationale outside this draft's Evidence Log (or create a fresh draft without prior Evidence Log entries), then rerun GATE-WRITE.

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready

- Frontmatter begins with YAML and declares `status: draft`, valid `type: INFRA`, and populated `tags`.
- Problem specifies the deployed moderation panel's unconfigured-service symptom, the Node-server reproduction context, and the required direct-Neon Worker behavior without TBD/TODO placeholders.
- Architecture Review identifies all affected scopes; all four checklist items are checked; sibling scan records the sole Node entrypoint/no Worker configuration; three alternatives provide pro/con; and the Decision chooses direct Neon while explicitly accepting per-request connection limits to avoid proxy/provider layers.
- Completion Criteria has five TC-prefixed command or observable-behavior criteria, covers the proposed functional sub-areas, and contains no prohibited vague wording.
- Test Plan has one fully populated row for each of TC-01 through TC-05; all Test Type, Tool / Approach, and Notes cells specify a verification strategy or external prerequisite, and no row uses a bare manual tool.
- Tasks retains the required post-approval placeholder; the prior failed GATE-WRITE entry is valid rerun history, and the former rescope text is now outside Evidence Log.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved

- User explicitly selected the direct-Neon design: “우리 neon쓰기로 했어.”
- User explicitly rejected an unapproved additional layer: “새로운 계층 추가는 나에게 허락을 받아라.”
- The reviewed `INFRA` frontmatter type/tags and Architecture Review retain that direct-Neon/no-proxy decision after the approval evidence; no implementation work is recorded for this replacement spec.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress

- Task record exists at `.agents/tasks/infra-cloudflare-direct-neon-comments-worker.md`, and that exact path is recorded in `## Tasks`.
- Its planned tasks cover TC-01 (direct-Neon Worker adapter/configuration), TC-02 and TC-03 (transport/static-boundary coverage), TC-04 (direct-Neon documentation and secret destinations), and TC-05 (observed deployment/public/comments/moderation smoke evidence).

### [GATE-VERIFY] — ❌ FAIL | 2026-09-13

**Status remains:** in-progress

- A human-verified public submission was accepted as pending, but the next
  authenticated moderation list request hung in the deployed Worker and
  returned HTTP 500. TC-05 could therefore not establish approval followed by
  an approved public read.

### [IMPLEMENTATION-FIX] — ✅ PASS | 2026-09-13

- The Worker now creates a bounded direct PostgreSQL pool for each production
  request and closes it in `finally`; no proxy, cache, or provider database
  binding was introduced.
- Regression coverage asserts this direct request lifecycle. Full verification
  passed: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm harness:scan`
  (130 harness tests, six scans).
- Production Worker version `<version-id>` returned
  the exact configured public CORS origin. A real Turnstile-verified submission
  was accepted as pending; the authenticated Vercel admin listed and approved
  it; the Worker public read and the live static article both subsequently
  displayed the approved comment. The no-JavaScript public browser smoke
  remains the outage boundary evidence: article HTML stays readable without
  the comment runtime.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

- Ran `pnpm --filter @publisher/comments typecheck` and
  `pnpm --filter @publisher/comments build:worker`; both exited 0.
- `comments-worker-adapter-contract.test.mjs` confirms the Worker entrypoint
  has `nodejs_compat`, no provider database binding, and a bounded direct
  PostgreSQL request lifecycle.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

- Ran `pnpm vitest run scripts/harness/__tests__/comments-worker-adapter-contract.test.mjs`:
  5 tests passed, including the pending-write → moderation → approved-read
  Worker transport contract and caller-controlled IP removal.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

- Ran `pnpm build` and `pnpm harness:scan`; the static export generated 22
  routes and the static-boundary scan passed with no request-time database
  import or private configuration in the public output.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

- Reviewed `docs/deployment.md` direct-Neon operator sequence and ran the
  portable/secret harness suite as part of `pnpm test` (130 tests passed).
- Production configuration used named Worker/admin secret destinations only;
  no account identifier or credential was added to source control.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

- Agent-observed production cycle: public Turnstile submission returned 202,
  authenticated Vercel admin listed and approved the pending comment, then
  `curl` to the Worker returned its `approved` record and the live static
  article rendered `1 approved comment`.
- The existing no-JavaScript browser smoke proves the static article remains
  readable without the comment runtime; the static response is independent of
  comments Worker availability.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-13

**Status remains:** in-progress
**Failed criteria:**

- All `.agents/tasks/infra-cloudflare-direct-neon-comments-worker.md` tasks must be complete with no blocker: its real human-verified submission and authenticated moderation approval task remains unchecked.
  **Required action:** Complete and record the production pending-submission → authenticated moderation-approval → public approved-read cycle.
- TC-05 external moderation verification must produce an observed approved read after the write: the deployed Worker accepted the verified POST, but the immediately following moderation database query hung or returned HTTP 500, so approval and the subsequent public approved read are not established.
  **Required action:** Diagnose and correct the production Worker/Neon moderation-query failure, then repeat the full external smoke cycle with observed responses.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying

- `.agents/tasks/infra-cloudflare-direct-neon-comments-worker.md` has all five Plan tasks marked `[x]` and its Blockers section records `None`.
- `pnpm --filter @publisher/site build` exited 0: the static build generated 22 routes and all post-build static metadata/header steps completed.
- `pnpm --filter @publisher/site test` exited 0.
- The task Progress entry records the agent-observed production cycle: a Turnstile-verified pending submission, authenticated admin listing and approval, and subsequent approved reads from both the public Worker API and live static article. It also records exact-origin CORS, invalid-token 403 closure, deployed Pages output, and the no-JavaScript static-article outage boundary. This INFRA specification is not SCREEN, FLOW, BEHAVIOR, or API typed, so the conditional viewport/test-account browser-evidence requirement does not apply.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-13

**Status remains:** verifying
**Failed criteria:**

- TC-01 through TC-05 are checked and the task is archived, but no individual
  `[GATE-COMPLETE: TC-N]` Evidence Log entry exists for any Completion
  Criterion with its exact command/action and observed result.
  **Required action:** Add one correctly labelled GATE-COMPLETE evidence entry
  for each TC-01 through TC-05, including the exact verification action,
  observed result, and its Test Plan test reference or explicit skip reason;
  then rerun this gate.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done

- TC-01 is checked and its `[GATE-COMPLETE: TC-01]` evidence records the exact
  comments typecheck and Worker-build commands, their zero exits, and the
  `comments-worker-adapter-contract.test.mjs` Worker-configuration coverage.
- TC-02 is checked and its `[GATE-COMPLETE: TC-02]` evidence records the exact
  Vitest command, its five passing tests, and the named Worker transport
  contract coverage.
- TC-03 is checked and its `[GATE-COMPLETE: TC-03]` evidence records the exact
  build/scanner commands, the 22 generated routes, the clean static boundary,
  and the named isolation-contract test reference.
- TC-04 is checked and its `[GATE-COMPLETE: TC-04]` evidence records the
  documentation review and 130-test result; its Test Plan explicitly limits
  the unautomated console-secret observation because credentials cannot enter a
  fixture.
- TC-05 is checked and its `[GATE-COMPLETE: TC-05]` evidence records the
  observed production Turnstile submission, authenticated moderation approval,
  public approved read, and no-JavaScript static-output boundary; its Test Plan
  explicitly states why a real Turnstile/moderation mutation is not automated.
- All five Completion Criteria are checked, every Test Plan row names its test
  reference or explicit automation limitation, and the completed task is
  archived at `.agents/tasks/completed/infra-cloudflare-direct-neon-comments-worker.md`,
  which is the path recorded in `## Tasks`.
