# Local-first architecture decision record

Status: design review of the now-approved target. Reviewed 2026-10-24 against source baseline
`8e67e83`. This record explains the choice in the
[product proposal](local-first-proposal.ko.md). The
[contract sketches and future acceptance scenarios](local-first-contracts.md)
describe its proposed boundaries. Existing runtime specifications still describe
the current PostgreSQL implementation.

## Why the authority moves to the PC

The operator accepts a browser administration app running on their PC. That
removes the requirement for a hosted administration app and database. It does
not remove the need for transactions, approval checks, operation recovery, or
an online comment receiver.

The proposed design has one local management core, one designated writer per
publication, encrypted remote recovery commits, one public release pointer,
and the existing online comment-intake role. The browser and CLI each expose
the complete management capability set. Internal sync and encryption modules
are not additional deployed services.

## The alternatives and independent review

Two parallel candidates examined different authoritative representations.

| Candidate | Authoritative state                                                                                   | Main benefit                                                               | Main cost                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A         | Per-publication SQLite, with immutable referenced media                                               | Editorial, approval, moderation, and operation changes share a transaction | Remote commits capture a complete consistent database snapshot                                |
| B         | Immutable Markdown and JSON documents selected by a complete manifest, with a disposable SQLite index | Reuses unchanged documents and permits record-level inspection             | The application owns atomic document commits, crash durability, and index-version consistency |

The independent reader scored each frozen candidate against six criteria.
Scores are comparative design judgments, not measurements or test results.

| Criterion, scored 0–4         |   A |   B |
| ----------------------------- | --: | --: |
| Product boundaries            |   4 |   4 |
| Data ownership and simplicity |   3 |   3 |
| Synchronization and recovery  |   3 |   3 |
| Security                      |   3 |   3 |
| Delivery and interactions     |   3 |   4 |
| Reviewability                 |   4 |   3 |
| Total                         |  20 |  20 |

Neither candidate violated a hard constraint. The tie does not justify mixing
both stores. Choose A because its database transaction already covers the
records that B must coordinate through a new document-commit protocol. B also
requires edits to pass through domain commands, so canonical files do not give
callers an additional direct-edit capability.

Markdown remains the authored body and guidance format inside SQLite. Exported
Markdown is interchange material, not a second live authority. Full-snapshot
size, duration, or restore cost can invalidate this choice after measurement.
No acceptable workload threshold has been established yet.

The exercise used the supported Codex runners `gpt-6.1-sol` and `gpt-6-astra`
for the candidates, followed by an independent Codex reader. The default
Claude/Grok runner families were unavailable. This was not a cross-family
review, and no implementation or cryptographic binding was tested.

## Two changes adopted from B

1. One designated writer PC owns each publication. Other devices can inspect,
   export, or prepare interchange files. They cannot advance canonical state
   or publish until an explicit handoff completes. Conditional writes defend
   against stale devices and retries, not a promised multi-master workflow.
2. Rollback selects historical article content with current committed
   moderation and required runtime policy. It cannot reactivate a removed
   comment merely by choosing old release bytes. The intake also adopts bounded
   counter allocation, site-wide count and byte budgets, replay treatment, and
   bounded conditional-write retries. These rules belong to the existing
   intake owner, not a new service.

Reject binary database merging, a second canonical document store, CRDTs,
an always-on synchronization server, automatic lease takeover, and a second
mutable public comment channel. The CLI calls the shared core directly.
Mandatory local IPC is not required when short, tested local locking can
coordinate callers. A browser process is never a prerequisite for CLI work.

## Final synthesis review

A separate reader challenged the synthesized proposal, contracts and future
specification. Four concrete findings were corrected before the writing gate:

- Theme-only tests now count reused semantic article fragments separately from
  rewritten HTML shells that reference new hashed stylesheets. Identical final
  HTML bytes are not required when asset references change.
- Intake admission now reserves an outstanding-inbox byte/entry budget across
  time windows. Confirmed retention deletion, not local import or an unknown
  delete, releases that capacity.
- The encrypted comment body and receiver-only retry capsule share one atomic
  envelope. A matching receipt is checked before new quota or challenge use.
  Retry-after-exhaustion, bounded tombstones and expired admission epochs are
  explicit future tests rather than implicit idempotency assumptions.
- The complete capability matrix now includes local identities, roles, site
  grants, browser pairing and agent credential enrollment/revocation.

The review also retained crash recovery across credential revocation as an
implementation gate. An unresolved activation can stop future publishing
indefinitely; the design accepts this availability loss instead of inventing
evidence that an unknown effect failed. These are design corrections, not
passed runtime or security tests.

## Evidence that limits the proposal

These are source observations at the reviewed baseline. They do not establish
the configuration, behavior, or availability of a deployed installation.

| Observation                                                                              | Exact source anchor                                                                                                                                          | Required target change                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Production composition requires PostgreSQL beyond article storage                        | `apps/admin/app/lib/repository.ts:41,149`; `apps/admin/app/lib/index.ts:108,115,122,133,182`                                                                 | Move registry, guidance, identities, media metadata, recovery, and operations as one local product |
| CLI currently depends on admin HTTP                                                      | `packages/ops-cli/bin/publisher.mjs:33`; `packages/admin-client/src/client.js:34,158`                                                                        | Call the same local management core without a running browser server                               |
| Full parity is a documented goal but not demonstrated by the inventory                   | `docs/publication-platform-plan.ko.md:82`; `scripts/harness/surface-map.json:143,193,213,224,251,262`                                                        | Prove each complete UI journey and its independent CLI equivalent                                  |
| Object writes currently receive plaintext and lack a conditional-write contract          | `packages/persistence/src/object-storage.ts:52`; `packages/persistence/src/object-storage-contract.ts:35`                                                    | Encrypt before upload and test conditional create, CAS, and ambiguous outcomes                     |
| Current publication status follows local pointer activation                              | `scripts/deploy/publication-worker-core.ts:248,277`                                                                                                          | Separate verified build, host activation, and canonical-origin observation                         |
| Desk approval already binds content fingerprints                                         | `apps/admin/app/lib/services/desk-review.ts:103`; `packages/content/src/managed-validation.ts:241`                                                           | Preserve approval invalidation through the shared local write path                                 |
| Comment storage and admission limits currently depend on PostgreSQL                      | `apps/comments/src/app.ts:163,209,252,322`; `apps/comments/src/postgres-db.ts:63`                                                                            | Replace both persisted comments and durable admission state                                        |
| The builder has static comment projections, but the worker does not pass comment records | `packages/publication/src/static-article-recipes.ts:45`; `scripts/deploy/publication-worker-core.ts:142`                                                     | Verify actual approved baseline comments in the canonical release path                             |
| Comment runtime settings and CSP origins have incomplete dependency coverage             | `packages/publication/src/static-article-recipes.ts:62`; `packages/publication/src/static-core-recipes.ts:23`; `packages/publication/src/verification.ts:35` | Declare and test runtime, origin, projection, and policy inputs together                           |
| Current recovery inventory is incomplete for total PC loss                               | `packages/persistence/src/recovery.ts:15`                                                                                                                    | Inventory and restore every authoritative entity, key epoch, and referenced object                 |

The existing plan explicitly favors static public reads and provider-neutral
PostgreSQL and S3 contracts. It does not document why editorial authority must
be remotely hosted. The new PC requirement is the reason to reconsider that
placement, not evidence that the current database product was defective.

## Failure rules retained in the synthesis

Source version, remote history, moderation revision, operation receipts, and
active release are separate identities. A snapshot contains its prepared sync
intent. The external signed commit proves the completed remote transition.
Later receipt bookkeeping does not make unchanged editorial content dirty or
start a recursive "back up the successful backup" operation.

Every remote HEAD transition has an immutable signed history record, including
publication reservation, settlement, and writer-authority changes. ETags are
opaque concurrency tokens, not hashes or author signatures. Lost responses
remain `reconciling`. A rejected retry cannot prove that the original request
failed. A verified matching HEAD or descendant proves success. Verified
exclusion from a valid successor establishes conflict under the tested store
semantics. A negative read alone proves neither outcome.

An activation reservation never expires by elapsed time. Handoff first settles
unknown effects and records a root-authorized writer transition. Old storage
and host credentials must be revoked or rotated before the new writer operates.
Application-level checks cannot stop a revoked device that still holds provider
credentials and bypasses the application.

Private objects use the fixed age X25519 format before upload. Signed records
separately authenticate authorized writers and bind site, purpose, schema,
history, and referenced bytes. A public recipient key lets anyone encrypt, so
successful decryption is not authorization. The proposal requires an independent
recovery identity and trusted checkpoint. A fresh PC recovering solely from a
hostile bucket cannot prove that its valid history is the newest history.

Public HTML, assets, and comment projections share a release identity. Their
embedded approved baseline remains readable when projection fetches fail.
Comment-only publication reuses the activated editorial selection, never drafts.
Historical CDN, browser, and copied content may retain a withdrawn comment.
New activation does not promise recall of those copies.

## What remains unproved

The acceptance scenarios are future work, not passed tests. Implementation must
establish the following before replacing the current runtime.

- Local transaction, advisory-lock, snapshot, media-durability, and crash-recovery
  behavior on each supported operating system and filesystem.
- Exact-object conditional writes, retained HEAD history, immutable retry bytes,
  pagination, and unknown-outcome reconciliation against each selected store.
- Complete-candidate host activation, same-operation inspection, safe retries,
  recovery after response loss, and real public browser observation.
- Maintained age, Ed25519, and canonical-JSON bindings, interoperability vectors,
  hostile-input rejection, and plaintext exclusion from logs and public output.
- Total-PC-loss recovery, independent checkpoint handling, authority handoff,
  key rotation, retained-history access, and old-inbox drain.
- Continuous encrypted comment acceptance while the PC is off, persistent abuse
  bounds, durable receipts, safe moderation rollback, and retained public reads.
- Measured snapshot and inbox workloads, explicit retention limits, and actual
  provider execution or spending controls. Logical quotas are not a guarantee
  of zero denial-of-service cost.
- Complete independent browser and CLI workflows, plus a controlled inventory,
  export, import, and removal of replaced pre-release runtime paths.

The design adds no selected provider, paid service, deployment, or measured
performance claim. Local working data relies on OS account permissions,
full-disk encryption, and credential storage. It is not an application-locked
local vault. Encryption does not prevent deletion, a compromised unlocked PC,
or disclosure of intentionally published material.

## Security boundary review

This uses the security-audit skill in guidance mode. It is a design threat
model, not a full code audit, penetration test or confirmed vulnerability
report. No target application, hostile fixture or live service was executed.

| Lower-trust principal or input                                   | Resource at risk                                        | Proposed boundary and remaining limit                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen storage credentials                                       | Drafts, originals, private history and pending comments | Upload only application-encrypted bytes; editorial signatures reject forged commits. Credentials may still permit deletion or service denial.  |
| Sender who knows public encryption recipients                    | Canonical source authority                              | Require current scoped writer signatures, not merely valid decryption; intake signatures cannot authorize editorial commits.                   |
| Store replaying valid old objects                                | Recovery freshness and current writer authority         | Verify complete history against an independently held checkpoint. A fresh PC with an old checkpoint cannot prove newest state.                 |
| Website calling loopback, or malicious imported Markdown/comment | Local operator session and mutations                    | Exact Host/Origin, session/CSRF checks, safe rendering, sandboxed previews and CSP. A stored script must not inherit operator authority.       |
| Abusive anonymous submitter                                      | Pending inbox and storage operations                    | Bounded admission, outstanding capacity, retry identity and protected quota state. These controls do not establish a provider billing ceiling. |
| Process with the operator's OS authority                         | Unlocked database, plaintext and keys                   | OS account permissions, disk encryption and credential store; no claim of isolation from same-user malware.                                    |

Every boundary remains an implementation acceptance obligation. A document
describing encryption or a provider's capability is not proof that deployed
configuration enforces it. No new cryptographic KMS, proxy, queue or hosted
authorization service is selected by this review.

## Primary references

Consistent capture uses the [SQLite backup API](https://www.sqlite.org/backup.html),
not an arbitrary copy of a live database. Remote sequencing depends on tested
[conditional-write semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
The [R2 conditional-write documentation](https://developers.cloudflare.com/r2/api/s3/extensions/)
also describes the in-flight-write limit on negative observations. These are
documented capabilities, not evidence that Publisher's adapter passes them.

The proposed encrypted format is [age v1.1.0](https://c2sp.org/age@v1.1.0).
Writer records use [Ed25519](https://www.rfc-editor.org/rfc/rfc8032) signatures
with [RFC 8785 canonical JSON](https://www.rfc-editor.org/rfc/rfc8785).
Their use still requires an implementation review and interoperability tests.
