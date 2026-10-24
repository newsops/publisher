---
status: done
type: INFRA
tags: [web, mobile-web, cli, typescript, auth, async]
authority: delegated
---

# INFRA-007: Operating-installation recovery and publication continuity

## Problem

An installation that already operates multiple publications cannot safely use
the current logical backup as a complete recovery copy. In
`packages/persistence/src/recovery.ts`, the admin table inventory covers only
the initial migration. Later site registry, account, membership, guidance and
archive-operation tables are omitted without failing verification. Capture
also executes separate pooled reads without a shared database snapshot, so
concurrent changes can produce a checksum-valid but inconsistent backup.

The editorial interchange path is not a substitute. When an archive post omits
`status`, `validateEditorialArchive` defaults it to `published`; the real API
then passes that result into `validatedPost`, which rejects publication
without desk review. The existing restore integration bypasses this validator
chain. EditorialArchive does not carry complete private identities, revisions,
review history, multilingual state, settings, accounts or comments.

Current incremental publication also reproduces stale public output after
adapter or comment-runtime changes, RSS body edits and home-lead author edits.
The consent runtime injects an inline style element rejected by generated
`style-src 'self'`, while comment and verification origins are absent from
generated CSP. These affect continued operation independently of migration.

ARCH-008 remains the approved but incomplete local-first target. Current web
management and CLI still use the hosted PostgreSQL composition. Passing a
partial operator-core proof or an article-only import must not be described as
a completed local migration or permission to retire the working installation.

## Architecture Review

### Affected Scope

Layer identifiers refer to `scripts/harness/layer-map.json`.

- **L0 contract — `packages/content/src/archive.ts`,
  `packages/content/docs/SPEC.md`:** make editorial interchange draft-only at
  its existing validation boundary. Preserve the distinction between draft
  import and recovery of true existing editorial status and review evidence.
- **L1 adapters — `packages/persistence/src/{recovery,postgres,migrations,index}.ts`,
  `packages/persistence/migrations/{admin,comments}/**`,
  `packages/persistence/docs/SPEC.md`:** retain the existing public recovery
  exports `createLogicalBackup`, `verifyLogicalBackup`,
  `restoreLogicalBackup`, `LogicalBackup` and `PersistenceScope`; version their
  contract and define exact schema coverage, consistent capture, authority
  classification and atomic empty-target restoration. Migration files are
  inspected as provenance, not rewritten as part of recovery.
- **L1 adapters — `apps/admin/app/lib/adapters/archive-restore.ts`:** retain
  revision, site, approved-media, starter-only and idempotency checks; reject
  non-draft interchange before any mutation without manufacturing review.
- **L2 publication — `packages/publication/src/static-{types,core-recipes,article-recipes,indexes,index-data,runtime-recipes,renderers,policy,host-policy}.ts`,
  `packages/publication/docs/SPEC.md`:** declare every public head/runtime and
  rendered semantic dependency; emit normal same-origin consent CSS and exact
  validated runtime origins. Create the missing nine-section package contract
  before implementation, grounded in its actual exports.
- **L3 composition — `apps/admin/app/lib/{repository,index}.ts` and existing
  restore service composition:** inspect current callers for recovery input
  changes; do not introduce a new service, authoritative store or migration
  executor.
- **L4 HTTP/public surfaces —
  `apps/admin/app/api/v2/sites/[siteId]/content-restore/route.ts`,
  `apps/site/**`:** exercise the real archive validation-to-restore chain and
  generated static output. No new route, browser panel or runtime API is
  allocated.
- **L5 operators/harness — `packages/ops-cli/**`,
  `packages/admin-client/**`, `packages/persistence/scripts/**`,
  `scripts/deploy/publication-worker-core.ts`,
  `scripts/harness/{static-preview.mjs,__tests__/**}`:** inspect existing
  archive/recovery callers and add real SQL, artifact and strict-header browser
  regressions. Update existing caller types only where the recovery signature
  requires it; no diagnostic command, client method or capability exception.
- **L5 documentation — `docs/deployment.md`,
  `docs/design/operating-installation-continuity.md`,
  `.agents/spec-docs/done/WEB-001-static-public-site-and-admin.md` and relevant
  package specifications:** provide one neutral continuity-runbook entry point
  linked from deployment and the platform spec; identify incomplete local
  capabilities rather than weakening ARCH-008 acceptance.

Sibling scan: current migrations own the complete current relational schema;
`surface-map.json` owns recovery and archive restoration, and the OpenAPI
document already owns the site-scoped content-restore route. This increment
adds no public identifier, route, CLI grammar or alias and therefore shadows
none. ARCH-007 renamed the current Adapter schema/runtime but did not rewrite
historical immutable snapshots. ARCH-008 owns complete local product cutover;
SECURITY-002 owns the wider analytics-consent feature. This spec repairs the
reproduced current-runtime dependency/CSP defects without claiming either
larger feature complete or adding a compatibility renderer.

### Alternatives Considered

1. **Repair current installation recovery and public output, with domain-level
   rehearsal assertions.** Pro: protects operating data and current releases
   using existing boundaries; catches both missing SQL tables and lost domain
   relationships. Con: does not itself provide a complete PostgreSQL-to-local
   importer or eliminate current hosted infrastructure.
2. **Build a new portable domain bundle and migration-readiness API/UI/CLI
   immediately.** Pro: could eventually hide source SQL schemas behind a
   per-publication migration interface. Con: adds a second format and broad
   surface before the local receiver, media closure, authority and comment
   lifecycle are complete; a partial report could imply false readiness.
3. **Use EditorialArchive or a raw database dump alone.** Pro: reuses a small
   existing interchange path or an independent database recovery tool. Con:
   interchange loses private lifecycle state; a dump alone proves neither
   media availability, publication compatibility nor local capability parity.

### Decision

Choose alternative 1. The recovery module owns one exact current-schema
inventory and all SQL consistency/ordering checks. Its isolated round-trip
tests additionally compare domain identities, relationships and editorial
meaning. Keep EditorialArchive narrow and draft-only, and repair publication
dependencies and CSP in their current owners. A generic runbook separates
current-runtime upgrades from the still-blocked full local cutover.

No new hosted service, provider role, runtime layer, migration framework or
legacy mode is introduced. Old immutable releases remain historical data, not
new-runtime inputs that are silently rewritten. Ordinary code and documentation
repairs use delegated authority. Any actual production writer freeze, secret
transfer, restoration, deployment, DNS change, service shutdown or overwrite
retains its separate execution-time authority gate.

### Architecture Review Checklist

- [x] Affected packages, layers, files and existing public exports are listed.
- [x] Sibling scan completed for current migrations, capability/API ownership, Adapter history, ARCH-008 and consent scope; no new identifier shadows an existing surface.
- [x] At least two structurally different alternatives are compared with benefits and costs.
- [x] Decision and trade-offs are recorded, including incomplete local cutover, private-media closure and execution-time authority.

## Solution

### Complete current-runtime recovery

Emit one new logical-backup format version. Describe every current admin or
comments table with an explicit preservation policy, stable row ordering,
column/JSON handling and restore order. Capture exact applied migration versions
and checksums as provenance; compare them with the supported source/target
schema rather than importing a migration ledger as ordinary application rows.
Unknown, missing, unsupported or mixed-schema inventories fail before a backup
is claimed complete. Unsupported older backup formats fail explicitly; there
is no implicit conversion or compatibility mode.

`createLogicalBackup` acquires one dedicated pool connection and performs
schema/provenance inspection and all selected table reads inside one
`REPEATABLE READ READ ONLY` transaction, releasing it on both success and
failure. Admin and comments databases have independent captures; no global
atomicity is claimed across them. A final cross-database cutover needs an
explicit writer/intake boundary and late-comment reconciliation.

Preserve all durable current-schema domains: site catalog/state, stable
article identities and locale relationships, source/review revisions and
timestamps, taxonomy kinds, authors/personas, adapter configuration, media
metadata/variants, release records, jobs, audit events, accounts/site ACLs,
guidance and archive-restore idempotency records. Preserve comment moderation,
site scope and current durable rate-limit state in the comments scope.
Restore existing editorial status/review evidence exactly; do not reconstruct
it from the lossy interchange format.

Classify `account_sessions` explicitly as invalidated-on-restore and leave the
restored table empty. Preserve durable account identities and ACL relationships.
Account password verifiers remain sensitive reusable authentication material
in a full current-runtime recovery copy; session invalidation is not password
rotation or revocation of copied credentials. The runbook requires deliberate
credential review/rotation before externally activating a recovered instance.
Recovery does not automatically change or rehash stored passwords.
Environment keyrings, provider credentials and external agent-token authority
are not transferred or neutralized by this module. The backup remains private
sensitive material, not a public export or an encrypted artifact merely
because it has checksums.

Verify exact table/column policy, row counts, schema provenance and digests
before mutation. Restore only to a supported migrated target with all managed
application tables empty, in one transaction with foreign-key-safe order and
identity-sequence handling. Verify restored durable data inside that transaction
before commit, accounting explicitly for invalidated sessions. A rejected
target or restore/verification failure leaves no partial restored rows.

### Honest draft interchange

Change `validateEditorialArchive` so omitted status means `draft`. Explicit
non-draft status, including `published`, `scheduled` and `review`, is rejected
with an actionable draft-import error rather than silently downgraded.
`restoreArchive` enforces the same invariant even for a typed caller that skips
JSON validation. The API, CLI and client continue using their existing route
and request shape; no new import option is required. The real validator-to-SQL
chain must import a draft without fabricated desk approval and retain current
revision/media/site/idempotency constraints.

Document that EditorialArchive is content interchange for an untouched starter,
not a full private backup or operated-site migration. True published state and
review fidelity belong to complete recovery or the future controlled importer.

### Deterministic publication and strict CSP

Declare shared public-head/runtime inputs for every HTML consumer. Enabling,
changing, disabling or removing an adapter and changing comment submission or
verification configuration must invalidate the HTML that renders those values.
Declare RSS body and every rendered lead-author field as dependencies. Verify
clean and incremental artifacts are equivalent for the same inputs while
unaffected semantic artifacts remain reusable.

Move consent styling from dynamically injected inline CSS to a versioned,
same-origin stylesheet emitted by the release graph and linked before the
consent layer can appear. Keep `style-src 'self'`; do not add unsafe-inline,
wildcards or permissive CSP fallback. Consent remains opt-in and rejects
analytics network activity before a stored or explicit grant.

Validate comment and human-verification configuration at the publication input
boundary. Derive only required, exact credential-free origins for
`connect-src`, `script-src` and `frame-src` from the selected configuration,
using explicit provider-neutral capability data when an iframe requires an
origin beyond its script origin. Invalid or missing required origin data fails
the build; it never widens the policy or silently disables required comments.
These capabilities participate in dependency digests. Real HTTP response
headers, not a header-free preview or DOM stub, are required browser evidence.

### Neutral migration and upgrade runbook

The canonical runbook includes a per-publication acceptance matrix for settings
and canonical URLs, article/locale IDs and revisions, Markdown and rendered SEO,
taxonomy, authors/personas, guidance, image originals/variants/credits and
digests, adapter/analytics settings, comments, account/site permissions and
release/operation/idempotency history. Counts alone do not establish fidelity.
Keep operated evidence outside the repository.

For the breaking Adapter runtime upgrade, preserve the existing verified
public release, freeze old writers and drain/reconcile queued or unknown work
with the matching original worker before applying schema/runtime changes.
Rehearse the complete backup and media/object copy in an isolated environment;
then coordinate admin, CLI and worker versions. New-runtime publication uses
a fresh supported snapshot and operation identity, not old-contract snapshot
reuse. Public artifact rollback and admin/schema recovery are separate plans;
rolling old code onto the renamed schema is not a rollback.

Private recovery copies require encryption and authenticated provenance before
remote storage, complete original/variant/snapshot/artifact closure, separately
held recovery material and key/credential review. A logical SQL file alone is
not media recovery, an encrypted local-first bundle or proof of provider-key
revocation. Current production data stays untouched in this increment.

List full local cutover as blocked while direct-core CLI and independent full
browser capability parity, local authentication/key lifecycle, complete private
media recovery, encrypted comment intake/moderation and inspectable publication
activation remain unfinished. Do not mark ARCH-008 criteria complete from
these bounded repairs, stop existing services or switch either live publication
to the partial operator package.

## Affected Files

- `packages/persistence/src/{recovery,postgres,migrations,index}.ts` and `packages/persistence/docs/SPEC.md`.
- `packages/content/src/archive.ts` and `packages/content/docs/SPEC.md`.
- `apps/admin/app/lib/adapters/archive-restore.ts` and existing composition callers if the recovery signature changes.
- `apps/admin/app/api/v2/sites/[siteId]/content-restore/route.ts` and existing API/CLI archive contract documentation.
- `packages/publication/src/static-{types,core-recipes,article-recipes,indexes,index-data,runtime-recipes,renderers,policy,host-policy}.ts` and new `packages/publication/docs/SPEC.md`.
- `packages/persistence/scripts/**`, `scripts/deploy/publication-worker-core.ts` and existing recovery callers where required by the new backup contract.
- `scripts/harness/__tests__/{portable-persistence-integration,archive-restore-contract,incremental-publication-contract,visitor-analytics-consent-contract,google-analytics-adapter}.test.mjs`, focused new recovery/publication tests and a strict-header fixture in `scripts/harness/static-preview.mjs` or an adjacent test helper.
- `docs/design/operating-installation-continuity.md`, `docs/deployment.md`, `.agents/spec-docs/done/WEB-001-static-public-site-and-admin.md` and affected API/package contracts.
- This spec and its post-approval task record.
- Existing package test selection and `.github/workflows/verify.yml` wire the
  new behavior suites and independent-connection regression into the current
  clean-room job. This changes test execution only, not deployment behavior.

## Completion Criteria

- [x] TC-01: A current-schema admin or comments backup identifies its new format, exact schema inventory and migration checksums; an unknown/missing table, column or migration produces an explicit unsupported-schema error instead of a success artifact.
- [x] TC-02: Restoring a two-publication current-schema SQL fixture preserves every durable row, identity, relationship, JSON payload, revision and editorial/review value, including site ACLs, guidance, comments and restore idempotency; restored account sessions contain zero rows and reusable account authority is explicitly classified.
- [x] TC-03: A concurrent second connection mutating related source records during capture cannot produce a mixed-revision backup; all reads occur on one repeatable-read snapshot and connections are released after capture success or failure.
- [x] TC-04: Corrupt digests, unsupported format/provenance, missing or extra policy data, a nonempty target and injected restore/verification failure reject without committed partial application rows; successful restore also restores usable identity-sequence progression.
- [x] TC-05: The real archive JSON validator-to-restore path accepts omitted or explicit draft status as a draft without desk approval; explicit review/published/scheduled input fails before mutation, and existing stale-revision, media, site and idempotency protections remain observable.
- [x] TC-06: For adapter enable, public ID change, disable/removal and comment-runtime/verification changes, actual incremental HTML bytes match a clean build for every HTML consumer; the affected head/comment markup changes and unrelated artifacts remain reusable.
- [x] TC-07: Editing only an RSS-rendered body or lead author's name/path updates the feed or rendered lead/byline respectively; incremental artifacts equal clean output for the same inputs rather than retaining prior content.
- [x] TC-08: A real desktop and mobile browser served generated strict headers displays the externally styled consent controls, emits no analytics request before consent, persists rejection and loads analytics only after explicit grant; generated HTML references same-origin CSS with no inline-style CSP exception.
- [x] TC-09: A strict-header browser allows configured comment submission and verification script/frame requests using only the validated exact required origins; invalid configuration rejects publication and unrelated origins are not admitted by the generated policy.
- [x] TC-10: Deployment and the platform spec link one neutral continuity runbook containing the domain acceptance matrix, isolated full-recovery/media rehearsal, version-aligned old-worker drain, session/credential policy, distinct artifact/schema rollback and explicit incomplete ARCH-008 blockers; no procedure claims draft interchange or a partial local proof is migration completion.
- [x] TC-11: `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm harness:scan` exit 0 with the new contracts and regressions; the diff contains no operated identities, private recovery material, compatibility runtime, new diagnostic surface or deployment side effect.

## Test Plan

All automated cases below ran on Node 22.23.4. The independent-connection
cases used only a disposable loopback PostgreSQL 16 server.

| TC-ID | Test Type                        | Tool / Approach                                                                                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | SQL contract                     | `scripts/harness/__tests__/logical-recovery-contract.test.mjs`, census/provenance parameterized cases                                                                   | Complete migrated admin/comments fixtures. Missing/extra tables or columns and changed migration SHA reject instead of yielding a success artifact.                                                                                                                                                                                                                                        |
| TC-02 | Semantic SQL recovery            | Same recovery suite, "preserves two sites..." and "round-trips site-scoped comments..."                                                                                 | Actual repositories create approved/review posts, locale variants, distinct category/tag, personas, guidance, accounts and site ACLs. Exact rows/domain reads, all moderation states and idempotency replay match. Sessions are absent; password verifiers remain sensitive. Nonowners are denied by the current role boundary, not granted membership-driven browser access.              |
| TC-03 | Concurrent SQL integration       | Same recovery suite, "captures related records from one repeatable-read snapshot across a committed concurrent writer"                                                  | Two distinct real PostgreSQL backend PIDs, deterministic write barrier, old related revisions together and new writer revision observed separately. Isolation/read-only settings and released connections are asserted. CI executes this case on disposable PostgreSQL.                                                                                                                    |
| TC-04 | Transaction faults               | Same recovery suite, malformed/tampered input, drifted/nonempty target, insert/verification, identity restart and resurrected-session cases                             | Migrated empty targets are compared before/after rejected operations. Failure leaves no committed application rows. New audit identity and lossless JSONB/bigint/UTC timestamps are asserted.                                                                                                                                                                                              |
| TC-05 | Validator and SQL races          | `archive-restore-contract.test.mjs`, archive cases in `portable-persistence-integration.test.mjs`, `archive-starter-safety.test.mjs` under `scripts/harness/__tests__/` | Authorized synthetic starter and approved scoped media. Omitted/explicit draft succeeds without approval. Explicit non-draft, stale revision, altered category or independent article inventory, wrong media/site and changed idempotency reject without mutation. True PostgreSQL concurrent insert/variant cases prove the lock protects the check/replace boundary.                     |
| TC-06 | Artifact equivalence             | `scripts/harness/__tests__/publication-continuity.test.mjs`, "matches clean bytes..." and static-comment-bootstrap cases                                                | Populated article/home/category/author/archive/search fixture with prior manifest. Adapter enable/change/disable/removal and comment/verification changes match clean bytes. Unaffected artifacts remain reused; first static comment projection updates one article and later bodies update no HTML.                                                                                      |
| TC-07 | Artifact equivalence             | Same publication suite, "updates an RSS body-only edit and lead byline name/path edits"                                                                                 | Body/name/path changes keep unrelated timestamps fixed. Actual feed/byline bytes change and match the clean release.                                                                                                                                                                                                                                                                       |
| TC-08 | Runtime and real browser         | `visitor-analytics-consent-contract.test.mjs`, publication external-CSS case and `scripts/harness/continuity-preview.mts`                                               | Anonymous Chrome at actual 2560x1267 and 390x844 under generated CSP/cache headers. First visit, reject/reload, reopen/settings and explicit grant observed. External fixed CSS, no inline style, no pre-grant GA loader; native Network shows collection after grant and zero collection matches after rejection/reload. DOM stubs are not the browser evidence.                          |
| TC-09 | Config/CSP and real browser      | Publication exact-origin/rejection cases, `scripts/harness/__tests__/publication-runtime-config.test.mjs`, same HTTP browser fixture                                    | Separate controlled comment/script/frame/connect origins. Real GET/POST and all verification requests observed; synthetic UI returns "Submitted for moderation." Invalid origins/capabilities/booleans and undeclared/unsafe/duplicate CSP directives reject. No reader production mutation.                                                                                               |
| TC-10 | Independent documentation review | `docs/design/operating-installation-continuity.md`, deployment/platform/package links and independent source review                                                     | Manual semantic review is required because link/regex checks cannot prove an executable preservation plan. Both review findings resolved: old-schema native capture precedes isolated migration; starter edits cannot be overwritten. Matrix, media closure, encryption, credentials, queue drain, rollback and ARCH-008/ACL blockers are explicit. No actual operated cutover is claimed. |
| TC-11 | Repository gates                 | `pnpm build`, `pnpm build:admin`, `pnpm typecheck`, `pnpm -r lint`, `pnpm test`, `pnpm harness:scan`                                                                    | All exit 0. Root full run: 76 harness suites / 472 tests, no skipped concurrency cases; all package suites and 13 scans pass. Staged program privacy checked. Existing CI clean-room wiring executes real concurrent cases. Production deployment remains outside scope.                                                                                                                   |

## Tasks

- [x] `.agents/tasks/completed/INFRA-007.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-10-24

**Status upgrade:** draft → review-ready

- Frontmatter begins with a YAML block and contains `status: draft`, allowed `type: INFRA`, explicit tags and `authority: delegated`.
- Problem identifies reproducible incomplete recovery inventory, inconsistent pooled capture, archive validation-to-restore rejection and stale generated output/CSP behavior, with their current source boundaries and conditions; it contains no unresolved placeholder.
- Architecture Review records affected layers, files and retained public exports; all four checklist items are checked. The sibling scan names existing migration, surface/API ownership, Adapter history, ARCH-008 and consent responsibilities and explains why no new surface shadows them.
- Alternatives compare three materially different approaches with a pro and con for each; Decision selects bounded current-runtime recovery and publication repairs and records the local-cutover, format and execution-authority trade-offs.
- Completion Criteria contains 11 uniquely identified observable criteria, `TC-01` through `TC-11`; Test Plan contains exactly 11 matching rows, each with a nonempty test type, tool/approach and concrete preconditions/verification notes. No row relies on unexplained manual-only verification.
- Tasks contains the required post-approval task-record placeholder. Evidence Log existed and was empty before this first GATE-WRITE entry.
- Repository-scope review found no operated-instance identifiers or private production evidence in the spec. Full local cutover and production mutations remain explicitly outside this bounded repair; this entry verifies GATE-WRITE only.

### [GATE-APPROVAL] — ✅ PASS | 2026-10-24

**Status upgrade:** review-ready → approved

- `authority: delegated` applies under `.agents/rules/authority-delegation.md`: the complete Architecture Review presents affected boundaries, a completed sibling scan, three alternatives with costs/benefits, the bounded recommendation and its verification plan. Standing delegation therefore authorizes these ordinary program/documentation repairs without another item-by-item owner confirmation.
- All four Architecture Review checklist items are checked, and the preceding GATE-WRITE PASS covers the same scope and 11 acceptance criteria. The reviewed frontmatter and Architecture Review have not changed after that gate or the delegated recommendation.
- Approval does not select a new product architecture, provider role or cost model: ARCH-008 remains the existing incomplete target, and this increment retains current recovery/publication owners without adding a hosted service, migration framework, compatibility runtime or diagnostic surface.
- Execution-time exceptions remain mandatory: chargeable resources/billing, production DNS, existing production data deletion/overwrite, external communications, account creation/closure, secret disclosure and any new external runtime/proxy/queue/cache/managed service require narrowly scoped confirmation immediately before execution. The spec additionally withholds actual writer freeze, secret transfer, restoration, deployment, service shutdown and live cutover; this approval authorizes none of them.
- `git status --short` contains only this new specification and the generic audit task record; `git diff --name-only` contains no tracked code changes, and HEAD remains the existing merged foundation. No implementation edit or implementation commit preceded this gate. Repository-scope review found no operated-instance identifiers or private production evidence in the Evidence Log.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-10-24

**Status upgrade:** approved → in-progress

- `.agents/tasks/INFRA-007.md` exists and the specification's Tasks section records that exact implementation-and-verification path.
- The task record contains 11 explicit plan items matching every Completion Criterion once: TC-01 schema/provenance coverage; TC-02 durable two-site recovery and session policy; TC-03 consistent capture and connection release; TC-04 atomic rejection/restore and sequences; TC-05 validated draft interchange; TC-06 incremental HTML dependencies; TC-07 RSS and lead-author changes; TC-08 strict-header desktop/mobile consent behavior; TC-09 exact comment/verification CSP; TC-10 the neutral continuity runbook; TC-11 full regressions, review and privacy checks. No acceptance criterion lacks an implementation or verification task.
- Preceding GATE-WRITE and GATE-APPROVAL PASS entries are present, and frontmatter is `status: approved`. The working tree contains only the new specification and two task records; no implementation commit exists after the merged foundation. This entry verifies GATE-IMPLEMENT only and does not mark any task, product criterion or production migration complete.
- Repository-scope review found no operated-instance identifiers or private production evidence in the Evidence Log. Existing execution-time authority boundaries and incomplete ARCH-008 acceptance remain unchanged.

### [GATE-VERIFY] — ✅ PASS | 2026-10-24

**Status upgrade:** in-progress → verifying

- `.agents/tasks/INFRA-007.md` contains exactly 11 implementation/verification plan items, matching TC-01 through TC-11, and all are `[x]`. No implementation task is blocked or deferred. Commit, CI, integration and owned-fixture cleanup remain explicitly tracked by the separate parent audit record rather than being represented as completed delivery or production cutover.
- Preceding GATE-WRITE, GATE-APPROVAL and GATE-IMPLEMENT PASS entries are present, and the current frontmatter is `status: in-progress`. Recovery, archive and publication source/test wiring was inspected against the completed task record: exact current-schema/provenance policy, repeatable-read capture, transactional recovery, draft-only guarded interchange, actual artifact regressions and strict runtime-origin validation are represented by executable suites.
- Root-executed evidence records Node 22.23.4 with pinned pnpm 9.0.0: `pnpm build`, `pnpm build:admin`, `pnpm typecheck` and `pnpm -r lint` exit 0; `pnpm test` passes all package tests and 76 harness suites / 472 tests with zero skipped when the disposable PostgreSQL connection is supplied. `pnpm harness:scan` passes all 13 scans. The clean-room workflow explicitly runs independent-connection recovery and archive-safety tests against its disposable PostgreSQL server.
- Independent focused verification executed `volta run --node 22.23.4 pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/publication-continuity.test.mjs scripts/harness/__tests__/publication-runtime-config.test.mjs scripts/harness/__tests__/archive-restore-contract.test.mjs`: 3 suites / 30 tests pass, exit 0. This corroborates the recorded whole-workspace run; it does not replace or imply a second full run.
- Agent self-verification is recorded in the task's Root browser evidence: anonymous visitor, actual Chrome desktop 2560x1267 and measured mobile 390x844, generated release artifacts served with generated strict CSP/cache headers. Home/article/category/search and unknown-route behavior were checked; externally linked consent CSS, reject/reload/reopen/grant, zero pre-grant or rejected analytics collection, successful post-grant collection, comment GET/POST and distinct verification script/frame/connect origins were observed. Browser error/warning logs were empty and temporary viewport settings were reset. This public fixture requires no authenticated test account, and no verification was delegated to the user.
- Evidence Log and task records contain only generic fixture identities and the prescribed private-evidence statement for operated observations. No production modification, deployment, complete local-first migration or completion of ARCH-008 is asserted. This entry verifies GATE-VERIFY only; it does not update lifecycle status or execute GATE-COMPLETE.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-10-24

- **Command:** `PUBLISHER_RECOVERY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:32772/postgres volta run --node 22.23.4 pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/logical-recovery-contract.test.mjs scripts/harness/__tests__/archive-starter-safety.test.mjs scripts/harness/__tests__/publication-continuity.test.mjs scripts/harness/__tests__/publication-runtime-config.test.mjs`.
- **Observed:** 4 test files / 41 tests passed, zero skipped, exit 0. `logical-recovery-contract.test.mjs` describe `INFRA-007 complete current-schema recovery`, parameterized `fails closed for %s and releases capture connections`, rejects unknown/missing tables, extra/missing columns, wrong types and missing/tampered/extra migration provenance. The successful capture asserts format 2 and the six current admin migrations. Source inspection confirms exact inventory/provenance inspection occurs before a backup is returned.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-10-24

- **Action:** Executed the focused command recorded in TC-01 and inspected `logical-recovery-contract.test.mjs` tests `preserves two sites, private account authority and guidance but invalidates sessions` and `round-trips site-scoped comments, moderation and durable rate limits without bigint precision loss`.
- **Observed:** Both cases pass in the 41-test run. Exact restored tables and data checksums match; actual domain repositories preserve reviewed/published and review-state posts, locale variants, distinct category/tag values, personas, guidance and idempotent publication replay. Three accounts and four membership rows survive; each restricted account retains only its own membership. Password verification still succeeds, while copied sessions resolve to no account. Approved, pending and rejected site-scoped comments and a bigint above JavaScript's safe integer range survive. The current role-only browser boundary rejects nonowners on both sites; membership-driven grants are explicitly not claimed.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-10-24

- **Action:** Executed `logical-recovery-contract.test.mjs` describe `INFRA-007 independent PostgreSQL connections`, test `captures related records from one repeatable-read snapshot across a committed concurrent writer`, within the exact TC-01 command using disposable PostgreSQL.
- **Observed:** The case ran rather than skipped and passed. Two distinct backend PIDs are asserted, isolation is `repeatable read`, read-only is `on`, and the concurrent writer commits exactly once. Capture retains the old related site name/revision together while the writer reads its new revision separately. The capture commits and the pool reports all connections idle. Failure cases in the same suite also verify released capture connections.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-10-24

- **Action:** Executed recovery tests `rejects malformed or tampered input before touching an empty restore target`, `rejects migration seed/nonempty and drifted targets without mutation`, `rolls back every inserted row on %s failure and releases its connection`, `rolls back durable rows when identity restart fails after checksum verification`, and `rejects a target trigger that resurrects a session during account restore` within the TC-01 command.
- **Observed:** All cases pass. Unsupported format, malformed policy/provenance, digest tampering, missing/extra data and nonempty/drifted targets reject. Insert, verification, sequence-restart and resurrected-session failures leave no committed application rows. The successful round trip produces the next expected audit identity; failed restart restores the original next identity. Source inspection confirms checksum verification and identity restart occur inside the restoring transaction before commit.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-10-24

- **Action:** Inspected `archive-restore-contract.test.mjs` describe `archive restore contract`, archive/media cases in `portable-persistence-integration.test.mjs`, and executed `archive-starter-safety.test.mjs` describes `INFRA-007 untouched starter preservation` and `INFRA-007 serialized starter replacement` in the TC-01 command.
- **Observed:** The executed starter suite passes category-only edits, independent variant/inventory changes, unchanged replay and both true-PostgreSQL insert/variant races. Successful writes cannot be silently erased by replacement. The recorded root full run and independent archive review also pass the validator-to-SQL draft, non-draft rejection, revision/site/media and changed-idempotency cases. Source inspection confirms non-draft rejection precedes transaction acquisition, exact starter article checks and replacement share the exclusive table lock, and no desk approval is manufactured. Test references retain omitted/explicit draft success and explicit review/scheduled/published rejection.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-10-24

- **Action:** Executed `publication-continuity.test.mjs` tests `matches clean bytes for every HTML consumer after adapter enable/change/disable/removal`, `matches clean bytes for comment submission and explicit verification capability changes`, and `adds/removes static comment bootstrap only when the corresponding projection exists` in the TC-01 command; inspected the related incremental-publication regression references.
- **Observed:** All cases pass. Actual incremental artifacts match clean-build bytes after adapter enable/public-ID change/disable/removal and comment or verification changes. Shared heads update every HTML consumer, comment-runtime changes preserve an unaffected index, unrelated artifacts retain object identity, and bootstrap appearance tracks projection presence. The root full regression additionally confirms subsequent comment-body changes do not rebuild unrelated HTML.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-10-24

- **Action:** Executed `publication-continuity.test.mjs` test `updates an RSS body-only edit and lead byline name/path edits` in the TC-01 command.
- **Observed:** The case passes with unrelated article timestamps held fixed. A body-only edit changes actual feed bytes; changing the lead author's name/path changes the home byline and link. The shared equivalence helper compares the incremental result with a clean release for each input, preventing stale semantic output from passing on manifest counts alone.

### [GATE-COMPLETE: TC-08] — ✅ PASS | 2026-10-24

- **Action:** Inspected `visitor-analytics-consent-contract.test.mjs` describe `visitor analytics consent (SECURITY-002)` and the completed task's Root browser evidence for `volta run --node 22.23.4 pnpm exec tsx scripts/harness/continuity-preview.mts`; independently executed `publication-continuity.test.mjs` test `emits linked content-addressed consent CSS without inline style exceptions` in the TC-01 command.
- **Observed:** The artifact case passes: HTML links a same-origin content-addressed stylesheet, runtime source does not inject a style element, and generated CSP retains `style-src 'self'` without unsafe-inline. Root self-verification records an anonymous actual Chrome desktop at 2560x1267 and measured mobile at 390x844 under generated strict headers. Consent controls fit and are styled; reject/reload/reopen/settings persist rejection, explicit grant enables the dummy analytics loader and a successful Network collection request, and reject/reload leaves zero collection matches. Browser evidence is not inferred from DOM-stub tests, and no authenticated test account is needed for this public fixture.

### [GATE-COMPLETE: TC-09] — ✅ PASS | 2026-10-24

- **Action:** Executed `publication-continuity.test.mjs` tests `permits only exact configured comment/verification CSP capabilities`, `rejects unsafe origins and missing verification capabilities at publication boundary` and `rejects CSP origins absent from declarations, unsafe directives and malformed declarations`, plus `publication-runtime-config.test.mjs` describe `publication worker public runtime boundary`, in the TC-01 command. Inspected the same strict-header browser task evidence.
- **Observed:** All cases pass. Missing/malformed capability arrays, unsafe origins, undeclared or duplicate/unsafe CSP directives and supplied non-boolean submission flags reject instead of widening policy or silently disabling comments. The recorded actual browser observes comment GET/POST and separate verification script/frame/connect requests; its synthetic submission reports `Submitted for moderation.` Browser error/warning logs are empty. No operated comment or production state was changed.

### [GATE-COMPLETE: TC-10] — ✅ PASS | 2026-10-24

- **Action:** Read `docs/design/operating-installation-continuity.md` and checked inbound links with `rg -n "operating-installation-continuity" docs/deployment.md docs/development-spec.md .agents/spec-docs/done/WEB-001-static-public-site-and-admin.md`.
- **Observed:** Deployment, development-spec and platform-spec entry points link the one neutral runbook. It contains the full domain matrix, isolated native capture before older-schema migration, original-worker drain, media/object closure, encryption/provenance, session/password/key policy, version alignment and separate artifact/schema rollback. Explicit ARCH-008 blockers include browser/direct-core CLI parity, effective scoped authorization, local keys, complete private media, off-PC encrypted comment intake and inspectable publication activation. Draft interchange and partial local proofs are not presented as migration completion. Automated-test omission is explicit in the Test Plan: source-aware semantic review is required because link/regex checks cannot establish an executable preservation plan.

### [GATE-COMPLETE: TC-11] — ✅ PASS | 2026-10-24

- **Commands:** `git diff --check` and `volta run --node 22.23.4 pnpm harness:scan` independently exit 0; all 13 scans pass. The exact focused command in TC-01 independently passes 4 files / 41 tests with no skipped real-PostgreSQL cases.
- **Observed:** Completed task and prior GATE-VERIFY record root-executed `pnpm build`, `pnpm build:admin`, `pnpm typecheck`, `pnpm -r lint` and `pnpm test` exiting 0 on pinned pnpm 9.0.0/Node 22.23.4; the full harness passes 76 files / 472 tests, zero skipped with disposable PostgreSQL supplied. CI's existing clean-room job explicitly executes the real recovery and starter races. Source/evidence review finds only generic program fixtures, no operated identities or private material, no new compatibility runtime or diagnostic surface, and no production deployment side effect. Git/CI integration remains separately tracked delivery, not a production-cutover assertion.

### [GATE-COMPLETE] — ✅ PASS | 2026-10-24

**Status upgrade:** verifying → done

- All 11 Completion Criteria, TC-01 through TC-11, are checked and now have individual completion evidence with an exact command or inspectable action, observed result and test reference or explicit automation-omission rationale.
- Test Plan contains exactly 11 matching rows; every row identifies executed tests or the necessary manual semantic review and its reason. The record distinguishes independently rerun focused tests from root whole-workspace and real-browser evidence.
- `.agents/tasks/completed/INFRA-007.md` exists with status completed, all 11 implementation/verification tasks checked and no deferred bounded criterion. The spec's Tasks section points to that archived path.
- Preceding WRITE, APPROVAL, IMPLEMENT and VERIFY PASS evidence is present; current frontmatter is verifying. This guard executes only GATE-COMPLETE and does not change lifecycle status or move files.
- Repository-scope review finds no operated domains, hosts, deployment/operation/release identities or production screenshot paths in the Evidence Log. Actual live migration, service retirement and complete ARCH-008 cutover remain explicitly unperformed and blocked by their own product/execution gates.
