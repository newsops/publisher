---
status: in-progress
type: SECURITY
tags: [cli, rest, auth, typescript]
authority: delegated
---

# SECURITY-001: Additive Automation Keyrings

## Problem

Production automation keys are stored in Vercel as encrypted environment
variables. The provider intentionally cannot return the existing value to the
CLI, so replacing `ADMIN_AUTOMATION_KEYS` to add a narrowly scoped AI Trend
Times content agent would silently revoke every existing automation key. This
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

| TC-ID | Test Type         | Tool / Approach                                                            | Notes                                                                      |
| ----- | ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| TC-01 | security contract | Existing automation-auth API fixtures with two independently scoped tokens | Preconditions: local hash fixtures only; asserts both rings and redaction. |
| TC-02 | security contract | Malformed/duplicate environment fixture matrix                             | Preconditions: no live environment; asserts 503 fail-closed semantics.     |
| TC-03 | regression        | Focused tests plus `pnpm typecheck && pnpm harness:scan`                   | Documentation uses only variable names and generic examples.               |

## Tasks

- [ ] `.agents/tasks/SECURITY-001.md` — implementation record

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
