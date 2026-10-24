---
status: done
type: SECURITY
tags: [cli, rest, auth, typescript]
authority: delegated
---

# SECURITY-001: Additive Automation Keyrings

## Problem

Production automation keys are stored in Vercel as encrypted environment
variables. The provider intentionally cannot return the existing value to the
CLI, so replacing `ADMIN_AUTOMATION_KEYS` to add a narrowly scoped content agent for one
publication would silently revoke every existing automation key. This
blocks the required CLI/API media workflow or risks an avoidable access outage.

## Architecture Review

### Affected Scope

- `apps/admin/app/lib/automation-auth.ts`: parse a primary and optional
  additive JSON keyring with identical validation, constant-time comparison,
  role, and site-scope behavior.
- `apps/admin/.env.example`, `docs/admin-api.md`, and agent-operation docs:
  document `ADMIN_AUTOMATION_KEYS` as the primary ring and
  `ADMIN_AUTOMATION_KEYS_EXTRA` as a separately managed additive ring.
- Existing automation-auth and API contract tests.

Sibling scan completed: `automation-auth.ts` is the sole parser and validator
for the production automation key list. Routes consume its site-scoped identity
helper rather than parsing environment variables. No alternative environment
keyring or configuration merge currently exists.

### Alternatives Considered

1. Replace the original keyring. Pro: no code change. Con: unknown existing
   keys are revoked because encrypted provider values cannot be read back.
2. Use a database table for automation secrets. Pro: mutable through the app.
   Con: introduces a new credential-storage boundary and administration flow
   solely for an additive configuration need.
3. Allow an optional second environment keyring and merge validated records.
   Pro: preserves the original provider secret, keeps no secrets in the
   database, and reuses the same authorization model. Con: operators must
   avoid duplicate key IDs across rings.

### Decision

Choose alternative 3. `ADMIN_AUTOMATION_KEYS_EXTRA` will be optional and use
the exact same record schema as the primary variable. Both are validated before
authentication; duplicate key IDs are rejected fail-closed. This is a
configuration compatibility improvement, not a new external service or a
separate authentication model.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — sole parser and all consumer routes identified
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Parse the primary and optional extra variables with the same strict JSON
   validation, concatenate only valid records, and reject duplicate IDs.
2. Keep missing primary-plus-extra configuration fail-closed and never return
   a raw key, hash, or environment value in an API error, log, or CLI result.
3. Document rotation: add a site-scoped record in the extra ring, deploy,
   verify the replacement client, then remove the retired record in a later
   controlled update.

## Affected Files

- `apps/admin/app/lib/automation-auth.ts`
- `apps/admin/.env.example`
- `docs/admin-api.md`
- `docs/agent-operations.md`
- focused automation-auth and CLI/API contract tests

## Completion Criteria

- [x] TC-01: A valid primary keyring and a valid extra keyring authorize their
      respective site-scoped tokens with the existing role semantics, while
      neither raw value nor SHA-256 hash appears in responses or diagnostics.
- [x] TC-02: Missing both rings, malformed JSON in either ring, invalid record
      schema, and duplicate key IDs fail closed as authentication unavailable.
- [x] TC-03: Documentation and tests show additive rotation without overwriting
      the primary provider secret; `pnpm typecheck`, focused tests, and
      `pnpm harness:scan` exit 0 without live credentials.

## Test Plan

| TC-ID | Test Type         | Tool / Approach                                                                                                                                                                                                                                          | Notes                                                                                                                                   |
| ----- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | security contract | `automation-keyrings.test.mjs`: `SECURITY-001 additive automation keyring isolation`                                                                                                                                                                     | Real identity/API wrapper checks both rings, site and role denials, response/log token and hash omission.                               |
| TC-02 | security contract | `automation-keyrings.test.mjs`: `SECURITY-001 additive automation keyring isolation` configuration matrix cases                                                                                                                                          | Actual runtime tests cover missing rings, malformed JSON, invalid schemas and duplicate IDs; no live credentials.                       |
| TC-03 | regression        | `scripts/harness/__tests__/admin-automation-contract.test.mjs` / `admin automation API contract`; `scripts/harness/__tests__/automation-keyrings.test.mjs` / `SECURITY-001 additive automation keyring isolation`; package runner, typecheck/build/scans | Thirty added matrix tests plus seven existing automation tests pass; documented rotation never overwrites an unavailable primary value. |

## Tasks

- [x] `.agents/tasks/completed/SECURITY-001.md` — completed implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, `type: SECURITY`, non-empty `tags`, and `authority: delegated`.
Problem identifies the unretrievable encrypted `ADMIN_AUTOMATION_KEYS` value, the replacement/revocation symptom, and the Vercel production automation-key reproduction context without placeholders.
Architecture Review lists affected scope and a completed sibling scan, checks all four checklist entries, evaluates three alternatives with pro/con pairs, and ties the selected additive-ring trade-off to the Decision.
Completion Criteria contains TC-01 through TC-03 only; each is observable or command-based and avoids prohibited vague language.
Test Plan has exactly one non-empty strategy row for each of TC-01 through TC-03; all tools and notes are specified and no manual-only row is used.
Tasks placeholder and an otherwise empty Evidence Log were present before this entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved
Delegated authority is declared by the frontmatter (`authority: delegated`) and `.agents/rules/authority-delegation.md` grants standing approval when the Architecture Review contains affected scope, sibling scan, alternatives, decision, and test plan; all are complete above.
The completed review selects an additive environment-keyring compatibility change with no new provider, runtime, proxy, queue, cache, billing decision, or production data mutation.
Execution-time exceptions in `.agents/rules/authority-delegation.md` remain in force: creating or transmitting a production secret still requires narrow confirmation immediately before that external mutation.
No implementation-file edit or implementation commit for the listed affected files predates this approval; the working tree contains this new specification but no automation-auth implementation diff.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress
Implementation record exists at `.agents/tasks/SECURITY-001.md` and that exact path is recorded in `## Tasks`.
The task plan maps TC-01 to dual-ring merge/redaction, TC-02 to fail-closed malformed and duplicate handling, and TC-03 to rotation documentation and focused regression checks.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-15

**Status remains:** in-progress
**Failed criteria:**

- No blocked or pending task: `.agents/tasks/SECURITY-001.md` has all three
  TC checkboxes checked, but its `## Blockers` explicitly says “Production
  verification and deployment remain pending,” and `## Result` still says
  “Pending implementation.”
  **Required action:** Complete or explicitly remove the pending production
  verification/deployment work from this implementation record before
  rerunning GATE-VERIFY.

Observed passing evidence retained for the rerun: `pnpm --filter @publisher/site build`, `pnpm --filter @publisher/site test`, `pnpm exec vitest --run scripts/harness/__tests__/admin-automation-contract.test.mjs` (7 tests), `pnpm typecheck`, and `pnpm harness:scan` all exited 0 on 2026-09-15. This SECURITY spec has no SCREEN/FLOW/BEHAVIOR/API user-facing browser-verification requirement.

### [GATE-VERIFY] — ✅ PASS | 2026-10-24

**Status upgrade:** in-progress → verifying
The task record `.agents/tasks/SECURITY-001.md` marks TC-01 through TC-03 complete and contains no blocked or deferred implementation task. Its Result now describes the implemented contract rather than pending implementation; production credential rotation is explicitly separate from these completion criteria. The earlier VERIFY failure remains preserved above.
The orchestrator supplied current Node 22.23.4 evidence that `pnpm build:admin` exited 0, including compilation, typechecking, and route generation. The task record also records passing `pnpm typecheck`, `pnpm -r lint`, static site/Desk Plugin build, and all 13 harness scans. No production secret was created, transmitted, or rotated by this gate.
Independent guard replay on Node 22.23.4: `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/admin-automation-contract.test.mjs` exited 0 with one file and seven tests passing; `node scripts/harness/run-package-tests.mjs @publisher/admin` exited 0 with five files and 20 tests passing; `node scripts/harness/run-package-tests.mjs @publisher/site` exited 0 with two files and five tests passing.
Source inspection confirmed that both configuration rings use the same parser, duplicate IDs fail closed, token comparison uses `timingSafeEqual`, and known authentication configuration errors return a sanitized response. Additive rotation is documented in `docs/admin-api.md`, `docs/agent-operations.md`, and `apps/admin/.env.example`.
Browser verification is not required by this gate because the spec type is SECURITY and this change modifies server-to-server bearer authentication rather than a browser interaction. Per-criterion completeness and any additional test matrix remain the separate GATE-COMPLETE responsibility; this entry does not claim those further tests ran.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-10-24

**Verification:** On Node 22.23.4, `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/automation-keyrings.test.mjs scripts/harness/__tests__/admin-automation-contract.test.mjs` exited 0: two files, 37 tests passed.
**Observed result:** `SECURITY-001 additive automation keyring isolation` executes the real identity resolver and API wrapper for both primary and extra rings. The parameterized authorization cases grant only the configured site, return 403 for another site without invoking its handler, preserve both environment values, and verify that identities, responses, and captured diagnostics omit both raw tokens and SHA-256 digests. The role cases deny editor publication and grant both editor and publisher operations to publisher records in either ring.
**Test reference:** `scripts/harness/__tests__/automation-keyrings.test.mjs`, describe `SECURITY-001 additive automation keyring isolation`, cases `authorizes %s without replacing either ring and denies another site` and `keeps editor/publisher semantics identical in the %s ring`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-10-24

**Verification:** The same independent two-file command exited 0 with all 30 keyring-matrix tests and seven existing API-contract tests passing.
**Observed result:** The matrix removes both rings, supplies malformed JSON in each ring beside a valid sibling, tries nine invalid schema shapes in each ring, and introduces duplicate IDs across rings and within either ring. Each invalid configuration produces the sanitized 503 `service_unavailable` response, retains no-store/request-ID headers, does not invoke the protected handler, and omits tokens and hashes from responses and captured diagnostics. Two additional cases deny schema-valid keys without a non-empty site scope.
**Test reference:** `scripts/harness/__tests__/automation-keyrings.test.mjs`, describe `SECURITY-001 additive automation keyring isolation`, cases `fails closed when both keyring configurations are missing`, `rejects malformed JSON in %s despite a valid sibling ring`, the `invalidRecords` parameterized cases, `rejects duplicate IDs %s`, and `denies a schema-valid key without a site scope`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-10-24

**Verification:** `volta run --node 22 pnpm typecheck` exited 0 for all workspace package typechecks. `node scripts/harness/run-package-tests.mjs @publisher/admin`, executed with Node 22.23.4, exited 0 with seven files and 52 tests passing. The focused command recorded above exited 0 with two files and 37 tests passing. Final independent `volta run --node 22 pnpm harness:scan` exited 0 and printed `[harness] 13 scans passed`.
**Observed result:** Source inspection of `docs/admin-api.md`, `docs/agent-operations.md`, and `apps/admin/.env.example` confirmed the additive-ring configuration and the instruction to verify the replacement client before retiring a record. The keyring matrix asserts that authenticating either ring leaves both configured values unchanged. An earlier scan during concurrent UI extraction found unregistered helper components and a stale Desk Plugin bundle; after registration and rebuilding, the final scan passed without a baseline waiver. No live credential, production rotation, or deployment was used or claimed.
**Test reference:** `scripts/harness/__tests__/automation-keyrings.test.mjs`, describe `SECURITY-001 additive automation keyring isolation`; `scripts/harness/__tests__/admin-automation-contract.test.mjs`, describe `admin automation API contract`. The Test Plan records both references, and the package runner includes both suites.

### [GATE-COMPLETE] — ✅ PASS | 2026-10-24

**Status upgrade:** verifying → done
TC-01 through TC-03 are checked and each now has an exact verification command, observed result, and matching test reference above. Every Test Plan row identifies its tests; none is silently skipped. The completed task record exists at `.agents/tasks/completed/SECURITY-001.md`, all three implementation tasks are checked, and `## Tasks` points to that archived path. The earlier VERIFY failure and subsequent successful VERIFY remain intact. This completes the program's additive-keyring contract only; it does not authorize or claim a production credential operation.
