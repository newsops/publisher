# Local operator package contract

## Scope

The approved ARCH-008 implementation puts local management authority in this
package. The first implementation slice proves real SQLite durability,
revision/idempotency checks, consistent capture, private-object encryption and
conditional remote-history reconciliation. Full product cutover remains gated
by every ARCH-008 completion criterion.

## Boundaries

The package never imports `apps/**`, serves a browser or chooses a provider.
The public facade hides SQL rows, provider credentials and cryptographic wire
records. UI and CLI call the same domain operations; a browser process is not
required for local management. No production fallback/legacy mode is added.

## Architecture Overview

- L3 `core/**` owns workspace domain operations, typed results and synchronization.
- L1 `adapters/**` owns SQLite, established crypto bindings and local byte I/O.
- L0 `contracts/errors.ts` owns the shared workspace error class and codes.
- L3 `index.ts` is the composition/public entry point; surfaces use that entry only.
- Each site has one authoritative database and one designated writer. SQLite's
  OS-backed write locks and atomic transactions serialize local changes without
  an extra daemon. Network effects never hold SQL transactions open.
- Body Markdown and all domain references are private source data. Remote
  snapshots are consistent backup images, not live remote databases.

## Type Ownership

`packages/content` retains editorial types, Markdown, URL and validation rules.
Local workspace results, writer identity, revision/conflict and durable operation
state belong to the operator core. External values are parsed at boundaries;
SQL, byte-store and crypto-envelope representations remain internal.

## Public API Surface

`createWorkspace({ path, siteId, writerId, identity })` creates an explicitly new,
blank publication; it never falls back to opening or seeding one.
`openWorkspace({ path, siteId, writerId })` opens existing verified local state;
it never silently creates an empty replacement. `identity` contains publication
name, credential-free HTTPS canonical origin and a known theme identifier.
Malformed or credential-bearing origins fail with `WorkspaceError(VALIDATION)`
before any database file is created.

Both return only the `Workspace` facade:

- `read(): WorkspaceRead` returns cloned editorial content, private guidance and
  their source `revision` from the same database read. A caller must save this
  observed revision; a separate later status read is not an editing precondition.
- `status(): WorkspaceStatus` returns site, current/synchronized revisions and dirty state.
- `execute(MutationRequest): MutationReceipt` atomically applies a domain command.
- `close(): void` releases the connection.

Commands currently cover `post.upsert`, `author.upsert`, `taxonomy.upsert`,
`settings.update` and `guidance.update`. Requests carry operation identity and
expected source revision. Same identity and request returns the original
receipt; changed input under that identity conflicts. Author persona and article
bodies retain the content package's Markdown contracts. Validation failure does
not advance source state. Receipt bookkeeping cannot clear later unsynchronized
edits. These are not yet a complete `ManagementCore` capability matrix.

The index exports the two factories, `WorkspaceError` and the types
`MutationReceipt`, `MutationRequest`, `Workspace`, `WorkspaceCommand`,
`WorkspaceContent`, `WorkspaceRead`, `WorkspaceIdentity`, `WorkspaceLocation`, `WorkspaceStatus`.
It does not export raw SQL, capture, receipt confirmation, crypto or sync ports.
An internal WeakMap joins the narrow facade to the sync journal at composition;
callers cannot claim remote success through the public object.

## Extension Points

Byte storage and host observation enter as explicit contracts at composition.
No SDK or provider-specific identifier enters editorial types. Conditional
create/CAS is mandatory for the encrypted commit protocol; unsupported adapters
fail loudly rather than falling back to last-writer-wins behavior.

The internal proof composition injects `ConditionalByteStore` and a private
codec into `createRemoteSynchronizer`; it is not wired into public callers.
`push({ operationId })` returns `synced`, `reconciling`, `conflict`, or
`preparation-failed` with `source-changed`. Only authenticated remote history
confirms success. Prepared payload bytes survive retries without re-encryption.
Independent confirmed namespace checkpoints prevent unrelated source adoption.
An injected trusted-writer list is not the future offline-root trust chain.

## Error Taxonomy

`WorkspaceError.code` is `VALIDATION`, `REVISION_CONFLICT`, `OPERATION_CONFLICT`,
`AUTHORITY`, `BUSY`, `CORRUPT`, `MISSING`, `EXISTS` or `UNSUPPORTED`. All paths use
the same exported class. A network timeout or negative
read never proves that a remote mutation failed: preserve the same operation
and exact bytes in a reconciling state until authenticated history resolves it.
Malformed encrypted records and unsupported history depth fail explicitly;
history beyond 256 nodes raises `HISTORY_LIMIT`, not a promise of progress by
retrying. Full checkpoint recovery/pagination remains required before release.

## Test Strategy

Tests execute real SQLite and maintained age/Ed25519/JCS libraries. Inject faults
only at storage/host/process boundaries. Prove reopen/crash behavior, captured
versus current revisions, wrong/replayed/tampered objects, independent recovery
and same-operation retry. No no-op, skipped or zero-selected test counts as
verification. New behavior tests live in the local-first harness suites; actual
file/test names and observed results are maintained in
`docs/design/local-first-verification.md` and `.agents/tasks/ARCH-008.md`.
`pnpm --filter @publisher/operator test` selects actual `local-first-*.test.mjs`
suites; it fails if none exist. Node 22.16+ is required for SQLite backup.
Current filesystem evidence is macOS-only, not Windows ACL/lock certification.

## Class Contract Registry

| Implementation             | Contract                         | Ownership                                                                   |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `SqliteWorkspaceStore`     | internal `WorkspaceStore`        | Atomic source/journal/checkpoint rows, backup and durable spool             |
| `LocalWorkspace`           | internal `InternalSyncWorkspace` | Revision/idempotency/writer checks and domain coordination                  |
| `publicWorkspaceView`      | public `Workspace`               | Narrow read/status/execute/close facade                                     |
| `createPrivateProtector`   | internal `PrivateObjectCodec`    | age recipients, signed canonical records and bounded authenticated decoding |
| `createRemoteSynchronizer` | internal sync proof              | Encrypted immutable closure, source HEAD CAS and history reconciliation     |

No actual UI/CLI migration, local account/key custody, immutable media closure,
online encrypted intake, host activation reservation or product recovery flow
is certified by this slice. Media references are rejected during capture until
their complete immutable closure can be proved. No private plaintext is sent to
remote storage by the sync proof; local working SQLite is not an encrypted vault.
