---
status: in-progress
type: AGREEMENT
tags: [web, cli, auth, async]
authority: confirmation-required
---

# ARCH-008: Local management, encrypted synchronization, and independent publication

## Problem

The current production management composition requires a PostgreSQL service
even when one operator wants to manage publications from a PC. Its normal
deployment hosts management remotely. The CLI calls the Admin API instead of
operating an unlocked local workspace directly.
This occurs when starting the production repository composition in
`apps/admin/app/lib/repository.ts` and when following
`packages/ops-cli/bin/publisher.mjs` through `packages/admin-client`.

The dependency is broader than article storage: accounts, sessions, site
registry, guidance, media metadata, publication jobs, and comments use the
current persistence composition. Replacing one article repository would leave
a hosted database requirement elsewhere. In addition,
`packages/persistence/src/object-storage.ts` uploads caller-supplied bodies;
private cache headers alone do not encrypt remote drafts or originals.

Product boundaries and completion states also need separation. A locally
activated release is not evidence that the selected host or canonical public
origin serves it. Existing `surface-map.json` exceptions permit CLI-only
recovery and browser-only management capabilities despite the required full
UI/CLI equivalence.

The owner selected a PC-run browser management application and requested design
before development. After reviewing the design and test plan, the owner
authorized implementation on 2026-10-24; the approval and implementation gates
below record that transition. This is the **approved target architecture**, not
an assertion of completed product cutover. Current callers still use the
PostgreSQL composition until their verified replacement. No resource creation,
provider change, production overwrite or cutover is authorized by this record.

## Architecture Review

### Affected Scope

Layer identifiers below refer to `scripts/harness/layer-map.json`. Proposed
paths are not current exports or modules. Their exact glob and import rules
must be registered before implementation, without adding baseline exemptions.

- **L0 contract — `packages/content/src/**`:** retain sole ownership of
  content, Markdown, site-scoped identity, validation, editorial approval, URL
  derivation, and public-safe snapshot contracts. Define shared capability
  requests, results, authorization, and revision semantics without importing
  storage SDKs or a UI framework.
- **L1 adapters — `packages/persistence/src/**` and proposed
  `packages/operator/src/adapters/**`:** isolate SQLite transactions, OS-backed
  site mutation locks, object byte access with conditional writes, credential
  store access, established encryption/signature libraries, and static-host
  observation. Add a tested S3-compatible conditional-write contract rather
  than assuming every provider implements it. Persistence does not own
  editorial decisions.
- **L2 publication — `packages/publication/src/**`:** preserve deterministic
  public projection, declared dependencies, verified immutable releases, and
  static HTML/stylesheet separation. Add current approved-comment projection,
  safe rollback selection, and explicit host/public-origin observation inputs.
- **L3 services and composition — proposed
  `packages/operator/src/core/**`, `packages/operator/src/composition/**`,
  `packages/operator/src/index.ts`, and current
  `apps/admin/app/lib/{services,index.ts,config.ts,repository.ts}`:** move domain
  execution behind one local `ManagementCore`; own operation identities,
  encrypted synchronization, recovery, key policy, publishing reservation, and
  comment import/moderation. L3 core consumes adapter contracts; its composition
  root alone wires L1 implementations. No package imports `apps/**`.
- **L4 surfaces — `apps/admin/app/**`:** make the authenticated browser and
  loopback API complete callers of the local core. Enforce loopback binding,
  Host/Origin/session/CSRF checks, site scope, and browser-safe rendering.
  Existing API paths are migrated atomically; this proposal does not introduce
  a second remotely hosted management API.
- **L4 public and intake — `apps/site/**`, `apps/comments/src/**`:** public
  output stays static and secret-free. Rewrite the existing online comments
  role around encrypted object intake, durable deduplication and bounded
  admission counters, not a server database. The receiving role is retained,
  not a new queue, proxy, or managed service.
- **L5 operators — `packages/ops-cli/**`, `packages/admin-client/**`,
  `packages/claude-plugin/**`, `scripts/**`:** CLI imports the core directly and
  works without the browser HTTP process. The loopback HTTP client remains a
  transport caller where needed, not the mandatory CLI route. Desk Plugin
  consumes CLI capabilities without independent persistence or authority.
  Publication scripts stop treating local activation as external delivery.
- **L5 harness and documentation — `scripts/harness/{layer-map,surface-map}.json`,
  related contract scans, `.agents/project-structure.md`, `CLAUDE.md`,
  `AGENTS.md`, `docs/**`, `specs/**`, and package specifications:** register the
  proposed package's L1/L3 internal ownership and new local entry point;
  replace parity exemptions with capability-by-capability coverage. Current
  canonical runtime documents change only alongside the approved implementation.

Sibling scan: `surface-map.json` already owns posts, articles, authors,
taxonomy, guidance, media, review, publication, sites, recovery, accounts,
comments, operations, and adapter capabilities. New workspace, sync, key,
handoff, and recovery operations must enter that same registry, with distinct
identifiers and site-scoped resource paths. Route and CLI grammar allocation
must check this registry and the OpenAPI document before adding identifiers;
example commands in the design are not allocated public API paths.

ARCH-007 separately governs the server-core `Plugin` to `Adapter` rename.
This design uses the neutral term **adapter** and reserves **Desk Plugin** for
the agent distribution. Implementation must coordinate the rename rather than
create parallel `plugin`/`adapter` persistence or routes. The existing ARCH-007
file has its own explicit owner approval and must not be overwritten here.
SECURITY-001's hosted keyring mechanism is replaced only when the local
authorization cutover is complete; SECURITY-002's analytics/consent work is
not resumed or silently completed by this architecture proposal.

### Alternatives Considered

1. **Retain hosted PostgreSQL and hosted management.** Pro: keeps established
   transactional persistence and current deployment paths. Con: leaves the
   server database and hosted admin requirement the owner intends to remove;
   does not satisfy direct local CLI operation.
2. **Authoritative local SQLite with encrypted consistent remote snapshots.**
   Pro: one transactional source for content, approvals, operations, and
   moderation; remote storage is a recovery/handoff protocol, not another live
   database. Con: synchronization transfers complete database snapshots and
   does not support automatic multi-device merging.
3. **Authoritative immutable Markdown/JSON documents with a manifest; SQLite
   is a disposable index.** Pro: inspectable document source and portable
   export. Con: the product must implement manifest transactions, filesystem
   durability, complete operation/audit authority, and index reconciliation
   across many files; this recreates database responsibilities.

### Decision

Recommend alternative 2. Each publication has one authoritative local SQLite
database and immutable private media. Article bodies, guidance, and personas
remain Markdown text within the domain records. Markdown export/import is an
editing interface, not a second writable source of truth.

Use one designated writer PC per publication. A second device may inspect or
prepare import files; it cannot publish or advance the publication's source
head until an explicit handoff. OS-backed mutation locks serialize local
mutations without a mandatory browser daemon or new IPC service. Remote head
compare-and-swap rejects stale source updates but is not a general-purpose
fence against a device that retains usable provider credentials.

Handoff resolves every unknown remote operation, records the final verified
source checkpoint, transfers required keys, rotates/revokes old storage and
deployment credentials, verifies that revocation, and only then enrolls the
new publishing device. A signed device policy alone cannot revoke copied
provider credentials. Unexpected stale writers preserve local work and return
a conflict instead of merging binary databases or overwriting dirty state.

Keep the existing online comments role because a PC can be off while readers
submit comments. It receives and encrypts durable pending records without a
server database. Comments become public only through local moderation and a
verified static publication. This adds neither a hosted management layer nor
a background scheduler. The owner must confirm this material architecture
after reviewing the proposal; ordinary standing implementation delegation is
not a substitute for that checkpoint.

### Architecture Review Checklist

- [x] Affected packages, layers, proposed modules, and current composition are listed.
- [x] Sibling scan completed: shared capability registry, ARCH-007 terminology, current keyrings, consent scope, and route/command collision checks are identified.
- [x] At least two structurally different alternatives were considered with benefits and costs.
- [x] Decision and trade-offs are recorded, including single-writer limitations and the retained online comments role.

## Solution

### Product and capability boundaries

The [product proposal](../../../docs/design/local-first-proposal.ko.md) owns
the product/capability matrix; the [contract sketch](../../../docs/design/local-first-contracts.md)
owns target caller interfaces and LF acceptance scenarios. These capability
sketches are not current executable APIs. The implemented proof slice and its
limits are recorded in `packages/operator/docs/SPEC.md` and the verification
document.

The management app owns content, multilingual articles, authors/personas,
taxonomy, media approval/attribution, editorial review, site settings,
guidance, adapters, authentication/permissions, synchronization, keys,
recovery, publication, operations, rollback, and comment moderation. Each
capability must have a complete browser and CLI path using the same domain
entry point and authorization. Neither caller may require the other.

The public product owns only approved static output. HTML contains article
semantics, SEO metadata, core navigation, and approved comment projections.
CSS is a normal stylesheet dependency. The durable static origin, not merely
a warm CDN cache, serves the finished release while the PC is off. New
publication, scheduled actions, and moderation wait until the PC is running;
overdue actions do not publish silently on restart.

### Local authority and remote commit

Each site has a separate database, private media closure, key namespace,
remote prefix, and deployment target. Machine-only sessions, agent tokens,
and live credential handles are not restored as active authority from a
snapshot. A local site catalog is not a second authority for site content.

Document open returns content and its revision in one consistent read. Save
requires that observed revision; compare, write and increment are atomic.
Mismatches preserve the unsaved draft and return conflict rather than silently
refreshing the expected version or overwriting newer content. UI and CLI share
this rule. The current whole-workspace proof must return its content and source
revision together as well; a separate status call is not a safe editing token.

Capture a consistent database image through SQLite's backup mechanism, not a
raw copy of a live database/WAL pair. Persist the operation ID, expected
parent, captured revision, exact encrypted bytes, and referenced media
closure before network effects. Upload immutable ciphertext objects and an
authenticated immutable commit, then advance the stable head using its
opaque conditional-write token. Treat that token as concurrency metadata,
not a cryptographic digest.

The snapshot contains a prepared intent; the authenticated remote commit and
observed head record its external result. This avoids a snapshot claiming its
own future upload succeeded. A later local edit stays dirty after an earlier
captured revision synchronizes. Dirty pull requires explicit preservation and
selection; no download silently replaces local changes.

Retries reuse the same operation identity and persisted payload. A timeout
after a write can mean success; the result remains `reconciling` until the
matching commit, an authenticated descendant, or another conclusive outcome
is observed. A temporary negative read never proves that an in-flight write
failed. Initial retention has no automatic remote garbage collection.

### Remote security and recovery

Encrypt all private remote database images, drafts, guidance, original media,
manifests, audit/operation records, and pending comments before upload. Use the
established age v1.1.0 X25519-recipient format, not a new encryption primitive
or custom ciphertext format. Use an established Ed25519 implementation for
domain-separated signatures over RFC 8785 canonical JSON records binding the
site, purpose, object identity, schema, key epoch, and payload digest. age
encryption to a public recipient does not authenticate the sender; verify
editorial signatures and authorized policy independently before importing
decrypted data or parsing a database/image.

Keep encryption identities, signing authority, and storage credentials
separate. Site keys live in OS credential storage; an independent offline
recovery package retains the recovery identity, required historical keys,
trust root, and checkpoint. Do not place this package beside the only remote
backup. Intake holds public encryption recipients and narrowly scoped intake
signing/write authority, never private content decryption keys or editorial
signing authority.

Authenticated history and an independently pinned checkpoint detect rollback
on an enrolled device. A fresh machine with only a hostile remote bucket
cannot prove it received the latest valid state; recovery must report that
freshness is unverified. Rotation changes future authority and re-encrypts
retained data when required. It cannot revoke previously copied plaintext or
stolen historical keys. Storage credential compromise can still delete or
withhold ciphertext; encryption does not replace recovery copies.

Private bucket policy, TLS, least-privilege credentials, opaque object names,
and log redaction are additional controls, not substitutes for encryption.
Remote size/timing metadata can remain visible. Local database, media, and
working plaintext use filesystem permissions and OS full-disk encryption;
this proposal does not claim an application-encrypted local vault or
protection from malware running as the same OS user. Published content and
public image derivatives are intentionally public plaintext.

### Publication and comments

Publishing requires a confirmed private source commit and an explicit
approved editorial selection. Verify an immutable candidate before reserving
activation in authenticated source history. The reservation does not expire
by wall-clock timeout. Unknown host effects block another activation and
handoff until the same operation is inspected and reconciled.

The selected static host must support a verifiable complete-release
activation, stable operation/release identity, inspection, and safe same-ID
retry. `verified`, `active`, and `observed` are separate outcomes. A local
pointer or upload receipt cannot establish canonical delivery. Rollback is a
new fenced publication selection, never a rewind of private source history.
It reuses prior article artifacts only when compatible with current
moderation; a withdrawn comment must not reappear through byte-for-byte
historical rollback. Rebuild the necessary comment-bearing artifacts when
current moderation differs. Previously cached public copies cannot be
cryptographically recalled.

The online receiver validates input and verification policy, reserves
persistent bounded admission quota, and conditionally creates a site-scoped
encrypted inbox record under a stable submission identity. One atomic immutable
envelope holds the encrypted body and an authenticated receiver-only retry
capsule, not two independently committed objects. Existing matching receipts
are checked before consuming new quota or requiring a spent challenge again.
The same identity with a changed payload conflicts. No acceptance response
precedes confirmed durable storage; an unknown write returns a retryable
non-acceptance/unknown outcome.

Admission uses durable encrypted conditional-update counters with explicit
site/time-window bounds and an outstanding-inbox byte/entry cap across windows;
process memory is not the authority. A crash may overcount reserved quota and
reject safely. Only confirmed retention deletion releases outstanding capacity;
an unknown delete retains the reservation. Bounded tombstones and admission
epochs prevent cleanup from recreating previously accepted submissions.
Exhaustion or counter uncertainty fails closed for new submissions, not existing
receipt lookup. Verification and storage counters cannot guarantee zero denial-
of-service cost or a provider-enforced billing ceiling.

Local import scans retained inbox pages with overlap/full reconciliation,
deduplicates stable receipts, and records revision-checked moderation.
Comments-only publication pins the current editorial selection, so unrelated
draft edits cannot leak. Runtime/verification origins participate in dependency
digests and generated CSP. Retention deletion requires confirmed import and a
recoverable synchronized copy. Sites requiring comments cannot activate with
unavailable intake or silently disabled comments.

### Controlled implementation and cutover

After design approval, first prove local crash recovery, consistent capture,
conditional remote writes with lost responses, encryption interoperability,
supported-OS locking, and independent recovery. Stop and revisit the design
if these capability proofs fail before investing in UI work.

Local launchers must resolve workspace dependencies and framework tracing roots
from their configuration location, not the caller's working directory. A root
or app-directory launch must select the same repository boundary; exercise the
actual framework configuration loader in regression tests before browser checks.
The local admin development command explicitly selects the verified webpack
builder and binds loopback. There is no automatic bundler fallback or additional
runtime service; production builds retain their separately tested build command.

Then implement one complete UI/CLI vertical slice, expand the capability
matrix, and complete comment intake/moderation before production replacement.
Inventory and export current content, private media, site registry, guidance,
authors, review state, accounts, and pending/approved comments into a verified
encrypted migration archive. Restore into an isolated new workspace and
reconcile counts, identities, public URLs, and media digests. Reissue device
sessions/tokens rather than activating old sessions from backup.

Freeze old writers for final export, account for late comment intake using a
watermark and overlapping idempotent import, verify a replacement static
release, then perform only separately authorized external cutover actions.
Keep the last public release available throughout. Delete superseded hosted
PostgreSQL/hosted-admin/file-fixture runtime paths in the same completed
implementation migration; do not ship legacy, dual-write, or compatibility
modes. Preserve historical records as data, not parallel executable systems.

## Affected Files

The following is the approved implementation inventory, not an assertion that
every path or requirement is implemented. The task record identifies completed
slices and remaining work:

- `packages/content/src/**`, `packages/content/docs/SPEC.md`.
- Proposed `packages/operator/{package.json,src/index.ts,src/core/**,src/composition/**,src/adapters/**,docs/SPEC.md}`.
- `packages/persistence/{src/**,migrations/**,docs/SPEC.md}`; remove superseded PostgreSQL runtime paths after verified import.
- `packages/publication/{src/**,docs/SPEC.md}`.
- `apps/admin/app/{lib/**,api/**,*.tsx,globals.css}`, admin package/configuration and specification files.
- `apps/comments/src/**`, comments package/configuration and specification files.
- `apps/site/{app/**,public/**,next.config.ts}` and static-output regression fixtures.
- `packages/{ops-cli,admin-client,claude-plugin}/**` and their specifications.
- `scripts/deploy/**`, `scripts/harness/{layer-map,surface-map}.json`, contract scans and future LF acceptance tests.
- `.agents/project-structure.md`, `.agents/rules/{layer-boundaries,spec-workflow}.md`, `AGENTS.md`, `CLAUDE.md`.
- `docs/{development-spec,admin-api,agent-operations}.md`, OpenAPI and deployment/recovery guides, `specs/**`, and the design documents.
- This specification and `.agents/tasks/ARCH-008.md`, created after approval.

## Completion Criteria

All criteria below are product completion gates. Passing a subset of local
proof tests does not complete a whole criterion. The LF identifiers refer to
the contract sketch.

- [ ] TC-01: In fresh isolated workspaces with no hosted database/admin credentials, UI and CLI each create two publications and execute every capability in the parity matrix; denied identities produce the same site-scoped rejection. With the browser HTTP process stopped, CLI edit and publish still complete. Covers LF-01, LF-02, LF-03.
- [ ] TC-02: Killing a local mutation/capture at each durable boundary leaves either the complete prior or complete new revision after restart; no dangling media/approval appears. Synchronizing captured revision 7 does not mark later revision 8 synchronized. Covers LF-04, LF-05.
- [ ] TC-03: A second local writer cannot mutate the locked site; a stale/unenrolled PC cannot advance its remote source head or publish. A handoff with unknown operations or still-valid old provider credentials remains blocked; completed handoff proves old credential rejection and preserves unpublished local work. Covers LF-06 and device-removal aspects of LF-13.
- [ ] TC-04: Injected lost responses, process crashes, and delayed negative reads during immutable upload/head CAS never produce duplicate committed operations or a false `synced` result; same-ID retry converges on the authenticated commit or remains `reconciling`. Dirty pull does not overwrite local revisions. Covers LF-06, LF-07.
- [ ] TC-05: Copying the entire private bucket without content keys reveals no draft text, private settings, original media, manifests, or pending comment body. Bit changes, truncation, cross-site/purpose substitution, and encryption by an unauthorized sender are rejected before content import or publication. Covers LF-08, LF-09, LF-10.
- [ ] TC-06: Recovery on a fresh PC with independently stored recovery material restores the complete site/media inventory but no live prior session; wrong/missing keys fail explicitly. Enrolled checkpoints reject older signed heads, fresh recovery without a recent checkpoint reports freshness unverified, and key rotation restores retained history without claiming retrospective revocation. Covers LF-11, LF-12, LF-13.
- [ ] TC-07: Forged Host, untrusted Origin, cross-origin form, missing/invalid session or CSRF token, and out-of-scope agent requests cannot read or mutate protected loopback data; secrets are absent from URLs, browser storage, CLI arguments, and captured diagnostics. Covers LF-14.
- [ ] TC-08: With the PC and private storage unavailable and the reader CDN cache empty, the durable static origin serves articles, navigation, images, search, feeds, and SEO without runtime secrets. A 1,000-article fixture records reused semantic article fragments separately from rewritten HTML shells/asset references for theme-only changes and all required invalidations for semantic changes. Covers LF-15, LF-16.
- [ ] TC-09: A host activation that succeeds before losing its response remains reserved and `reconciling`, blocks another activation/handoff, and resolves through same-operation host inspection; only canonical-origin checks yield `observed`. Local receipt failure never claims the host reverted. Covers LF-17.
- [ ] TC-10: With the PC off, duplicate and lost-response comment submissions yield one confirmed durable encrypted receipt even after quota exhaustion or challenge use; changed-payload reuse conflicts. Concurrent abuse across time windows and receiver restarts cannot exceed durable admission and outstanding-inbox bounds; uncertain/exhausted quota rejects new submissions without acceptance. Unknown deletion retains capacity and cleanup cannot recreate old submissions. Covers LF-18, LF-19.
- [ ] TC-11: Paginated repeated import/moderation publishes only current approved sanitized comments, with current CSP/dependency changes. Withdrawal and historical-article rollback never resurrect a rejected comment; current discovery excludes it while historical-copy limits remain explicit. Missing required intake blocks activation. Comments-only publication cannot publish an unrelated draft. Covers LF-20, LF-21, LF-22, LF-23.
- [ ] TC-12: Isolated current-model export/import reconciles content, identities, URLs, media digests, guidance, review state, and late comments before any cutover. The replacement passes package tests, static build, typecheck, layer/surface/privacy scans; superseded hosted persistence and compatibility paths are absent, with one complete UI/CLI capability registry. Covers LF-24.

## Test Plan

| TC-ID | Test Type                                            | Tool / Approach                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | capability integration and browser flow              | Shared-core fixtures, CLI subprocesses, and browser automation                                                | Preconditions: two generic publications, authorized and denied local principals, complete capability fixtures. Exercise each capability rather than counting files/commands; no operated-instance data. LF-01..03.                                                                                                                                                                        |
| TC-02 | crash/recovery integration                           | Process termination and filesystem/SQLite fault injection                                                     | Preconditions: committed content, approved media, and revision 7/8 capture race. Restart after every durable boundary; inspect domain results, not only SQL rows. LF-04..05.                                                                                                                                                                                                              |
| TC-03 | ownership and security integration                   | Supported-OS lock tests, two-device fixture, isolated provider credential rotation                            | Preconditions: designated writer policy, stale device, unresolved operation, independently scoped test credentials. Verify revoked credentials at the actual test provider; local mocks cannot establish provider revocation. LF-06 and LF-13.                                                                                                                                            |
| TC-04 | asynchronous protocol integration                    | Fault-injected conditional object store and the tested S3-compatible provider subset                          | Preconditions: persisted exact retry payload, dirty local revision, delayed writes and ambiguous responses. Assert commit identity and no silent overwrite; conditional-write capabilities require real-provider evidence before support. LF-06..07.                                                                                                                                      |
| TC-05 | encryption interoperability and adversarial security | Established age/Ed25519 implementations with copied/tampered namespace fixtures                               | Preconditions: separate sites, purposes, editorial and intake keys. Verify cross-implementation decryption and independent sender authorization; no production keys or bodies enter test output. LF-08..10.                                                                                                                                                                               |
| TC-06 | recovery and key lifecycle integration               | Fresh-workspace restore, independent recovery package, signed-history replay fixtures                         | Preconditions: retained historical key epochs, trusted checkpoint and no-checkpoint cases, complete referenced media. Inventory comparison must include metadata/guidance; prior browser/agent sessions remain invalid. LF-11..13.                                                                                                                                                        |
| TC-07 | loopback authorization and browser security          | HTTP boundary tests plus hostile-origin browser fixture                                                       | Preconditions: real loopback server with exact Host/Origin configuration, paired browser session and scoped agent identity. Include DNS-rebinding-shaped Host requests, CSRF denial, and captured-log redaction. LF-14.                                                                                                                                                                   |
| TC-08 | static availability and rebuild regression           | Static host/browser smoke, cold-cache HTTP requests, 1,000-article dependency fixture                         | Preconditions: complete static release and cache miss while PC/private store are unavailable. Count reused semantic fragments separately from rewritten full HTML shells and asset references, and inspect HTML/CSS/SEO; no throughput or cost claim follows from fixture size. LF-15..16.                                                                                                |
| TC-09 | deployment reconciliation integration                | Inspectable static-host adapter fixture plus isolated host acceptance                                         | Preconditions: verified candidate and non-expiring activation reservation. Drop responses after host side effects; assert local/host/canonical outcomes separately. Any operated-instance confirmation is recorded as verified on an operated instance; evidence kept privately by the operator. LF-17.                                                                                   |
| TC-10 | intake durability and abuse integration              | Parallel HTTP submissions, receiver restarts, conditional-write fault injection                               | Preconditions: working verification fixture, fixed submission IDs, time-window and outstanding-inbox budgets and encrypted intake recipients. Keep the PC off across multiple windows; test bounded state/tombstones, retry after quota exhaustion/challenge use, overcount after crash, changed payload and unknown persistence/deletion without assuming zero provider cost. LF-18..19. |
| TC-11 | moderation/publication and browser regression        | Paginated inbox fixtures, revision conflicts, static-output assertions, canonical CSP smoke                   | Preconditions: pending, approved, rejected, withdrawn, and historical public comments plus an unrelated draft. Repeated import and rollback must keep current moderation; assert no rejected body/receipt in public output. Required comments policy stays enabled. LF-20..23.                                                                                                            |
| TC-12 | cutover rehearsal and repository regression          | Isolated migration inventory; package tests; `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` | Preconditions: complete generic old-model archive, late intake after export, preserved previous public release. Reconcile before external cutover; do not delete production data in this test. Register the new L1/L3 package and every capability without compatibility exceptions. Verify package-runner assertions with plain and ANSI-colored subprocess output. LF-24.               |

## Tasks

- [ ] `.agents/tasks/ARCH-008.md` — active implementation record created after GATE-APPROVAL.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-10-24

**Status upgrade:** draft → review-ready

- Frontmatter starts with a YAML block and contains `status: draft`, allowed type `AGREEMENT`, a tags array, and `authority: confirmation-required`.
- Problem identifies concrete current behavior and reproduction paths: production management requires PostgreSQL, the CLI routes through the Admin API, private object bodies are not application-encrypted, and local activation is distinct from public delivery.
- Architecture Review lists affected L0–L5 responsibilities and proposed modules. All four checklist items are checked. The sibling scan names the capability registry, route/OpenAPI collision checks, ARCH-007 terminology, existing keyrings, and paused consent scope.
- Alternatives Considered contains three choices with explicit benefits and costs. Decision selects local SQLite snapshots, references the cost of document-manifest transactions and hosted persistence, and records single-writer, credential-revocation, and online-intake trade-offs.
- Completion Criteria contains twelve observable future requirements, `TC-01` through `TC-12`, covering capability parity, local durability, ownership, synchronization, encryption, recovery, loopback security, static availability, host reconciliation, intake, moderation, and cutover. None substitutes a generic implementation or no-error claim for an observable result.
- Test Plan contains exactly twelve matching rows in criterion order. Every row has a nonempty Test Type, Tool / Approach, and Notes; Notes state fixtures/preconditions and the verification strategy. No row uses a manual-only tool or an unresolved placeholder.
- Tasks contains an explicit future implementation-record placeholder, deferred until GATE-APPROVAL. Evidence Log was empty before this first GATE-WRITE inspection; no prior gate is required for a new draft.
- Read-only document parsing independently confirmed twelve criteria, twelve matching nonempty plan rows, an initially empty Evidence Log, and both local proposal/contract link targets. This check did not execute application behavior.
- Repository-scope inspection found no operated-instance URL, deployment/release identifier, production screenshot path, or private operator identity in this gate evidence. This result validates design-document readiness only; it grants no implementation approval and establishes no runtime, cryptographic, provider, migration, or deployment success.

### [GATE-APPROVAL] — ✅ PASS | 2026-10-24

**Status upgrade:** review-ready → approved

- `authority: confirmation-required` requires direct owner confirmation after the Architecture Review. The completed Architecture Review, selected SQLite/encrypted-snapshot design, and documented future test obligations were presented before the owner's latest instruction: **"남은 이슈 모두 처리해"** (2026-10-24).
- The immediately preceding handoff explicitly distinguished completed design/test planning from the new runtime and behavior tests that had not been implemented. In that context, the quoted instruction directly authorizes addressing the remaining implementation and test work for this reviewed design; it is not inferred from silence, a design-question answer, or approval of another specification.
- All four Architecture Review checklist items remain complete. No Architecture Review or frontmatter `type`, `tags`, or `authority` change occurred after that instruction before this inspection. The existing GATE-WRITE evidence precedes approval; the working-tree inventory and current commit history contain no ARCH-008 product implementation started before this gate.
- This gate authorizes implementation preparation and code work only. The execution-time exceptions in `.agents/rules/authority-delegation.md` remain in force: chargeable resources/billing, production DNS, production-data deletion or overwrite, external communications, account creation/closure, secret disclosure, and a new external runtime/proxy/queue/cache/managed service require narrowly scoped confirmation immediately before execution. No production cutover, provider mutation, deployment, runtime success, or test success is established by this approval.
- Repository-scope inspection found no operated-instance domain/host, deployment/release identifier, production screenshot path, or private operator identity in this approval evidence.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-10-24

**Status upgrade:** approved → in-progress

- `.agents/tasks/ARCH-008.md` exists and is linked explicitly in this specification's Tasks section. Its implementation scope, branch, objective, decisions, and execution-time authority limits are recorded.
- The task record contains twelve pending implementation tasks, one for each completion criterion: TC-01 shared-core UI/CLI parity and site isolation; TC-02 SQLite durability and capture; TC-03 writer locking and credential handoff; TC-04 encrypted conditional synchronization and reconciliation; TC-05 encryption, signatures, and adversarial inputs; TC-06 independent recovery and key lifecycle; TC-07 loopback security; TC-08 independent static availability and invalidation; TC-09 reserved host activation and canonical observation; TC-10 durable encrypted comment admission; TC-11 moderation, safe rollback, CSP, and draft isolation; TC-12 isolated cutover rehearsal and repository verification.
- Read-only parsing confirmed twelve completion criteria and twelve matching task identifiers with no missing criterion, a linked task path, and preceding GATE-APPROVAL PASS evidence. The current commit history and working-tree inventory contain no ARCH-008 product implementation preceding this gate; no tasks-file bypass was found.
- This result permits implementation to start but establishes no completed task, test result, encryption/provider capability, production migration, or deployment success. The prior approval's external execution-time exceptions remain unchanged.
- Repository-scope inspection found no operated-instance domain/host, deployment/release identifier, production screenshot path, or private operator identity in this implementation-gate evidence.
