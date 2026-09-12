---
status: in-progress
type: AGREEMENT
tags: [cli, json-schema, typescript, auth, async]
---

# CLI-001: Agent Operations CLI

## Problem

The platform has an authenticated admin API and individual repository scripts,
but an autonomous operator has no single supported non-interactive interface
for inspecting readiness, initiating a publication, following its outcome, or
handling an authorization step. An agent therefore has to infer UI behavior,
parse human-oriented output, or reach into provider-specific tooling. This is
not safe or portable for an open-source publication operated primarily by
agents. Its canonical design document also does not yet state that agents are
first-class operators, so future work can regress toward browser-only or
provider-controlled workflows.

The problem is reproduced whenever an agent clones the repository and needs to
operate an installed site without a browser session: there is no versioned
`publisher` command, no stable JSON result envelope, and no explicit mapping
from a command failure to a retry, user approval, or terminal state.

## Architecture Review

### Affected Scope

- A new workspace CLI package that owns the `publisher` executable and its
  versioned JSON output schema.
- `apps/admin` API routes and repositories only where an existing authenticated
  API cannot expose a read-only operation/status record.
- `packages/content` shared public operation types where they are not admin
  implementation details.
- `docs/ai-assisted-deployment.ko.md`, `README.md`, and CLI documentation for
  agent runbooks and explicit-authority boundaries.
- `docs/publication-platform-plan.ko.md` as the durable agent-first product
  direction and non-negotiable operator-boundary record.
- Harness contracts for non-interactive output, exit codes, idempotency, and
  redaction.

### Alternatives Considered

1. Document existing `pnpm` scripts only. Pro: no implementation cost. Con:
   script output and environment assumptions are not a stable machine contract.
2. Let agents call the admin REST API directly. Pro: no extra binary. Con:
   every agent must reconstruct discovery, output semantics, retry rules, and
   secret handling.
3. Add a provider-specific Cloudflare/Vercel command layer. Pro: fast for one
   installation. Con: violates the portable PostgreSQL/S3/static-host contract.
4. Add a provider-neutral CLI over the authenticated admin API. Pro: one
   reviewable contract for people and agents, with provider adapters kept out
   of domain operations. Con: requires explicit API and output-version upkeep.

### Decision

Choose alternative 4. The `publisher` CLI is an API client, never a direct
database client and never a Cloudflare, Vercel, Neon, or R2 control plane. It
must expose a JSON envelope with a schema version, machine error code,
operation ID, retryability, and redacted diagnostics. Human-friendly output is
an optional rendering of the same result.

`publisher auth login --device` is designed as a separately enabled OIDC
Device Authorization Grant adapter: it uses issuer discovery, displays only a
verification URL and user code, respects polling intervals and denial/expiry,
and never prints, commits, or writes an access token unless the operator has
explicitly selected a secure local credential store. It is not a replacement
for automation tokens in headless CI.

The command namespace is distinct from existing `pnpm` scripts, so it does not
shadow package-manager commands or alter public-site routes.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing admin automation REST routes and deploy scripts reviewed; no supported `publisher` executable exists
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Implement a `@publisher/ops-cli` package with these initial commands:

- `publisher doctor --json`: validate only named configuration and API
  reachability; redact values and distinguish missing configuration from an
  unavailable service.
- `publisher status --json`: return the authenticated site/release/build-job
  state without mutating it.
- `publisher publish --idempotency-key <key> --json`: request publication
  through the admin API, return the server operation ID, and never retry a
  mutation unless the caller reuses the same idempotency key.
- `publisher operation get <id> --json`: return one terminal or pending
  operation state with a documented retry action.
- `publisher auth login --device --json`: optional OIDC device-flow adapter
  with no implicit token persistence.

All `--json` responses use `schemaVersion: 1` and a discriminated `ok` field.
Expected operational conditions have stable nonzero exit codes; invalid CLI
syntax is distinct from authentication, authority-required, retryable remote,
and terminal remote failures. Commands must reject TTY prompts when
`--non-interactive` is supplied. Tokens are read from an environment variable
or an explicitly selected secret store, never an argument, URL, result JSON,
log, or telemetry field.

The canonical product plan must state that an agent is a first-class operator:
it can discover capability, inspect machine-readable state, request an
idempotent mutation, and resume a durable operation through supported
contracts. It must also state the complementary human boundary: agents do not
silently approve billing, production DNS replacement, destructive deletion,
or a device-flow grant; those become observable `AUTHORITY_REQUIRED` states.

## Affected Files

- `packages/ops-cli/package.json`
- `packages/ops-cli/src/**`
- `apps/admin/app/api/**`
- `apps/admin/app/lib/**`
- `packages/content/src/**`
- `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`
- `README.md`
- `docs/ai-assisted-deployment.ko.md`
- `docs/publication-platform-plan.ko.md`
- `docs/agent-operations.md`

## Completion Criteria

- [ ] TC-01: `publisher doctor --json --non-interactive` returns a
      schema-versioned, redacted JSON envelope and uses a documented nonzero exit
      code when required configuration is absent.
- [ ] TC-02: `publisher status --json` and `publisher operation get <id>
--json` expose only authenticated site/build state, including a stable
      terminal/pending/retryable discriminator.
- [ ] TC-03: Two `publisher publish` requests with the same idempotency key
      return the same operation identity and do not create a second publish job.
- [ ] TC-04: `publisher publish --non-interactive` returns
      `AUTHORITY_REQUIRED` without a mutation when its requested action requires a
      user-only external approval.
- [ ] TC-05: `publisher auth login --device --json` follows OIDC discovery,
      prints only verification URI/user code metadata, respects server polling
      interval, and redacts tokens from output and logs.
- [ ] TC-06: CLI contract tests, typecheck, full regression, static build, and
      repository scan pass without runtime provider credentials.
- [ ] TC-07: `docs/publication-platform-plan.ko.md` declares the agent-first
      operator direction, supported machine contracts, and human-only authority
      boundary; a repository contract test rejects removal of those statements.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                  | Notes                                                                                                                               |
| ----- | ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | integration | Vitest subprocess fixture                                        | A fixture with missing named variables verifies schema, redaction, and exit code without real values.                               |
| TC-02 | integration | Vitest admin API + CLI fixture                                   | An authenticated fixture seeds one build job and asserts the JSON discriminator; unauthenticated calls must fail closed.            |
| TC-03 | integration | Vitest concurrent publish fixture                                | The same idempotency key is submitted twice against a representative seeded site; job count remains one.                            |
| TC-04 | integration | Vitest CLI fixture                                               | A protected external-action fixture verifies no HTTP mutation occurs before `AUTHORITY_REQUIRED`.                                   |
| TC-05 | integration | Vitest local OIDC discovery server                               | Local discovery/token endpoints model interval, pending, denial, and expiry; no real identity account is required.                  |
| TC-06 | regression  | `pnpm typecheck && pnpm test && pnpm build && pnpm harness:scan` | Runs from a clean checkout with no provider credentials; browser-only verification is separately recorded when Chrome is available. |
| TC-07 | contract    | Vitest repository-documentation contract                         | Reads the canonical Korean product plan and asserts the required agent-first capabilities and human-only approval boundary.         |

## Tasks

- [ ] `.agents/tasks/CLI-001.md` — active implementation record; one planned task covers each of TC-01 through TC-07.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-12

**Status upgrade:** draft → review-ready

- Frontmatter starts the document and declares `status: draft`, valid type `AGREEMENT`, and non-empty `tags`.
- Problem identifies the missing non-interactive `publisher` contract, reproduces it for a cloned installation without a browser, and contains no unresolved placeholders.
- Architecture review lists affected layers, records the sibling scan result, compares four alternatives with pro/con trade-offs, and selects the provider-neutral API-client CLI for the stated portability and authority-boundary reasons.
- Completion Criteria contain seven observable, uniquely prefixed TC-01 through TC-07 requirements; each CLI capability and the durable product-direction documentation requirement has coverage.
- Test Plan has one non-empty Type, Tool / Approach, and Notes entry for each of TC-01 through TC-07; no manual-only row exists.
- Tasks contains the required pre-implementation placeholder and Evidence Log was empty before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-12

**Status upgrade:** review-ready → approved

- The user explicitly directed this capability: “우리 newsops도 나중에 agent가 cli로 불러다 쓸수 있어야 하고 에이전트 친화적인 애플리케이션이 되어야 합니다. 나중에는 사람이 아니라 에이전트가 운영하는 뉴스사이트를 위한 오픈소스가 될 것이기 때문입니다.”
- The user then made the durable design-record scope explicit: “이 시스템의 디자인 문서에 전체적인 이 시스템의 방향에 대해 적혀있어야 합니다. 그래야 앞으로도 계속 그 방향으로 계속 갈 수 있습니다.”
- Those statements directly approve the spec’s provider-neutral agent CLI and its canonical product-plan direction, including the stated human-only authority boundary.
- `git diff` shows the only change after the GATE-WRITE version is `status: draft` → `status: review-ready`; the Architecture Review, frontmatter `type` and `tags` have not changed after approval.

### [GATE-IMPLEMENT] — ❌ FAIL | 2026-09-12

**Status remains:** approved
**Failed criteria:**

- Required task record: `.agents/tasks/CLI-001.md` is absent, while `## Tasks` still explicitly records it as uncreated.
  **Required action:** Create `.agents/tasks/CLI-001.md` with at least one task for each of TC-01 through TC-07, then replace the placeholder in `## Tasks` with that path before rerunning GATE-IMPLEMENT.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-12

**Status upgrade:** approved → in-progress

- `.agents/tasks/CLI-001.md` exists and is recorded in `## Tasks` as the active implementation record.
- Its Plan contains TC-01 through TC-07, with one concrete implementation or verification task for every Completion Criterion.
- The user explicitly approved the required record correction and implementation with: “승인합니다.”
