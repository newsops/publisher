# Proposed local management contracts

Status: approved target sketches; implementation is in progress. This document
describes interfaces and acceptance scenarios for the
[product design](local-first-proposal.ko.md). Sketches below are not executable
API documentation. The proof slice's exact exports and limitations are in
[`packages/operator/docs/SPEC.md`](../../packages/operator/docs/SPEC.md).
Existing callers remain until their verified replacement.

## Usage comes before implementation

The operator opens the management application on their PC. The browser presents
workspace creation, recovery, content editing, synchronization, publication,
and comment moderation. Every operation uses the same domain capability as its
CLI equivalent. Opening or closing the browser has no effect on the CLI's
ability to operate an unlocked local workspace.

The following command syntax is proposed, not executable documentation.

```sh
publisher workspace open --path ./example-workspace
publisher post update --site example --id example-post --input ./article.md --revision 7
publisher sync push --site example --operation sync-example --json
publisher publish --site example --operation publish-example --json
publisher operation get publish-example --json
```

The CLI imports the local management core. The browser uses a loopback HTTP
adapter which calls that core. Neither caller performs storage writes,
encryption, approval checks, synchronization retries, or deployment sequencing
on its own. An agent plugin calls the CLI contract. A local API consumer can use
the authenticated loopback contract while the application is running.

The selected design has one designated writer device per site. Other devices
can inspect copies or prepare interchange files, but cannot commit canonical
edits, synchronize a new head, or publish until handoff completes. Local writers
use a site-scoped OS advisory lock and SQLite transactions. Lock contention is
an explicit retryable busy result; it does not require a daemon or mandatory
IPC path. Network waits do not hold SQL transactions open. Supported operating
systems must prove these durability and lock guarantees before release.

## Identifiers and operation outcomes

The sketches use opaque identifiers. Transport validation constructs these
types. Storage keys, SQL rows, provider response objects, and cryptographic key
bytes are private implementation details.

### Read a version; save that version

Opening an editable document returns its content and revision from the same
consistent read. Saving sends the revision that was opened, not a newly queried
latest revision. The storage transaction compares that expected revision and
writes the new content plus incremented revision atomically. A mismatch returns
a revision conflict without overwriting either the server value or the caller's
unsaved draft. Reapplying a draft to a newer revision requires an explicit choice.
The browser and CLI use this same rule; HTTP transports carry `If-Match`.

Document revisions, whole-workspace source revisions and remote ETags have
different scopes. Operation IDs prevent duplicate retries; they do not replace
version checks. The current operator proof edits one workspace source unit:
`read()` must therefore return content and its `revision` together. Calling
`read()` and then `status()` cannot establish which version was opened.

```ts
type SiteId = string & { readonly __brand: 'SiteId' }
type Revision = number & { readonly __brand: 'Revision' }
type CommitId = string & { readonly __brand: 'CommitId' }
type ReleaseId = string & { readonly __brand: 'ReleaseId' }
type OperationId = string & { readonly __brand: 'OperationId' }
type SelectionId = string & { readonly __brand: 'SelectionId' }
type ModerationRevision = number & { readonly __brand: 'ModerationRevision' }

type SyncResult =
  | { state: 'synced'; commit: CommitId; capturedRevision: Revision }
  | { state: 'conflict'; localRevision: Revision; remoteCommit: CommitId }
  | { state: 'reconciling'; operation: OperationId }

type PublicationStatus =
  | { state: 'preparing'; operation: OperationId }
  | { state: 'verified'; operation: OperationId; release: ReleaseId }
  | { state: 'deploying'; operation: OperationId; release: ReleaseId }
  | { state: 'reconciling'; operation: OperationId; release: ReleaseId }
  | { state: 'active'; operation: OperationId; release: ReleaseId }
  | { state: 'observed'; operation: OperationId; release: ReleaseId }
  | { state: 'conflict'; operation: OperationId; activeRelease: ReleaseId }
  | {
      state: 'failed'
      operation: OperationId
      code: string
      retryable: boolean
    }
```

`active` requires a host observation tied to the intended release. `observed`
requires checks through the canonical public origin. A local release pointer
or upload response cannot establish both states. A timeout never implies that
an external side effect failed.

## One domain entry point, two complete callers

The capability names and complete parity matrix are owned by the product
proposal. Implementations derive HTTP and CLI validation from that contract
instead of maintaining independent lists of allowed operations.

```ts
interface ManagementCore {
  execute<K extends CommandKind>(
    command: CommandByKind[K],
    caller: AuthorizedCaller,
  ): Promise<ResultByKind[K]>

  query<K extends QueryKind>(
    query: QueryByKind[K],
    caller: AuthorizedCaller,
  ): Promise<QueryResultByKind[K]>
}

interface AuthorizedCaller {
  readonly principalId: string
  readonly siteScope: readonly SiteId[]
  readonly capabilities: readonly CapabilityId[]
}

interface RemoteCommitRequest {
  readonly site: SiteId
  readonly operation: OperationId
  readonly expectedParent: CommitId | null
}

interface PublishRequest {
  readonly site: SiteId
  readonly operation: OperationId
  readonly sourceCommit: CommitId
  readonly approvedSelection: SelectionId
}
```

`CommandKind`, `QueryKind`, `CapabilityId`, and their result maps are proposed
registry types. They must include all rows in the parity matrix before release.
The public interfaces hide database transactions, object-store concurrency
tokens, key unwrapping, immutable-object addresses, and deploy-provider details.

`packages/operator` is the proposed owner of this entry point. Its internal
service and adapter directories need explicit L3/L1 ownership in the future
layer map; the package name does not waive dependency direction. Callers cannot
import internal SQLite, cryptographic, provider, or wire-record types.

Domain services validate editorial rules and permissions once. The local
persistence adapter supplies transactions and process coordination. The remote
adapter validates the encrypted commit protocol. The builder receives a
public-safe snapshot, never a workspace database or decryption key.

## Persistence and operation identity

SQLite is the local per-site authority, including Markdown text and private
metadata. Immutable media is referenced from transactions after durable file
creation. A remote source commit contains a consistent database snapshot and
the complete referenced-media closure, encrypted before upload. Exported
Markdown is interchange, not a concurrently authoritative directory.

The following concepts have independent versions:

| Concept             | Advances when                                                         | Does not advance merely because              |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Editorial revision  | A domain edit changes content, policy, approval, or source references | An upload receipt arrives                    |
| Moderation revision | A comment decision changes                                            | An old editorial selection is chosen         |
| Source commit       | A captured source and its full closure become remotely confirmed      | New local edits occur                        |
| HEAD history        | Source, reservation, settlement, or writer authority changes          | A local status query runs                    |
| Operation receipt   | Evidence resolves one stable operation identity                       | The source must be resnapshotted recursively |
| Activated release   | The host confirms one verified candidate                              | A local file pointer changes                 |

The snapshot contains a prepared sync intent. Its success is established by the
external authenticated commit/history, not a success field inside its own bytes.
Recovery uses that evidence to reconcile the restored ledger. Later edits remain
dirty relative to the captured source. Importing a new comment changes source
state; recording an upload receipt alone does not.

Every HEAD replacement has an immutable signed, encrypted history object. Its
ciphertext digest is the history identity; the signed plaintext binds the parent
history identity, sequence, writer epoch, source commit and activation reservation.
The stable HEAD uses those same ciphertext bytes. Uploads and retries preserve
exact bytes and operation identity. ETags are opaque CAS tokens, not hashes.

Only a verified matching head/history entry or authenticated descendant proves
that an ambiguous mutation committed. A missing GET, rejected conditional retry,
or timeout alone does not prove the original request failed. Conflicting history
must be verified before classifying a conflict. Dirty pull never overwrites work.

Activation uses a non-expiring reservation in this same history. An unresolved
host effect blocks another activation and device handoff. The host adapter must
inspect persistent operation/release identity and safely repeat the same intent;
an upload response is not an activation receipt. An unsupported adapter fails
capability checks rather than silently weakening the protocol.

Comments-only publication pins the last activated editorial selection and uses
current confirmed moderation. Rollback chooses an old editorial selection but
applies current confirmed moderation and required security/runtime policy. A
new verified candidate is required when old public bytes would resurrect a
withdrawn comment. Old CDN/browser/archive copies cannot be recalled by this
protocol. Private HEAD never rewinds to implement public rollback.

## Private-data security contract

All private remote payloads, snapshots, referenced original media, manifests,
history and pending comments are encrypted in the application. TLS, private
bucket policy, role-scoped credentials and encryption are separate requirements.
Public output is extracted through an allowlist into a separate delivery role.

Use the published age v1.1.0 X25519 format and reviewed libraries, not a custom
cryptographic primitive. Domain-separated Ed25519 signatures over JCS metadata
bind site, purpose, object identity, format, key/authority epoch and body digest.
The signed binding is inside encryption; age is not assumed to expose arbitrary
application AAD. Anyone can encrypt to a public recipient, so decryption alone
never authorizes a source commit. Intake certificates only authorize receipts.
Verify bounds, authenticity and the full closure before parsing a database or
media file. Remote keys must not reveal slugs or original filenames; size and
timing remain observable.

The active device holds decryption and scoped signing keys in the OS credential
store. The receiver has public recipients, a receipt-signing key and separate
abuse-state secrets, never editorial decryption keys. Recovery identity and root
signing recovery material are held independently from both the PC and bucket.
An independently retained checkpoint records trusted history and authority epoch.
The proposal does not promise application-encrypted local SQLite: local working
plaintext relies on OS disk encryption and restrictive permissions. Same-user
malware, provider deletion and previously copied plaintext/ciphertext are not
eliminated by API scopes or remote encryption.

Handoff settles unknown effects, commits final source state, records a root-signed
writer/epoch transition, revokes or rotates the old device's provider credentials,
and then enables the new writer. A cooperative epoch check cannot fence an old
device that still holds working bucket/host credentials. Reconciliation across
the transition must retain the verified prior epoch and operation evidence. With
no recent independent checkpoint, a fresh device cannot prove a malicious store
has supplied the newest valid history. The recovery result exposes that limit.
Handoff records intermediate progress; crash before or after credential
revocation never enables the new writer early. Recovery authority can resume it
without the lost device. Enrollment approval and activation are distinct states.

## Recovery contract

Recovery is an operation through both interfaces. It verifies the recovery
material, enrolled identity, trusted checkpoint, encrypted data, and referenced
private media before replacing a local workspace. Active browser sessions and
agent credentials are device state and are not restored as live sessions.

Missing credentials, a wrong key, a missing referenced object, unsupported
format, invalid authentication, and an older-than-trusted history are separate
failures. An unknown storage response is not an empty workspace. A successful
recovery describes its source version and freshness evidence.

## Future acceptance scenarios

The [verification plan](local-first-verification.md) maps these scenarios to
proposed behavior suites, fault injection, documentation and evidence gates.
It distinguishes current coverage from tests that do not exist yet.

These are implementation gates, not test results from this design task. Use
generic fixtures and isolated storage. Fault injection must cover each durable
boundary, including outcomes where an external write succeeds but its response
is lost.

| ID    | Setup and action                                                                                                                                                                               | Required observation                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LF-01 | Open a fresh workspace with no server DB or hosted admin credentials. Create two sites through UI, then repeat through CLI.                                                                    | Both callers complete setup. Site identities and their data remain separate.                                                                                                                                                                                                                                                                                                                     |
| LF-02 | Close the browser and stop its HTTP process. Edit and publish through CLI.                                                                                                                     | The CLI uses the shared core without starting or requiring a browser session.                                                                                                                                                                                                                                                                                                                    |
| LF-03 | Exercise each capability through UI and CLI with the same authorized and denied identities.                                                                                                    | Domain results, revision conflicts, authorization, and operation identity agree. Neither caller needs the other.                                                                                                                                                                                                                                                                                 |
| LF-04 | Crash the local writer during an edit and reopen the workspace.                                                                                                                                | A complete prior or new transaction is visible. No partial content, dangling approved references, or silent empty reset appears.                                                                                                                                                                                                                                                                 |
| LF-05 | Capture a remote commit, then edit locally while an upload is pending.                                                                                                                         | The result identifies the captured revision. Any later changes remain explicitly unsynchronized. If the chosen writer policy forbids edits during capture, both callers report that policy before changing data.                                                                                                                                                                                 |
| LF-06 | Attempt writes from a non-designated device, then inject two stale writer requests against one remote parent. Exercise device handoff with an unresolved activation.                           | Normal non-writer edits/pushes fail with a writer-authority error. CAS permits at most one parent advance. No dirty work is overwritten. Handoff remains blocked until reconciliation, root-authorized transition and old provider-credential revocation/rotation.                                                                                                                               |
| LF-07 | Fail the process or lose a response during each upload and head transition. Retry with the same operation.                                                                                     | The operation observes its committed identity or retains reconciling state. A negative read alone never proves that an in-flight write failed.                                                                                                                                                                                                                                                   |
| LF-08 | List and copy the entire private remote namespace with storage credentials but no content keys.                                                                                                | Drafts, private settings, original images, manifests, and pending comments remain unreadable. Names do not disclose article slugs or original filenames.                                                                                                                                                                                                                                         |
| LF-09 | Flip a ciphertext bit, truncate it, or substitute a valid object from another site or purpose.                                                                                                 | Import and publication fail before plaintext is used. Hash replacement alone cannot authorize a changed record.                                                                                                                                                                                                                                                                                  |
| LF-10 | Add a file encrypted to a known public recipient using an unauthorized writer key.                                                                                                             | Decryption success does not grant editorial commit authority. The writer check rejects the commit.                                                                                                                                                                                                                                                                                               |
| LF-11 | Replay an old valid remote head against an enrolled device's checkpoint. Restore a new device without a recent independent checkpoint.                                                         | The first case rejects rollback. The second reports freshness unverified and offers explicit recovery selection without claiming newest data.                                                                                                                                                                                                                                                    |
| LF-12 | Lose the original PC. Recover on another PC using an independent recovery package and encrypted backup.                                                                                        | Content, sites, guidance, metadata, private media, and required historical keys restore. Old local sessions remain invalid. Missing recovery material fails explicitly.                                                                                                                                                                                                                          |
| LF-13 | Rotate keys and remove an operator/device, then attempt direct storage/host writes with its prior credentials.                                                                                 | Provider access is denied after confirmed revocation/rotation; source verifiers enforce the new authorized epoch. Recovery of retained history is tested. The UI does not claim that previously copied data or keys were revoked retroactively.                                                                                                                                                  |
| LF-14 | Request the loopback API from an untrusted Origin, forged Host, or missing browser/agent authorization.                                                                                        | Reads and writes requiring authority are denied. Cross-origin forms, wildcard CORS, and DNS rebinding cannot bypass the checks.                                                                                                                                                                                                                                                                  |
| LF-15 | Shut down the PC and clear a reader's CDN cache. Load an article, navigation, image, search, and feed.                                                                                         | The durable static host serves the finished release without the PC or private bucket.                                                                                                                                                                                                                                                                                                            |
| LF-16 | Build 1,000 fixture articles. Change only visual theme assets, then change semantic article markup.                                                                                            | Theme-only changes reuse semantic article fragments; HTML shells may change to reference new hashed assets. Semantic template changes invalidate all affected article fragments. The test reports reused fragments and rewritten full HTML/assets separately.                                                                                                                                    |
| LF-17 | Interrupt host deployment after activation but before the local receipt. Resume the same publication operation, and attempt another activation or handoff.                                     | Host inspection identifies the actual release. The unresolved reservation never expires into permission for another activation/handoff. The app does not mark a changed site rolled back because a local write failed.                                                                                                                                                                           |
| LF-18 | Turn the PC off. Submit a comment twice with the same submission identity, including a lost-response retry after quota exhaustion or a spent challenge.                                        | The receiver returns the same durable pending receipt without new quota/challenge consumption. One conditionally created envelope contains the encrypted body and protected retry capsule. An unknown write is not acknowledged as accepted. Changed-payload reuse conflicts; expired admission epochs cannot create another receipt.                                                            |
| LF-19 | Send concurrent abuse requests across multiple time windows using many identifiers and replayed challenge tokens; restart receiver instances, fail CAS and delete calls, and leave the PC off. | Time-window bounds and a durable outstanding-inbox byte/entry cap apply before allocation. CAS retries and admission-state records are bounded. Uncertain quota rejects new intake. Only confirmed retention deletion releases outstanding capacity; duplicate receipts remain queryable, and accepted pending objects are not silently expired. No hidden DB or hard billing-cap claim appears. |
| LF-20 | Restore paginated pending comments, approve one, reject one, and publish. Repeat the operation.                                                                                                | Only the approved sanitized comment appears publicly. Repeated import/moderation does not duplicate it. Private receipts and rejected bodies remain absent.                                                                                                                                                                                                                                      |
| LF-21 | Change comment receiver/verification settings without editing article text.                                                                                                                    | The dependency graph and generated CSP reflect the selected origins. Canonical release tests exercise the actual site-scoped runtime.                                                                                                                                                                                                                                                            |
| LF-22 | Withdraw a previously approved public comment, publish, then roll back to an older article selection. Request old/current URLs and fail a release-pinned projection fetch.                     | New discovery and rollback output exclude the withdrawn comment. Failed projection fetch preserves the same-release HTML baseline. The retention/cache policy states what historical copies can remain accessible.                                                                                                                                                                               |
| LF-23 | Attempt a publication without working comment intake when the site's launch policy requires comments.                                                                                          | Activation fails with an actionable capability error. Comments are not silently disabled.                                                                                                                                                                                                                                                                                                        |
| LF-24 | Export from the current persistence model and import into an isolated new workspace.                                                                                                           | Inventory, content, media, site identities, URLs, and review state reconcile before cutover. The previous deployment remains available until an explicit replacement.                                                                                                                                                                                                                            |

## Verification sequence after design approval

The first implementation experiment proves consistent local capture,
conditional remote writes, encrypted-object interoperability, and recovery on a
fresh workspace. It also checks the selected local writer mechanism on the
supported operating systems. Failure here reopens the design before UI work.

Next, one vertical slice exercises a draft edit through each caller, encrypted
remote commit, reload/recovery, and an observed static publication. Complete
the capability matrix and online comment path before replacing the old
production composition. Existing runtime dependencies are removed only in the
controlled implementation cutover. The [verification record](local-first-verification.md)
distinguishes actual proof tests from these still-required product journeys.
