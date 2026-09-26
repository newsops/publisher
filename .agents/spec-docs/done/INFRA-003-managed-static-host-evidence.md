---
status: done
type: INFRA
tags: [web, cli, deployment]
---

# INFRA-003: Managed static-host activation evidence

## Problem

The owner selected Cloudflare Pages for the public `www` origin, but production
preflight accepts only `STATIC_DEPLOYMENT_ADAPTER=filesystem`. Supplying a
managed static host therefore fails with `deployment topology: unsupported
static adapter ...` even when the host can perform immutable deployment
promotion and rollback. This blocks the owner-first pilot or tempts an operator
to describe a mutable overwrite as an activation.

Reproduce with `pnpm deploy:preflight -- --mode=platform`, a valid production
environment, and `STATIC_DEPLOYMENT_ADAPTER=managed-static-host`: the current
topology validator rejects the adapter before it can evaluate observed host
activation evidence.

## Architecture Review

### Affected Scope

- `scripts/deploy/preflight-core.mjs`: fail-closed validation of the selected
  static-host adapter and its untracked observed evidence.
- `scripts/harness/__tests__/free-portable-preflight.test.mjs`: accepted and
  rejected managed-host topology regression cases.
- `docs/deployment.md` and `docs/ai-assisted-deployment.ko.md`: portable
  contract, evidence shape, Pages mapping, and operator handoff.
- `docs/work-status.md`: owner-pilot deployment blockers.

### Alternatives Considered

1. Keep filesystem as the sole adapter. Pro: the checked-in worker can perform
   its own pointer swap. Con: rejects the owner's selected static host despite
   host-level atomic promotion and rollback capabilities.
2. Add Cloudflare Pages SDK/runtime bindings to the application. Pro: direct
   provider calls. Con: makes a hosting operator choice an application
   contract, requires provider credentials in product code, and prevents an
   equivalent host from being selected.
3. Accept a provider-neutral `managed-static-host` only with recent,
   operator-owned evidence of a verified candidate, observed activation, and
   observed rollback. Pro: preserves the host's native atomic deployment model
   without a product dependency. Con: evidence is an operational record rather
   than a live provider API proof.

### Decision

Choose alternative 3. `filesystem` remains supported for a self-hosted origin.
`managed-static-host` is a separate, provider-neutral operator adapter: the
application still produces and validates a release candidate, while the host
owns immutable deployment promotion and rollback. Production preflight accepts
it only when a fresh untracked evidence file binds the public origin to a
nonempty host deployment identifier and records candidate verification,
activation, and rollback observation. Cloudflare Pages is documented as one
operator implementation, never imported by application code.

### Architecture Review Checklist

- [x] Affected packages, deployment surfaces, and documentation are identified.
- [x] Sibling scan completed: the only checked-in deployment implementation is
      `FileSystemStaticDeployment`; documentation already requires equivalent
      hosted-host semantics and contains no Pages SDK or credential path.
- [x] At least two alternatives and their trade-offs are documented.
- [x] The selected portable-contract and observed-evidence trade-off is explicit.

## Solution

### Managed-host contract

- Recognize exactly `filesystem` and `managed-static-host`; reject every other
  adapter name.
- `filesystem` retains its absolute `STATIC_DEPLOYMENT_ROOT` requirement.
- `managed-static-host` requires `STATIC_HOSTING_EVIDENCE_PATH` to name a
  readable JSON record no older than 30 days. Its `publicOrigin` must exactly
  match the origin of `PUBLIC_SMOKE_URL`; `deploymentId`, `candidateVerifiedAt`,
  `activationObservedAt`, and `rollbackObservedAt` must be valid nonempty
  observations.
- The evidence contains no API token, account ID, bucket name, or private
  endpoint. A Cloudflare Pages deployment identifier is permitted as an
  operator-observed value, but Pages is not a code dependency.

### Boundaries

- This change does not add a deployment API, queue, proxy, provider SDK, or
  automatic publishing path. It validates an operator-selected host's existing
  atomic deployment/rollback evidence.
- A managed host is not declared production-ready from a successful build or a
  URL alone; candidate verification and a rollback smoke remain required.
- The existing filesystem publication worker stays its own adapter. A future
  portable host-upload/promotion interface needs a separate architecture
  decision before it can run publication jobs against a managed host.

## Affected Files

- `scripts/deploy/preflight-core.mjs`
- `scripts/harness/__tests__/free-portable-preflight.test.mjs`
- `docs/deployment.md`
- `docs/ai-assisted-deployment.ko.md`
- `docs/work-status.md`

## Completion Criteria

- [x] TC-01: Production preflight accepts `managed-static-host` only when its
      fresh evidence binds `PUBLIC_SMOKE_URL` to a deployment ID and records
      candidate verification, activation, and rollback timestamps.
- [x] TC-02: Production preflight rejects an unsupported adapter, missing or
      unreadable host evidence, stale/invalid observation timestamps, and a
      public-origin mismatch.
- [x] TC-03: Existing filesystem acceptance and its absolute deployment-root
      rejection behavior remain covered by regression tests.
- [x] TC-04: Deployment guides explain the provider-neutral managed-host record
      and Cloudflare Pages as an operator mapping without provider credentials
      or an application runtime dependency.
- [x] TC-05: `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` exit 0
      after the deployment-preflight change.

## Test Plan

| TC-ID | Test Type     | Tool / Approach                                                           | Notes                                                                                           |
| ----- | ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| TC-01 | unit          | `free-portable-preflight.test.mjs` managed-host acceptance fixture        | The fixture uses a fresh, non-secret JSON evidence file and a distinct public/admin origin.     |
| TC-02 | unit          | `free-portable-preflight.test.mjs` rejected managed-host fixtures         | Each malformed condition is asserted independently so an empty or stale record cannot pass.     |
| TC-03 | regression    | Existing filesystem preflight tests in `free-portable-preflight.test.mjs` | Uses a temporary absolute root; no real host or credentials are needed.                         |
| TC-04 | documentation | `repository-documentation-contract.test.mjs` plus guide review            | The test checks portable adapter/evidence vocabulary; the guide names Pages only as an example. |
| TC-05 | regression    | `pnpm typecheck && pnpm test && pnpm harness:scan`                        | Runs after unit and documentation coverage; provider secrets are not used.                      |

## Tasks

- [x] `.agents/tasks/completed/INFRA-003.md` — archived implementation record
      for TC-01 through TC-05

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready

- Frontmatter is a YAML block with `status: draft`, valid `type: INFRA`, and nonempty `tags`.
- Problem records the rejected `managed-static-host` adapter message and a reproducible `pnpm deploy:preflight -- --mode=platform` condition.
- Architecture Review has all four checked items, including a completed sibling scan with its result, three pro/con alternatives, and an explicit portability-versus-operational-evidence decision.
- Completion Criteria contain five command/observable TC-IDs (TC-01 through TC-05), each represented exactly once in the Test Plan.
- Every Test Plan row has a test type, concrete tool/approach, and nonempty automated verification note; no manual-only row exists.
- Tasks placeholder and initially empty Evidence Log were present before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved

- The owner explicitly stated “INFRA-003 승인” in the current conversation on 2026-09-13.
- The approval directly names INFRA-003 and unambiguously authorizes this spec’s implementation.
- No Architecture Review or frontmatter `type`/`tags` change occurred after the recorded approval.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress

- `.agents/tasks/INFRA-003.md` exists and is recorded in this spec's `## Tasks` section.
- The task record contains one planned implementation task for each Completion Criterion: TC-01 managed-host acceptance, TC-02 rejection cases, TC-03 filesystem regression, TC-04 documentation, and TC-05 verification.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying

- `.agents/tasks/INFRA-003.md` contained completed TC-01 through TC-05 tasks
  with no blocker before archival.
- `pnpm --filter @publisher/site build` and `pnpm --filter @publisher/site test`
  passed as part of the full verification run.
- The focused managed-host and documentation contract suite passed 2 files / 17
  tests; no browser verification applies because this INFRA specification has no
  user-facing UI behavior.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`pnpm vitest run --config vitest.harness.config.ts
scripts/harness/__tests__/free-portable-preflight.test.mjs` passed
`accepts fresh managed static-host activation evidence`, observing an empty
production-preflight missing list for the fresh non-secret evidence fixture.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

The same focused suite passed `rejects an unimplemented static deployment
adapter` and `rejects incomplete, stale, and mismatched managed static-host evidence`.
It observed failures for missing, unreadable, invalid, stale, and origin-mismatched
records.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

The focused suite passed `preserves filesystem adapter absolute-root validation`,
observing `deployment topology: STATIC_DEPLOYMENT_ROOT must be absolute` for a
relative root while the existing absolute-root fixture remains accepted.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

`scripts/harness/__tests__/repository-documentation-contract.test.mjs` passed
`documents portable managed static-host activation evidence`, checking the
provider-neutral adapter name, evidence fields, and Cloudflare Pages mapping.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

`pnpm typecheck && pnpm test && pnpm harness:scan` passed: site build succeeded,
harness tests reported 32 files / 141 tests, and all six repository scans passed.
The local Node 24 versus declared Node 22 warning was non-failing.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying

- `.agents/tasks/INFRA-003.md` marks TC-01 through TC-05 complete and records no blocker or deferred task.
- `pnpm --filter @publisher/site build` passed: Next.js produced the fully static `apps/site` build and its post-build metadata steps completed.
- `pnpm --filter @publisher/site test` passed (the site package's explicit test command exits 0).
- `scripts/harness/__tests__/free-portable-preflight.test.mjs` covers managed-host acceptance, unsupported adapters, absent/unreadable evidence, incomplete identifiers, stale/invalid observations, origin mismatch, and the existing filesystem absolute-root guard.
- `scripts/harness/__tests__/repository-documentation-contract.test.mjs` asserts the portable evidence vocabulary and Cloudflare Pages mapping in both deployment guides.
- INFRA changes no SCREEN, FLOW, BEHAVIOR, or API user-facing behavior, so browser-verification evidence is not required for this gate.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done

- TC-01 is checked and has `[GATE-COMPLETE: TC-01]` evidence for the focused preflight command, including the observed empty missing list; its Test Plan row names `free-portable-preflight.test.mjs`.
- TC-02 is checked and has `[GATE-COMPLETE: TC-02]` evidence for unsupported, absent, unreadable, invalid, stale, and origin-mismatched managed-host records; its Test Plan row names the rejected-fixture coverage.
- TC-03 is checked and has `[GATE-COMPLETE: TC-03]` evidence for the exact relative-root rejection and retained absolute-root acceptance; its Test Plan row names the filesystem regression coverage.
- TC-04 is checked and has `[GATE-COMPLETE: TC-04]` evidence for `repository-documentation-contract.test.mjs`, whose named test checks the portable adapter/evidence vocabulary and Cloudflare Pages mapping.
- TC-05 is checked and has `[GATE-COMPLETE: TC-05]` evidence for `pnpm typecheck && pnpm test && pnpm harness:scan`, observing 32 files / 141 tests and six passing scans.
- All five Test Plan rows provide concrete automated test references and nonempty verification notes; no test row is silently skipped.
- `.agents/tasks/completed/INFRA-003.md` exists, `.agents/tasks/INFRA-003.md` is absent, and this spec's Tasks section references the archived record.
