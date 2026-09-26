---
status: done
type: AGREEMENT
tags: [cli, rest, typescript, auth]
authority: delegated
---

# CLI-003: Admin API Client Package

## Problem

`packages/ops-cli/bin/publisher.mjs` currently parses command-line arguments,
reads environment configuration, assembles authenticated HTTP requests, and
interprets API responses in one executable file. Reproducing an agent workflow
from another CLI, a Claude plugin, or an automation runner would require
copying its private request helper and response conventions instead of using a
versioned package contract. This happens whenever a consumer needs operations
beyond the few commands currently implemented, including the archive inspection
and restore commands planned by CLI-002.

## Architecture Review

### Affected Scope

- `packages/admin-client` (new) provides the provider-neutral, authenticated
  HTTP client, typed request/response envelopes, stable error normalization,
  and injectable transport needed by non-browser operators.
- `packages/ops-cli` becomes a command-line presentation layer that imports
  the client package; it owns argument parsing, environment-to-config mapping,
  JSON output, and process exit codes only.
- `apps/admin` continues to own all HTTP routes, identity validation,
  authorization, idempotency, audit records, and mutations. It must not import
  the client package.
- `packages/content`, `packages/persistence`, and `packages/publication`
  remain server/domain packages and are not made dependencies of the client.
- `docs/agent-operations.md`, the package-boundary document, and contract
  harness tests document and enforce the direction.

Sibling scan completed: the workspace currently has `@publisher/ops-cli` only;
its executable embeds a `request()` helper and has no reusable client export.
`apps/admin` already owns `/api/v1` automation routes. `packages/content` and
`packages/persistence` are deliberately provider-neutral domain/persistence
layers, so putting HTTP client code in either would invert their dependency
direction. The new package name does not collide with an existing workspace
package or public route.

### Alternatives Considered

1. Keep the HTTP helper embedded in each CLI command. Pro: no new package.
   Con: agent/plugin consumers duplicate authorization headers, URL handling,
   error semantics, and idempotency behavior.
2. Export the CLI executable internals for other callers. Pro: one code file.
   Con: process arguments, stdout, and exit codes become an application API;
   plugin callers cannot safely reuse it without spawning a process.
3. Add `@publisher/admin-client` as a small TypeScript library and make the
   CLI a consumer. Pro: a single testable HTTP contract works for the official
   CLI, agent plugins, and custom automation without direct database or
   provider access. Con: package-version and API-envelope compatibility must
   be maintained deliberately.

### Decision

Choose alternative 3. The new `@publisher/admin-client` package will expose a
factory accepting an admin origin, bearer-token source, and standard
`fetch`-compatible transport. It returns typed methods for health/status,
operations, publication, media upload/approval, and archive restore as those
routes are added. It never reads process environment variables, writes tokens,
or connects to PostgreSQL, object storage, a host control plane, or a browser.
The official CLI owns environment input and serializes only redacted
machine-readable envelopes; a Claude plugin or any agent invokes either this
library or the CLI unchanged. This adds one internal package but avoids a
second runtime/service and keeps the existing admin API as the sole mutation
boundary.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — current CLI helper, admin API ownership, and package
      dependency direction inspected; new package name/path do not conflict
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Create a dependency-free `@publisher/admin-client` TypeScript package with
   explicit configuration and an injectable `fetch` transport. Export a stable
   `PublisherAdminClient` interface and structured `PublisherApiError` rather
   than leaking raw `Response` objects through callers.
2. Implement route methods with exact `/api/v1` paths, bearer authorization,
   `idempotency-key` support where callers provide it, safe JSON parsing, and
   no default origin, environment access, or secret persistence.
3. Move the existing `doctor`, `status`, `operation get`, and `publish` CLI
   HTTP behavior to client calls while preserving existing JSON envelope codes
   and non-interactive semantics. Subsequent CLI-002 commands use the same
   client instead of creating another request helper.
4. Add contract tests with an injected transport to prove request shape,
   redaction, error mapping, and that no client path can reach a database or
   hosting provider directly. Document the library and CLI boundary for agent
   integrators.

## Affected Files

- `packages/admin-client/package.json` (new)
- `packages/admin-client/src/index.ts` (new)
- `packages/admin-client/src/client.ts` (new)
- `packages/admin-client/src/client.test.ts` (new)
- `packages/ops-cli/package.json`
- `packages/ops-cli/bin/publisher.mjs`
- `.agents/project-structure.md`
- `docs/agent-operations.md`
- `scripts/harness/__tests__/admin-client-boundary-contract.test.mjs` (new)

## Completion Criteria

- [x] TC-01: `pnpm --filter @publisher/admin-client typecheck` exits 0 and its
      public export accepts explicit origin/token/transport configuration
      without reading `process.env`.
- [x] TC-02: Injected-transport tests observe `GET /api/v1/posts?limit=1`,
      `GET /api/v1/operations/{id}`, and `POST /api/v1/publish` with bearer
      authorization and caller-supplied idempotency key.
- [x] TC-03: A non-2xx or malformed API reply becomes a stable structured
      client result/error that contains no bearer token, request body, or
      endpoint credential.
- [x] TC-04: `publisher doctor`, `publisher status --json`, `publisher
operation get <id> --json`, and `publisher publish --json
--idempotency-key <key>` retain their documented JSON codes while using
      `@publisher/admin-client` rather than an embedded HTTP request helper.
- [x] TC-05: The package-boundary harness rejects imports of database,
      object-store, Cloudflare, Vercel, browser, or environment-persistence
      APIs from `packages/admin-client`, and documents apps/admin as the sole
      mutation authority.
- [x] TC-06: Focused package tests, workspace typecheck/test/build/lint, and
      harness scan exit 0 with no provider credentials; the CLI contract is
      exercised against an injected local transport rather than a live site.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                   | Notes                                                                                                                                           |
| ----- | ----------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | typecheck   | package TypeScript compiler                       | Passed: `pnpm --filter @publisher/admin-client typecheck`; configuration is explicit and has no environment prerequisite.                       |
| TC-02 | unit        | Vitest with injected fetch-compatible transport   | Passed: `packages/admin-client/src/client.test.ts` test `uses the documented automation routes and caller idempotency key`.                     |
| TC-03 | unit        | Vitest malformed/error response fixtures          | Passed: `packages/admin-client/src/client.test.ts` test `normalizes failures without serializing credentials or remote payloads`.               |
| TC-04 | integration | Node CLI contract harness with local HTTP fixture | Passed: `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` exercises command envelopes without a live account.                  |
| TC-05 | contract    | source-boundary harness test                      | Passed: `scripts/harness/__tests__/admin-client-boundary-contract.test.mjs` checks the client source and documents the sole mutation authority. |
| TC-06 | regression  | pnpm workspace commands and harness scan          | Passed: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm -r lint`, and `pnpm harness:scan`; local fixture replaces any live endpoint.         |

## Tasks

- [x] `.agents/tasks/completed/CLI-003.md` — implementation record archived
      after verification.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, permitted `AGREEMENT` type, non-empty tags, and `authority: delegated`.
Problem identifies the embedded `packages/ops-cli/bin/publisher.mjs` HTTP helper, the affected external-agent reuse scenario, and the archive-restore reproduction condition without placeholder language.
Architecture Review scopes the new client, CLI, admin routes, and excluded domain packages; records sibling-scan evidence, three alternatives with pro/con trade-offs, and a Decision that selects the package boundary explicitly.
All four Architecture Review Checklist items are checked, including the completed sibling scan.
Completion Criteria contain six concrete TC-01 through TC-06 command or observable requirements with no prohibited vague-success wording.
Test Plan has one populated strategy/notes row for each of TC-01 through TC-06; its local fixture and injected-transport cases explicitly avoid a manual/live-provider dependency.
Tasks placeholder and an otherwise empty Evidence Log were present before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
`authority: delegated` is declared in the frontmatter, and the completed Architecture Review records affected scope, sibling scan, alternatives, decision, and verification plan.
Standing delegation is defined by `.agents/rules/authority-delegation.md`; no current-turn item-by-item approval is required for this implementation.
No implementation task, code edit, or commit attributable to CLI-003 exists before this approval gate.
Execution-time exceptions for billing, production DNS/data, external communication, accounts, secrets, and new external services remain subject to a narrow confirmation immediately before execution.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
`.agents/tasks/CLI-003.md` exists and is recorded in the `## Tasks` section of this specification.
Its TC-01 through TC-06 plan items map one-for-one to every Completion Criterion: client package/configuration, injected request transport, normalized error redaction, CLI refactor, boundary documentation/harness, and regression verification.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
`.agents/tasks/CLI-003.md` has TC-01 through TC-06 all marked `[x]` and declares no blocker or deferred task.
`pnpm --filter @publisher/site build` exited 0; the static export completed with 22 generated routes and public metadata output.
`pnpm --filter @publisher/site test` exited 0.
`pnpm --filter @publisher/admin-client typecheck`, `pnpm --filter @publisher/admin-client test`, `pnpm --filter @publisher/ops-cli test`, and `pnpm vitest run scripts/harness/__tests__/admin-client-boundary-contract.test.mjs` exited 0; injected transport coverage and the client boundary contract passed.
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm -r lint`, and `pnpm harness:scan` exited 0; the harness reported 34 files / 145 tests passed and six scans passed.
Browser evidence is N/A: this `AGREEMENT` specification changes a reusable API client and CLI contract, not a SCREEN, FLOW, BEHAVIOR, or API user-facing browser surface.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`pnpm --filter @publisher/admin-client typecheck` exited 0. The exported
factory takes explicit origin, token, and transport values; the source-boundary
test confirms the package does not read `process.env`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

`packages/admin-client/src/client.test.ts` test `uses the documented automation
routes and caller idempotency key` passed, observing status, operation, and
publish request shapes through an injected transport.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

`packages/admin-client/src/client.test.ts` test `normalizes failures without
serializing credentials or remote payloads` passed. The observed error is
`REMOTE_ERROR` with status 403 and omits the test token sentinel.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

`pnpm vitest run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`
passed all five cases against a local HTTP server, including status, operation,
publish idempotency, and device-flow envelopes.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

`pnpm vitest run scripts/harness/__tests__/admin-client-boundary-contract.test.mjs`
passed both source-boundary and mutation-authority documentation assertions.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-13

`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm -r lint`, and `pnpm
harness:scan` all exited 0. The full harness observed 34 passing files and 145
passing tests without provider credentials.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01 through TC-06 are all checked and each has a dedicated `[GATE-COMPLETE: TC-N]` entry containing its command/action and observed result.
`pnpm --filter @publisher/admin-client typecheck` exited 0; its focused Vitest suite passed 2 tests, including the documented injected-route and redaction cases.
`pnpm vitest run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/admin-client-boundary-contract.test.mjs` exited 0 with 2 files / 7 tests passed, confirming the CLI envelope and provider-boundary assertions.
Every Test Plan row TC-01 through TC-06 names either a concrete test file/test case or the executed regression command; none is silently untested.
All Completion Criteria are checked, and the implementation record is archived at `.agents/tasks/completed/CLI-003.md`, which is the path recorded in `## Tasks`.
