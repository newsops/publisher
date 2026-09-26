---
status: done
type: INFRA
tags: [cloudflare, s3, deployment, cost]
---

# INFRA-002: Honest R2 included-usage billing attestation

## Problem

`pnpm deploy:preflight -- --mode=platform` rejects every production profile
unless the object-storage evidence declares `monthlyCapUsd: 0`. The repository
owner selected and activated Cloudflare R2, whose official product terms include
monthly free usage but usage-priced overages. The existing zero-cap rule treats
a free allowance as a provider-enforced spending cap, so it cannot truthfully
represent the selected R2 adapter.

Reproduce this by running the production preflight with an R2 Standard storage
attestation: a truthful record must say that 10 GB-month, 1 million Class A,
and 10 million Class B operations are included, while a nonzero amount beyond
those allowances can be billed. The current `inspectBilling` function rejects
that record solely because `monthlyCapUsd !== 0`.

## Architecture Review

### Affected Scope

- `scripts/deploy/preflight-core.mjs`: validation of production billing
  attestation.
- `scripts/harness/__tests__/free-portable-preflight.test.mjs`: regression
  coverage for accepted/rejected billing records.
- `docs/deployment.md` and `docs/ai-assisted-deployment.ko.md`: operator
  cost-policy, authority, and evidence instructions.
- `docs/work-status.md`: current owner-pilot blockers.

### Alternatives Considered

1. Preserve a hard `$0` attestation requirement. Pro: simple fail-closed
   condition. Con: falsely represents R2 included usage as a spending cap and
   blocks the selected provider even when no paid plan is required.
2. Remove billing evidence entirely. Pro: fewer inputs. Con: hides overage risk
   and eliminates the operator's cost decision record.
3. Represent included usage and possible overage explicitly, while requiring
   operator acknowledgement before production preflight passes. Pro: preserves
   replaceable S3 storage and truthful cost boundaries. Con: cannot impose a
   provider-side hard spending cap that Cloudflare does not offer.

### Decision

Choose alternative 3. The product continues to require only the portable
S3-compatible API subset, never an R2 paid plan or Cloudflare-only runtime.
When an operator selects R2, its attestation records free allowances, that
overage is possible, and the owner acknowledgement that enabled the selected
usage-billed account. Preflight rejects an unacknowledged or internally
inconsistent record. It must not assert a fictitious hard $0 limit.

### Architecture Review Checklist

- [x] Affected packages, deployment surfaces, and documentation are identified.
- [x] Sibling scan completed: current preflight and deployment docs are the
      only production cost-policy paths; no provider SDK or billing API exists.
- [x] At least two alternatives and their trade-offs are documented.
- [x] The selected portable-contract and truthful-attestation trade-off is
      explicit.

## Solution

### Billing attestation contract

- Retain production evidence for database, object storage, and static hosting.
- A record explicitly distinguishes a provider-enforced hard cap from included
  free usage with possible overage. It includes the observed date, provider,
  plan/product, allowances, and whether overage is possible.
- `included-usage` is accepted only when it records all relevant R2 allowances,
  `overagePossible: true`, and a nonempty owner acknowledgement timestamp. It
  never claims a monthly spending cap.
- A hard-zero cost policy remains valid only when an actual provider-enforced
  hard cap is documented; an empty allowance or a false no-overage assertion is
  rejected.

### Boundaries

- The application does not create billing resources, send usage telemetry to a
  provider, or enforce a fictitious monetary limit.
- Operator documentation states that R2 Standard is eligible for the included
  usage but may bill overage; the owner must inspect current provider billing
  before every production release.
- Any provider change still supplies an ordinary S3-compatible endpoint and a
  fresh evidence record. No Cloudflare dependency enters application code.

## Affected Files

- `scripts/deploy/preflight-core.mjs`
- `scripts/harness/__tests__/free-portable-preflight.test.mjs`
- `docs/deployment.md`
- `docs/ai-assisted-deployment.ko.md`
- `docs/work-status.md`

## Completion Criteria

- [x] TC-01: Production preflight accepts a complete R2 included-usage
      attestation that truthfully records free allowances, possible overage,
      and owner acknowledgement.
- [x] TC-02: Production preflight rejects absent acknowledgement, incomplete
      allowance fields, a false no-overage assertion, and expired evidence for
      an included-usage attestation.
- [x] TC-03: Existing hard-zero attestation behavior remains covered and does
      not accept a chargeable record that lacks the included-usage contract.
- [x] TC-04: Deployment documents state that R2 requires no paid application
      feature but has possible usage overage, and identify the attestation
      fields without committing provider credentials.
- [x] TC-05: `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` exit 0
      after the preflight contract change.

## Test Plan

| TC-ID | Test Type     | Tool / Approach                                                                                                           | Notes                                                                    |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| TC-01 | unit          | `free-portable-preflight.test.mjs` → `accepts an acknowledged R2 included-usage record without inventing a hard cap`      | Uses fixture evidence only; no provider account or credential is needed. |
| TC-02 | unit          | `free-portable-preflight.test.mjs` → `rejects unacknowledged, incomplete, false, and stale included-usage records`        | Covers each fail-closed condition independently.                         |
| TC-03 | regression    | `free-portable-preflight.test.mjs` → `accepts current $0 evidence…`; `rejects chargeable…`                                | Ensures strict records remain strict and modes cannot be mixed.          |
| TC-04 | documentation | `repository-documentation-contract.test.mjs` → `documents honest included-usage billing without a fictitious R2 hard cap` | Checks portable contract and absence of committed secrets.               |
| TC-05 | regression    | `pnpm typecheck && pnpm test && pnpm harness:scan`                                                                        | Runs the full repository gates without provider credentials.             |

## Tasks

- [x] `.agents/tasks/completed/INFRA-002.md` — archived after verification
      with one completed task for each completion criterion.

## Evidence Log

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01 through TC-05 are all checked and each has a matching
`[GATE-COMPLETE: TC-N]` entry with an exact command/action and observed result.
The Test Plan names a concrete test file and test case (or full regression
command) for every TC-N; no row is silent or manual-only.
`.agents/tasks/completed/INFRA-002.md` exists with all five tasks checked, and
the active task path is absent; `## Tasks` points to that archived record.
Fresh verification ran `pnpm vitest run --config vitest.harness.config.ts
scripts/harness/__tests__/free-portable-preflight.test.mjs
scripts/harness/__tests__/repository-documentation-contract.test.mjs`, which
passed 2 files / 13 tests. The only output caveats were non-failing local Node
engine and Vite configuration warnings.

### [IMPLEMENTATION / VERIFICATION] — ✅ PASS | 2026-09-13

- **TC-01:** `free-portable-preflight.test.mjs` accepts an R2 Standard fixture
  with 10 GB-month storage, 1 million Class A, 10 million Class B allowances,
  possible overage, and owner acknowledgement without a fictional hard cap.
- **TC-02:** The same contract suite rejects missing acknowledgement, incomplete
  allowance fields, a false no-overage claim, and an attestation older than 30
  days.
- **TC-03:** Existing strict hard-zero acceptance and chargeable-record
  rejection remain covered. A regression also verifies absent object-storage
  keys do not emit a false identical-credentials warning.
- **TC-04:** Deployment and Korean AI-assisted deployment documents define the
  `included-usage` evidence shape and R2 overage boundary; the repository
  documentation contract test asserts those fields.
- **TC-05:** `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` passed:
  32 test files / 136 tests and six scans, with no provider credential used.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`pnpm vitest run --config vitest.harness.config.ts
scripts/harness/__tests__/free-portable-preflight.test.mjs` passed the
`accepts an acknowledged R2 included-usage record without inventing a hard cap`
case. It observed an empty preflight missing list for documented R2 allowances,
possible overage, and acknowledgement.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

The same targeted test command passed `rejects unacknowledged, incomplete,
false, and stale included-usage records`, observing nonempty missing results for
malformed records and the explicit stale-evidence failure.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

The targeted suite passed `accepts current $0 evidence, isolated credentials,
and recovery checksums` and `rejects chargeable, unverifiable,
shared-credential, and missing-recovery states`; strict hard-zero records stay
valid while unclassified chargeable records remain rejected.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

`repository-documentation-contract.test.mjs` passed `documents honest
included-usage billing without a fictitious R2 hard cap`, checking the
`included-usage`, overage, acknowledgement, and policy documentation fields.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

`pnpm typecheck && pnpm test && pnpm harness:scan` passed: 32 files / 136 tests
and six scans. The nonblocking local Node 24 versus declared Node 22 engine
warning did not affect the results.

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter begins the document and declares `status: draft`, `type: INFRA`, and nonempty `tags`.
Problem records the concrete failing `pnpm deploy:preflight -- --mode=platform` behavior and its R2 reproduction condition; it contains no TBD/TODO placeholder.
Architecture Review identifies affected surfaces, records sibling-scan evidence, evaluates three alternatives with pro/con trade-offs, and makes the portable truthful-attestation decision explicit.
Completion Criteria contain five TC-N entries in observable or command form; none uses prohibited vague outcomes.
Test Plan has one nonempty, non-manual strategy and note for each of TC-01 through TC-05.
Tasks placeholder and an otherwise empty Evidence Log were present before this gate entry.

### [GATE-APPROVAL] — ❌ FAIL | 2026-09-13

**Status remains:** review-ready
**Failed criteria:**

- Direct, unambiguous approval for INFRA-002: the conversation records the
  owner's selection and activation of Cloudflare R2 ("그럼 Cloudflare를 채택하자.
  postgreSQL만 어쩔수 없이 neon으로 하는거야" and "R2 활성화 완료"), but it
  does not contain an approval of this new included-usage/possible-overage
  attestation contract or its owner acknowledgement requirement. The later
  standalone "승인함" statements are not tied to this specification.
  **Required action:** Present the R2 included-usage and possible-overage
  attestation decision to the owner and obtain an explicit approval directed
  to INFRA-002 before rerunning this gate.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
The owner gave the direct, unambiguous approval: “INFRA-002 승인”.
The approval names this specification identifier and follows the reviewed R2
included-usage / possible-overage attestation design.
Architecture Review and frontmatter were unchanged after that approval; this
gate appends evidence only and no implementation work has started.

### [GATE-IMPLEMENT] — ❌ FAIL | 2026-09-13

**Status remains:** approved
**Failed criteria:**

- Tasks-file path recorded as an active implementation record: `.agents/tasks/INFRA-002.md` exists and contains one planned task for each of TC-01 through TC-05, but `## Tasks` in this specification still says that the file is “not created until GATE-APPROVAL passes” and leaves its checkbox unchecked. The specification therefore does not truthfully record the created task file as the implementation record required for this status transition.
  **Required action:** Update `## Tasks` to mark and describe `.agents/tasks/INFRA-002.md` as the active task record, then rerun only GATE-IMPLEMENT.

### [GATE-IMPLEMENT] — ❌ FAIL | 2026-09-13

**Status remains:** approved
**Failed criteria:**

- Tasks-file path recorded as an active implementation record: the task file
  `.agents/tasks/INFRA-002.md` exists and has one planned task for each of
  TC-01 through TC-05, but the specification's `## Tasks` section still has
  an unchecked placeholder saying the file will be created after
  GATE-APPROVAL. The required documentation correction was not present at
  retry time.
  **Required action:** Mark `.agents/tasks/INFRA-002.md` as the active task
  record in `## Tasks`, then rerun only GATE-IMPLEMENT.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
The active task record is `.agents/tasks/INFRA-002.md`, and `## Tasks` now
checks and names that path as created after GATE-APPROVAL.
The task record has one planned task for each completion criterion: TC-01
accepts a complete attestation; TC-02 rejects invalid evidence; TC-03 preserves
hard-zero behavior; TC-04 documents the boundary; and TC-05 runs repository
verification.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
All five tasks in `.agents/tasks/INFRA-002.md` are checked complete; its
Blockers section records `None` and no task is pending or blocked.
`pnpm --filter @publisher/site build` exited 0: Next.js compiled, generated 22
static pages, and completed the static post-build and metadata generators.
`pnpm --filter @publisher/site test` exited 0. The only output caveat was the
repository's non-failing Node engine warning (current Node v24.13.0 versus the
declared >=22 <23 range).
This INFRA specification changes preflight validation, tests, and operator
documentation only; it introduces no user-facing UI behavior, so browser
verification and test-account evidence are N/A.
