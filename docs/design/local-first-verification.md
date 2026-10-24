# Local-first documentation and verification plan

Status: approved implementation plan with partial local-integration evidence.
This document supports the [product design](local-first-proposal.ko.md), its
[LF acceptance scenarios](local-first-contracts.md) and active
[ARCH-008](../../.agents/spec-docs/active/ARCH-008-local-first-product-boundaries.md).
Approval and implementation gates passed on 2026-10-24. Full product cutover,
independent complete recovery, UI/CLI parity and encrypted comment intake remain
unimplemented; they are not implied by the proof-slice results below.

## Completion requires documentation and behavior tests

Each implementation slice must include its contract, operator instructions,
failure behavior and executable regression tests. Record the requirement ID,
test file and test name, fixture, command, observed result and evidence tier.
A planned scenario is not a completed test. A passing document scan is not a
passing encryption, recovery or deployment test.

Test user-observable behavior through real module boundaries. Mocks may inject
storage and host faults, but the transaction, encryption, authorization and
reconciliation logic under test must be the product implementation. Do not add
a separate reference implementation that only agrees with its own tests.
Placeholder, skipped, empty and zero-selected-test runs do not satisfy a gate.

## Documentation deliverables

| Reader need                 | Required instructions and evidence                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the products     | Management, static delivery and online intake ownership; full UI/CLI capability matrix; current versus proposed contracts                               |
| Start a workspace           | Supported OS, local application lifecycle, browser pairing, CLI-only setup, site selection and role grants                                              |
| Connect storage and hosting | Provider-neutral capability checks, separate private/public roles, least-privilege credentials and the existing deployment guide's authority/cost gates |
| Operate daily               | Save versus sync versus observed publication; Markdown/media import; review; schedules while the PC is off; pending comment visibility                  |
| Protect and recover data    | Key custody, independent recovery identity/checkpoint, backup verification, total-PC-loss restore and explicit unsynchronized-data loss limits          |
| Change authority            | Writer handoff, credential revocation, key rotation and crash recovery between each step                                                                |
| Handle failures             | Conflicts, unknown writes/activation, missing objects, quota exhaustion, safe retries and last-known-good public delivery                               |
| Upgrade and release         | Controlled import, retained accepted comments, version support, current-policy rollback and removal of superseded runtime paths                         |

Use generic publications and synthetic content. Never put an operated site's
identity, production credentials or private recovery material in documentation,
fixtures, screenshots, CI logs or test reports. Instructions must work through
each interface independently. Test the documented steps on a fresh workspace.

## Existing coverage: current-architecture inventory

The following files call current product code. Their scope is partial/current
architecture, not complete local-first acceptance. The earlier design review
was source-only; current execution results belong in the active task records.

| Existing suite                                                                                                                                                                                                          | Current coverage                                                                      | Important exclusion                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [incremental-publication-contract.test.mjs](../../scripts/harness/__tests__/incremental-publication-contract.test.mjs)                                                                                                  | Static SEO/CSS, approved comment projection, verified candidates and local activation | No new encryption, external host activation or full UI/CLI walkthrough                  |
| [incremental-publication-scale.test.mjs](../../scripts/harness/__tests__/incremental-publication-scale.test.mjs)                                                                                                        | 1,000-article dependency invalidation and reuse counts                                | Its current article-HTML reuse rule is not the new fragment-versus-shell LF-16 contract |
| [portable-persistence-integration.test.mjs](../../scripts/harness/__tests__/portable-persistence-integration.test.mjs)                                                                                                  | Current PostgreSQL recovery and local S3-compatible CRUD/multipart operations         | No SQLite recovery, authenticated remote HEAD CAS or encrypted snapshots                |
| [archive-restore-contract.test.mjs](../../scripts/harness/__tests__/archive-restore-contract.test.mjs)                                                                                                                  | Existing archive validation and media binding                                         | No independent-key recovery after total PC loss                                         |
| [comment-handler-contract.test.mjs](../../scripts/harness/__tests__/comment-handler-contract.test.mjs) and [comment-moderation-contract.test.mjs](../../scripts/harness/__tests__/comment-moderation-contract.test.mjs) | Current intake validation, authorization and moderation boundaries                    | No encrypted inbox, durable retry receipt or new cumulative-capacity protocol           |
| [layer-contract.test.mjs](../../scripts/harness/__tests__/layer-contract.test.mjs)                                                                                                                                      | Current capability/route/CLI registration                                             | Registry coverage and its exceptions do not prove complete workflow parity              |

Current runnable commands, subject to the repository's pinned local dependency
workflow:

```sh
pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/incremental-publication-contract.test.mjs scripts/harness/__tests__/incremental-publication-scale.test.mjs
pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/portable-persistence-integration.test.mjs
pnpm test
```

The root `pnpm test` builds static output, runs package scripts, then runs the
full harness. Output-dependent suites therefore run after their build. Package
commands now select owned real suites through `run-package-tests.mjs` (or their
own Vitest entry point), not no-op/syntax-only scripts. Unknown or missing suite
selections fail. `package-test-runner-contract.test.mjs` executes a real package
subprocess and checks these entry points. A command's exit code still does not
prove that an untested product journey works.

`scan-spec-contract.mjs` checks criterion/test-plan links and layer tags.
`repository-documentation-contract.test.mjs` checks selected documentation
invariants. Neither proves all links, complete documentation, or product safety.

The [operating-installation continuity runbook](./operating-installation-continuity.md)
separates the current recovery/rendering corrections in INFRA-007 from this
target. Current browser site selection checks the required role, normally owner;
it does not consume persisted `site_administrators` memberships. Automation site
scope comes from an external keyring. A restored membership row proves data
retention, not assigned-site browser permission. LF-01, LF-07, and LF-24 still
need effective scoped authorization and complete independent caller acceptance.

## Planned behavior suites and traceability

The table is the target coverage matrix under `scripts/harness/__tests__/`.
Some first-slice files now exist, as the observed inventory below shows; names
without that evidence remain planned. Every LF ID must map to real assertions
before completion; a row or filename alone is insufficient.

| ARCH-008 criterion | LF scenarios               | Proposed suite                             | Required behavior                                                                                                                    |
| ------------------ | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01              | LF-01, LF-02, LF-03        | `local-first-surface-parity.test.mjs`      | Complete independent browser and CLI journeys, no hosted DB, two-site isolation and equivalent authorization failures                |
| TC-02              | LF-04, LF-05               | `local-first-durability.test.mjs`          | Kill/reopen at database/media/capture boundaries; keep a consistent old or new state and distinguish captured from later revisions   |
| TC-03              | LF-06, LF-13               | `local-first-writer-handoff.test.mjs`      | Process locks, non-writer rejection, credential revocation and restart before/after revocation without early writer activation       |
| TC-04              | LF-06, LF-07               | `local-first-sync-reconciliation.test.mjs` | Exact-byte/same-ID retry, atomic parent transition, dirty-pull preservation, signed history and unresolved results                   |
| TC-05              | LF-08, LF-09, LF-10        | `local-first-private-storage.test.mjs`     | Real encryption interoperability, private-data exclusion, tamper/site/purpose rejection and unauthorized-sender denial               |
| TC-06              | LF-11, LF-12, LF-13        | `local-first-recovery.test.mjs`            | Independent-key full restore, required historical keys, checkpoint rollback detection and explicit unverified freshness              |
| TC-07              | LF-14                      | `local-first-loopback-security.test.mjs`   | Real HTTP/browser denial of forged Host/Origin/CSRF, scoped principals, safe imported previews and secret redaction                  |
| TC-08              | LF-15, LF-16               | `local-first-static-delivery.test.mjs`     | Cold-cache static delivery with PC/private storage off, semantic-fragment reuse and separately counted HTML-shell rewrites           |
| TC-09              | LF-17                      | `local-first-host-reconciliation.test.mjs` | Lost activation response, retained reservation, same-operation host inspection and separate canonical-origin observation             |
| TC-10              | LF-18, LF-19               | `local-first-intake-durability.test.mjs`   | Atomic encrypted receipts, retry after exhausted quota/spent challenge, cross-window outstanding capacity and restart-safe admission |
| TC-11              | LF-20, LF-21, LF-22, LF-23 | `local-first-moderation-release.test.mjs`  | Paginated idempotent import, current-policy rollback, no draft leakage, CSP/dependency updates and required-intake gate              |
| TC-12              | LF-24                      | `local-first-cutover.test.mjs`             | Complete synthetic inventory, late-intake drain, fresh credentials, preserved public release and removal of replaced runtime paths   |

## Fault cases the test code must exercise

Use bounded barriers and explicit clocks rather than timing sleeps. Repeat
storage and host contracts against each supported adapter in an isolated test
account before claiming support. Local fakes establish product decisions under
faults, not provider guarantees or production revocation.

1. **Storage write succeeded, response lost.** Delay a CAS after accepting it,
   return a timeout, then reject the identical retry's old precondition. The
   product must verify matching history or remain `reconciling`, never infer
   failure from that rejection or a temporarily missing read.
2. **Snapshot and later edit.** Capture revision 7, commit revision 8 while
   upload waits, confirm 7, then persist its receipt. Revision 8 remains dirty;
   receipt bookkeeping alone does not trigger recursive source backups.
3. **Host activated, local receipt missing.** Kill after host activation, then
   attempt another publish and handoff. Both remain blocked until inspection
   resolves the original operation; elapsed time grants no takeover authority.
4. **Copied or forged encrypted object.** Test wrong keys, truncation, bit
   flips, cross-site/purpose substitution and a valid age file made by an
   unauthorized sender. Verify authorization and exact restored content through
   a maintained independent implementation; ciphertext appearance alone proves
   nothing. Reject before database/media parsing or publication.
5. **Total PC loss.** Remove the original workspace and its credential store.
   Restore from an independent recovery identity and retained data/key epochs.
   Compare complete inventories and verify old sessions do not reactivate.
   Test a stale/no-checkpoint case without asserting latest-state certainty.
6. **Handoff interruption.** Stop before and after provider credential
   revocation, resume without the lost device, and try its old credentials
   against an isolated provider. New-writer enablement requires completed
   transition evidence, not just a signed enrollment request.
7. **Inbox retries and capacity.** Lose an accepted response, exhaust quota,
   spend the challenge, then retry the same submission. Return its receipt
   without new allocation. Keep the PC off across time windows; outstanding
   bytes/entries stay bounded. An unknown delete does not free capacity, and
   cleanup/expired epochs cannot create a second acceptance.
8. **Moderation-safe rollback.** Publish comment C, withdraw C, then select an
   older article release. Current and rolled-back output exclude C. Verify
   same-release HTML fallback and document the limits of cached old copies.

Each critical negative test must fail if its corresponding product guard is
deliberately removed in a local test experiment. Record that sensitivity when
the test is introduced; do not weaken assertions to preserve a green run.

## Evidence and completion gates

| Evidence tier                 | What it can establish                                                                | What it cannot establish                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Document/registry scan        | Required IDs, links and registrations                                                | Behavior or a security guarantee                                           |
| Unit/local integration        | Product logic with real SQLite/crypto and controlled network faults                  | Actual provider semantics or credential revocation                         |
| Isolated adapter acceptance   | Selected store/host protocol, actual test-credential revocation and interoperability | Live deployment or every provider                                          |
| Browser/CLI acceptance        | Each complete independent workflow and visible errors on representative fixtures     | Production availability without observing that installation                |
| Operated-instance observation | The observed release, origin and recovery/cutover checks                             | Untested locations, unlimited scale, free operation or future availability |

Before a slice is complete, resolve its requirement-to-test mapping, execute the
actual tests, and record pass/fail/not-run separately. Do not infer security from
a test count or line-coverage percentage. Provider, browser and recovery gates
remain required even when unit tests pass. Keep operated-instance evidence
privately under the repository's scope rules.

## Observed first-slice evidence

On 2026-10-24, Node 22.23.4 ran the operator package typecheck and the following
eleven suites: **57 tests passed**. These exercise actual product SQLite,
age/Ed25519/JCS and AWS SDK code, with controlled storage faults. This is local
integration evidence, not selected-provider acceptance or full ARCH-008 success.

| Actual suite                               | Observed behavior                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `local-first-durability.test.mjs`          | Create/open, real SQLite backup, revision/idempotency, lock contention and captured/current dirty state             |
| `local-first-durability-domain.test.mjs`   | Domain validators, authors/personas, taxonomy/settings/guidance, private source isolation                           |
| `local-first-spool-recovery.test.mjs`      | SQL failure after durable file creation, exact payload adoption, operation/intent binding and unsafe-file rejection |
| `local-first-checkpoint.test.mjs`          | Namespace checkpoint monotonicity, receipt atomicity and public facade isolation                                    |
| `local-first-versioned-read.test.mjs`      | Atomic content/revision read and stale-save conflict through two real SQLite handles                                |
| `local-first-filesystem-security.test.mjs` | Private regular-file DB policy, parent-directory fsync failure and exact orphan-spool adoption                      |
| `local-first-conditional-storage.test.mjs` | Real SDK conditional headers, binary body/ETag snapshot, lost response and fail-closed adapter errors               |
| `local-first-private-storage.test.mjs`     | Independent recipients, signed canonical private objects, tampering and wrong-scope/authority rejection             |
| `local-first-sync-reconciliation.test.mjs` | Exact-byte retry, reopen/recovery-copy handling, authenticated commit/descendant proof and uncertain outcomes       |
| `local-first-sync-baseline.test.mjs`       | Fresh/stale baseline conflict and bounded authenticated history                                                     |

The additional `local-first-workspace-identity.test.mjs` suite rejects malformed
and credential-bearing canonical identities before creating private files.

The byte-store fixture is local HTTP, not a provider guarantee. The trust policy
is injected, not yet an offline-root enrollment/revocation chain. Snapshots with
media references are rejected until full immutable media closure exists. History
proof is bounded to 256 nodes and reports `HISTORY_LIMIT` beyond that limit;
checkpoint recovery/pagination is not implemented. The recovery-copy test opens
an actual decrypted SQLite image but is not a complete fresh-PC recovery flow.
OS key custody, UI/CLI wiring, intake, publication reservation/host observation
and controlled import/cutover remain required. See the operator package contract
for exact public and internal interfaces.
