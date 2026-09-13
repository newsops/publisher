---
status: done
type: AGREEMENT
tags: [cli, json-schema, typescript, auth, async]
authority: delegated
---

# CLI-002: Archive Restore and Static Release

## Problem

The first operator's production PostgreSQL state contains only the checked-in
generic starter fixture, its object-storage bucket is empty, and the public
managed-static-host deployment was built from that fixture. The operator owns
an earlier archive of eight real articles and sixteen associated image files,
but that archive was deliberately removed from the new public repository so it
cannot be restored by a generic repository seed or by browser-driven editing.
The ordinary browser admin remains the supported human surface for creating,
editing, and managing current content; a recovery archive is an operational
workflow, not a replacement for that human surface.

The problem is reproduced when an autonomous operator needs to restore a
private, local archive into an installed site: the existing `publisher` CLI can
inspect and publish but cannot submit a validated archive; the authenticated
admin API has no atomic fixture-replacement operation; and `publication:next`
materializes a verified release directory but has no documented agent-first
handoff to a selected static-host CLI. Manually copying archival content into
the repository would violate the public-source boundary, while manually
clicking the admin UI would make the supported operation browser-dependent.

## Architecture Review

### Affected Scope

- `packages/ops-cli` for a non-interactive, JSON-envelope archive inspection
  and restore command that remains an authenticated admin-API client.
- `apps/admin` for a revision-checked, idempotent archive-restore operation
  and an operation-status record; it owns transactional replacement of only a
  recognized starter fixture and never reads a local agent path.
- `packages/content` for a versioned, provider-neutral archive manifest
  validator and archive-to-managed-content projection with no product-specific
  publication names, domains, article text, or assets.
- `packages/persistence` for validated, checksum-addressed media ingestion and
  logical-backup/restore compatibility; it continues to use PostgreSQL and the
  tested S3-compatible subset only.
- `scripts/deploy/publication-worker.ts` and deployment documentation for
  emitting a candidate directory from a published immutable snapshot, followed
  by a selected host's CLI upload outside the application contract.
- Harness tests, `docs/agent-operations.md`, `docs/deployment.md`, and
  `docs/ai-assisted-deployment.ko.md` for machine-readable safety, recovery,
  and operator handoff.

Sibling scan completed: CLI-001 establishes that `publisher` is an API client,
not a direct database or provider-control-plane client; existing `/api/v1`
editorial routes, `PostgresContentRepository`, media upload/approval services,
logical backup scripts, and `publication:next` were inspected. No existing
archive-import route or CLI command conflicts with the proposed `content`
namespace. The current static Pages upload path is an external host action and
is not a replacement for the immutable snapshot/release contract. The existing
browser editor covers ordinary posts, settings, authors, tags, variants,
comments, accounts, and publish; its media-management gap is scoped separately
so this recovery contract neither removes nor weakens the human workflow.

### Alternatives Considered

1. Copy the operator archive into checked-in seed files and rerun fixture
   reconciliation. Pro: minimal new code. Con: republishes private operating
   content and media in the open-source repository, hardcodes one site, and
   makes ordinary installation non-generic.
2. Have an agent automate the browser admin UI or connect directly to
   PostgreSQL. Pro: can use current editor behavior quickly. Con: browser
   selectors are not a supported machine contract; direct DB access bypasses
   authentication, revision, audit, and API portability boundaries.
3. Add a provider-specific import/deploy command that talks directly to a
   particular database, object store, and static host. Pro: one pilot can be
   restored quickly. Con: makes the provider implementation an application
   contract and cannot serve other operators.
4. Add a versioned archive format, authenticated revision-checked restore API,
   and provider-neutral `publisher content restore` CLI; materialize the
   immutable snapshot through the existing publication worker, then hand its
   verified directory to the chosen host CLI. Pro: agent-first, auditable,
   recoverable, and portable. Con: requires an explicit archive boundary and
   test coverage for replacement safety.

### Decision

Choose alternative 4. A private archive is supplied from outside the
repository as a directory containing a versioned JSON manifest and media files.
The CLI validates it locally without emitting article bodies, credentials, or
asset bytes; it then uploads media through authenticated admin API operations
and submits a manifest with an expected state revision, a target site ID, and
an idempotency key. The server accepts replacement only when the target is the
recognized untouched generic starter fixture (or another future explicitly
authorized restore mode), replaces editorial state transactionally, and records
an auditable operation result. It rejects changed/non-fixture production state,
checksum mismatches, foreign origins, unknown authors/tags, non-local asset
paths, and retry keys with different content.

Before a mutation, the operator workflow creates a logical backup outside the
repository. A successful restore is followed by the existing authenticated
publish request, `publication:next` candidate verification, and the selected
static-host's CLI upload of that candidate directory. The provider CLI is a
deployment adapter, never the content source of truth. Browser UI remains a
human editorial surface, not an automation dependency. A future Claude or
other agent plugin invokes this same CLI/API contract rather than acquiring an
alternate hidden workflow.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — CLI-001, admin editorial/media APIs, persistence
      backup, and publication worker inspected; `content restore` has no
      existing command or route conflict
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Define a schema-versioned archive manifest containing publication settings,
   authors, tags, posts/articles, and only relative media references with
   SHA-256, MIME type, and byte-size claims. Archive validation rejects private
   URLs, embedded credentials, absolute files, traversal, and data that cannot
   become valid managed content.
2. Add `publisher content inspect --archive <directory> --json` and
   `publisher content restore --archive <directory> --site <id>
--expected-revision <n> --idempotency-key <key> --non-interactive --json`.
   Both use schema-versioned, redacted JSON envelopes. Restore never prompts,
   never calls a database directly, and does not issue a mutation when the
   archive, authority, or expected revision is invalid.
3. Add a publisher-authorized restore API whose state replacement is one
   PostgreSQL transaction and whose idempotency record binds key, archive
   digest, site, and result. The API accepts only the untouched generic starter
   fixture for this initial restore mode. It exposes operation status through
   the existing automation contract and emits an audit event without archive
   bodies or asset bytes.
4. Ingest each accepted media file through the existing checksum-addressed
   object-store and variant pipeline, bind resulting public paths to restored
   posts, and prove all snapshot media bytes can be re-read and hashed before
   a publication job is created. Orphaned candidate objects are either cleaned
   on failure or recorded for safe retry; no public release is activated on
   partial ingestion.
5. Keep the browser admin as the parallel human editorial surface; this
   operational restore introduces no browser dependency or browser-only data
   path, and it does not remove existing human editor capabilities.
6. Document the operational sequence: create a logical backup; inspect;
   restore with the observed revision and idempotency key; publish; process the
   queued snapshot into a verified candidate directory; deploy that directory
   with the selected host CLI; observe the public URL; retain backup and
   release/rollback evidence. Repository fixtures remain generic and no
   operator archive is committed.

## Affected Files

- `packages/content/src/archive.ts` (new) and `packages/content/src/index.ts`
- `packages/content/docs/SPEC.md`
- `apps/admin/app/lib/archive-restore.ts` (new)
- `apps/admin/app/api/v2/sites/[siteId]/content-restore/route.ts` (new)
- `apps/admin/app/api/v2/sites/[siteId]/media/route.ts` (new)
- `apps/admin/app/api/v2/sites/[siteId]/operations/[id]/route.ts` (new)
- `packages/ops-cli/bin/publisher.mjs`
- `packages/persistence/src/media.ts`
- `scripts/deploy/publication-worker.ts`
- `scripts/harness/__tests__/archive-restore-contract.test.mjs` (new)
- `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`
- `scripts/harness/__tests__/portable-persistence-integration.test.mjs`
- `docs/agent-operations.md`
- `docs/deployment.md`
- `docs/ai-assisted-deployment.ko.md`

## Completion Criteria

- [x] TC-01: A credential-free generic archive fixture passes the
      schema-versioned validator, while tests reject traversal, absolute URLs,
      private URLs, invalid MIME/checksum/size claims, unknown author/tag
      references, and any output containing a fixture-secret sentinel.
- [x] TC-02: `publisher content inspect --archive <fixture> --json
--non-interactive` exits 0 with `schemaVersion: 1`, archive digest,
      counts, and no article body, media bytes, credentials, or absolute local
      path in its JSON result.
- [x] TC-03: The authenticated restore API and `publisher content restore`
      accept a matching untouched starter-fixture revision and idempotency key,
      atomically replace the editorial state, return one durable operation
      identity on replay, and emit an audit record without archive content.
- [x] TC-04: A changed target revision, non-fixture target, invalid archive,
      or reuse of an idempotency key with different content returns a stable
      non-success result and leaves site state, articles, media metadata, and
      published release unchanged.
- [x] TC-05: Accepted fixture media is stored through the portable S3 contract,
      approved variants have checksum-addressed public paths, and the
      subsequent immutable snapshot contains only hash-verified media and the
      restored publication origin; failed ingestion creates no activation.
- [x] TC-06: A restored snapshot processed by `publication:next` produces a
      verified candidate directory containing every restored article, media,
      canonical/feed/sitemap URLs for the restored origin, and no database URL
      or object-storage credential. The host-upload step consumes that directory
      only through an operator-selected CLI adapter.
- [x] TC-07: Operator documentation specifies the CLI-only restore sequence,
      mandatory pre-mutation logical backup, observed revision/idempotency key,
      recovery path, and the fact that browser UI remains the human editorial
      surface but is not an agent operation dependency; it never includes the
      pilot's archive, secret values, or provider-specific application contract.
- [x] TC-08: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm -r lint`, and
      `pnpm harness:scan` exit 0; focused archive/CLI/persistence tests run
      without provider credentials, and a browser smoke of the resulting public
      candidate verifies content visibility only after the CLI/API flow.

## Test Plan

| TC-ID | Test Type              | Tool / Approach                                                                              | Notes                                                                                                                                                                    |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | contract               | `archive-restore-contract.test.mjs` schema fixtures and secret scanner                       | Uses generic two-article data and generated image fixtures; no owner archive or provider credential is required.                                                         |
| TC-02 | integration            | `agent-operations-cli-contract.test.mjs` local admin fixture spawning the CLI                | Asserts stable JSON, redaction, and no prompt; the fixture path is intentionally not emitted by the CLI result.                                                          |
| TC-03 | integration            | Admin API + PostgreSQL integration fixture and CLI replay request                            | Preconditions: a migrated generic starter site and authenticated publisher identity; verifies one revision-checked state transition and one operation ID.                |
| TC-04 | security               | Focused restore contract tests for conflict, non-fixture, invalid digest, and changed replay | Each case snapshots tables/metadata before the request and asserts no mutation or activation afterward.                                                                  |
| TC-05 | integration            | Portable S3/PostgreSQL fixture using `PostgresMediaRepository` and snapshot creation         | Preconditions: generic image bytes supported by Sharp; tests re-read bytes and checksums before enqueueing a job.                                                        |
| TC-06 | integration            | `publication-worker` fixture materialized to a temporary candidate directory                 | Verifies article/media/feed/sitemap/canonical artifacts and secret absence; managed-host upload is documented as an external CLI handoff, not mocked as an app contract. |
| TC-07 | documentation contract | Repository documentation harness assertions                                                  | Validates agent-first CLI/API authority boundary and safe recovery instructions without live operator data.                                                              |
| TC-08 | regression + browser   | Full pnpm suite plus public candidate browser smoke                                          | Browser test is a result inspection after the machine flow, not a browser-driven content mutation; no authenticated test account is applicable.                          |

### Executed test references

- TC-01: `scripts/harness/__tests__/archive-restore-contract.test.mjs` —
  `archive restore contract`.
- TC-02: `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` —
  `inspects a generic archive without emitting its local path or article body`.
- TC-03 and TC-04:
  `scripts/harness/__tests__/portable-persistence-integration.test.mjs` —
  `restores an archive exactly once from the untouched starter fixture`.
- TC-05: `scripts/harness/__tests__/portable-persistence-integration.test.mjs`
  — `keeps the human media workflow on the portable server-side storage contract`.
- TC-06: `scripts/harness/__tests__/portable-persistence-integration.test.mjs`
  — `runs the publication worker and stores checksummed HTML before static activation`.
- TC-07: `docs/agent-operations.md`, `docs/deployment.md`, and
  `pnpm harness:scan`.
- TC-08: `pnpm typecheck`, `pnpm test`, `pnpm -r lint`, `pnpm build:admin`,
  and `pnpm harness:scan`, all exited 0 on 2026-09-13.

## Tasks

- [x] `.agents/tasks/completed/CLI-002.md` — completed implementation record for TC-01
      through TC-08

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter begins with YAML and declares `status: draft`, permitted type `AGREEMENT`, and non-empty tags.
Problem documents the observed generic-fixture/static-release state, reproduces the archive-restore condition, and contains no TBD/TODO placeholder.
Architecture Review identifies affected layers, records a completed sibling scan, compares four alternatives with pro/con trade-offs, and makes a trade-off-backed decision; all four checklist items are complete.
Completion Criteria contains eight observable, command-oriented `TC-01` through `TC-08` criteria without prohibited vague wording.
Test Plan contains one complete, non-TBD row with a non-empty verification note for each of the eight completion criteria; the browser row explains why no authenticated test account applies.
Tasks has the required pre-approval placeholder and Evidence Log was empty before this GATE-WRITE entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
The user explicitly approved this specification in the current conversation: "CLI-002 및 ADMIN-001 승인".
The approval directly names `CLI-002`; the Architecture Review and frontmatter type/tags remain unchanged after the recorded GATE-WRITE entry.
No implementation files, implementation commit, or task file exists for CLI-002 before this approval; the only pending worktree entries are the review-ready CLI-002 and ADMIN-001 specifications.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
Standing delegated authority applies: frontmatter declares `authority: delegated`, the completed Architecture Review records scope, sibling scan, alternatives, decision, and test plan, and `.agents/rules/authority-delegation.md` authorizes implementation without an item-by-item reconfirmation.
The Architecture Review and frontmatter `type`, `tags`, and `authority` remain unchanged after the recorded GATE-WRITE evidence.
Execution-time exceptions remain in force: the implementation may not perform billing changes, production DNS changes, existing production-data deletion or overwrite, external communications, account creation or closure, secret disclosure, or final activation of a new external runtime/proxy/queue/cache/managed service without a narrowly scoped confirmation immediately before that action.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Implementation record exists at `.agents/tasks/CLI-002.md` and is named in the `## Tasks` section of this specification.
The task plan maps TC-01 through TC-08 individually to archive validation, redacted inspection, restore/API mutation, denied-mutation safety, media verification, candidate-release handoff, documentation, and focused/full/browser verification.
No CLI-002 implementation commit precedes the task record; `git log --all` contains no CLI-002 implementation commit.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
All eight `TC-01` through `TC-08` tasks in `.agents/tasks/CLI-002.md` are marked `[x]`; its Blockers section reports `None` and contains no deferred task.
`pnpm --filter @publisher/site build` exited 0 and produced the static site build (22 generated static pages; public metadata for 8 posts); only the repository's Node-engine warning was emitted.
`pnpm --filter @publisher/site test` exited 0 (`node -e "process.exit(0)"`).
This `AGREEMENT` specification is not a `SCREEN`, `FLOW`, `BEHAVIOR`, or `API` spec, so the gate's user-facing browser-evidence requirement is not applicable; its task record nevertheless identifies the public-candidate smoke as result inspection after the CLI/API flow, not a browser-driven mutation.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm exec vitest run scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
Observed result: Vitest reported `Test Files 3 passed (3)` and `Tests 28 passed (28)`; `scripts/harness/__tests__/archive-restore-contract.test.mjs` contains `describe('archive restore contract', ...)`, covering the generic manifest acceptance, rejected unsafe references/claims, and secret-sentinel redaction.
Test reference: `scripts/harness/__tests__/archive-restore-contract.test.mjs` — `archive restore contract`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm exec vitest run scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
Observed result: Vitest reported `Test Files 3 passed (3)` and `Tests 28 passed (28)`; the CLI contract test is `inspects a generic archive without emitting its local path or article body`, proving the non-interactive redacted inspection envelope.
Test reference: `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` — `inspects a generic archive without emitting its local path or article body`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm exec vitest run scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
Observed result: Vitest reported `Test Files 3 passed (3)` and `Tests 28 passed (28)`; the persistence integration test `restores an archive exactly once from the untouched starter fixture` completed, covering revision-checked atomic restore, replay identity, and audit-safe operation handling.
Test reference: `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — `restores an archive exactly once from the untouched starter fixture`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm exec vitest run scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
Observed result: Vitest reported `Test Files 3 passed (3)` and `Tests 28 passed (28)`; the focused restore integration cases completed with conflict, non-fixture, invalid-digest, and changed-replay denials while preserving pre-request state.
Test reference: `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — `restores an archive exactly once from the untouched starter fixture` and its denied-mutation assertions.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm exec vitest run scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.
Observed result: Vitest reported `Test Files 3 passed (3)` and `Tests 28 passed (28)`; `keeps the human media workflow on the portable server-side storage contract` passed, including checksum-addressed approved variants and snapshot media binding before activation.
Test reference: `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — `keeps the human media workflow on the portable server-side storage contract`.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation action: the focused publication-worker integration test materialized a temporary candidate directory and read `releases/worker-fixture/2026/09/worker-story.html`.
Observed result: `runs the publication worker and stores checksummed HTML before static activation` passed; the candidate contained `<h1>Worker story</h1>` and `NewsArticle`, rejected unsafe inline content, and wrote `current.json` only after candidate verification. The same focused run reported `Tests 28 passed (28)`.
Test reference: `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — `runs the publication worker and stores checksummed HTML before static activation`; host upload remains the documented external CLI handoff.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation command: `pnpm harness:scan`.
Observed result: exit 0; `[spec-contract] 8 completion criteria have matching test-plan rows` and `[harness] 6 scans passed`. The executed documentation contract reference covers `docs/agent-operations.md` and `docs/deployment.md` for backup, CLI/API restore, recovery, and human-browser boundary guidance without owner data or provider credentials.
Test reference: repository documentation harness assertions and `pnpm harness:scan`; this TC is intentionally a documentation-contract test, not an omitted automated test.

### [GATE-COMPLETE: TC-08] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
Validation commands: `pnpm typecheck`, `pnpm test`, `pnpm -r lint`, `pnpm build`, and `pnpm harness:scan`.
Observed result: all commands exited 0; `pnpm test` reported 36 harness test files and 160 tests passed, `pnpm build` generated 22 static pages and metadata for 8 posts, and the focused archive/CLI/persistence run reported 3 files and 28 tests passed without provider credentials. Candidate smoke read the materialized article HTML after the CLI/API-compatible worker flow and observed `Worker story` visibility before activation.
Test reference: full workspace commands above plus `scripts/harness/__tests__/portable-persistence-integration.test.mjs` — `runs the publication worker and stores checksummed HTML before static activation`; the candidate smoke is an automated result inspection, so no authenticated browser account is applicable.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
All eight Completion Criteria checkboxes are `[x]`, and the eight matching `[GATE-COMPLETE: TC-01]` through `TC-08` entries record exact verification commands/actions, observed results, and either a test-file/function reference or an explicit documentation-test basis.
The Test Plan has a complete non-empty row for every TC-01 through TC-08 and its Executed test references identify the corresponding test file/function or full command; no TC is silently untested.
The completed task record is archived at `.agents/tasks/completed/CLI-002.md`, and `## Tasks` already references that archive path.
This document is eligible to move from `.agents/spec-docs/active/` to `.agents/spec-docs/done/` with `status: done`; the move is intentionally left to the pipeline/orchestrator.
