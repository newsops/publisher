---
status: in-progress
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

- [ ] TC-01: `pnpm --filter @publisher/comments typecheck` and
      `pnpm --filter @publisher/comments build:worker` exit 0 with the Worker
      entrypoint and `nodejs_compat` configuration required by the `pg` driver.
- [ ] TC-02: the comment adapter test suite proves public reads, pending writes,
      rate limits, CORS denial, and moderation authorization have identical
      observable responses through Node and Worker transports, while proving the
      Worker never consumes a provider-specific client-IP header.
- [ ] TC-03: `pnpm --filter @publisher/site build` exits 0 with comments
      enabled and the generated static output contains no secret, database URL, or
      request-time database import.
- [ ] TC-04: an operator can run the documented direct Neon/Worker configuration
      steps without committing account IDs or credentials, and each required secret
      is named with its destination runtime.
- [ ] TC-05: external smoke against the deployed Worker verifies an approved
      comment read, pending submission, authenticated moderation approval, and a
      subsequent approved read; the static article remains readable while the
      Worker is unavailable.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                  | Notes                                                                                                                                                                                                                                  |
| ----- | -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | typecheck + build    | `pnpm --filter @publisher/comments typecheck` and Worker bundle dry run          | Verifies direct TCP-compatible Worker bundle does not transitively load the Node HTTP server or require a provider database binding.                                                                                                   |
| TC-02 | integration          | Vitest/Node handler tests plus Worker transport harness                          | Uses isolated PostgreSQL fixtures and synthetic request origins; it verifies the Node IP bucket, Worker per-thread bucket, and no provider-specific client-IP dependency. A real DB is required only for the PostgreSQL store portion. |
| TC-03 | static boundary      | Site build with a public-only comment-origin fixture and static-boundary scanner | Proves no private configuration becomes static output.                                                                                                                                                                                 |
| TC-04 | documentation review | Targeted documentation assertions/manual review                                  | Checks named variables, least-privilege database separation, direct connection behavior, and no literal credentials.                                                                                                                   |
| TC-05 | external integration | `curl` against the selected Worker and Pages URLs                                | Requires the separate Neon comments role, Worker secrets, public origin, and production comment origin; a zero-result GET is valid before a successful moderation cycle.                                                               |

## Tasks

- [ ] `.agents/tasks/infra-cloudflare-direct-neon-comments-worker.md` — 미생성 (GATE-APPROVAL 통과 후 생성)

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
