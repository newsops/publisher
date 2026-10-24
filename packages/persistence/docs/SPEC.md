# Persistence package contract

## Scope

Own provider-neutral PostgreSQL persistence, media byte storage, current
logical recovery, build-job adapters and the conditional byte-store boundary.
The approved local-first implementation replaces production composition only
after its capability and controlled-import gates pass.

## Boundaries

This package does not own editorial decisions, browser/CLI authorization,
source synchronization policy or proof of public deployment. Provider SDK
types remain inside adapters. Caller-supplied plaintext to the existing media
API is not evidence of private-object encryption.

## Architecture Overview

L1 adapters implement explicit byte, metadata and SQL contracts. Composition
supplies credentials/configuration; editorial types belong to content and
public projection to publication. The conditional S3 byte adapter uses one
GET for body plus ETag and server-side If-None-Match/If-Match writes. It never
emulates CAS with separate read and unconditional write.

Logical recovery uses only format version 2 and the exact current migration
files and ordered table/column census. Capture uses one dedicated
`REPEATABLE READ READ ONLY` transaction. Every durable admin/comments table
is preserved; `account_sessions` is explicitly invalidated and contains no
captured credentials. Account password verifiers are preserved sensitive
authentication material, not rotated credentials. Checksums do not encrypt
or authenticate a recovery copy. External keys and media bytes are outside
this SQL contract.

Restore validates unknown input before SQL, requires the supported migrated
schema and entirely empty application tables (including any migration-created
starter site), and restores foreign-key-safe rows in one transaction. Durable
row checksum verification and identity progression happen before commit; any
failure rolls back all inserted rows. Admin and comments captures are separate
snapshots, not cross-database atomicity.
The restore role needs ownership of restored tables to restart identity
generation transactionally; insufficient authority fails rather than falling
back to a nontransactional sequence change.
JSONB cells use PostgreSQL JSON text, bigint cells use decimal text and
timestamps use UTC with database precision, avoiding JavaScript numeric or
date precision loss. The backup script creates a new owner-only file and
refuses to overwrite an existing path.

## Type Ownership

| Type                                                                  | Location                            | Purpose                                               |
| --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `ObjectStore`, `ObjectHead`, `PutObjectInput`, `ObjectStorageConfig`  | `src/object-storage-contract.ts`    | Current byte/media storage boundary                   |
| `ConditionalByteStore`, `ConditionalWriteResult`, `ConditionalObject` | `src/conditional-object-storage.ts` | Required atomic operations for private commit history |
| `MediaMetadata`, `MediaVariant`, `ValidatedImageUpload`               | `src/media.ts` exports              | Current validated media metadata                      |
| `PostgresPool`, `PostgresQueryable`                                   | `src/postgres.ts`                   | Current SQL boundary                                  |
| `LogicalBackup`                                                       | `src/recovery-format.ts`            | Versioned private current-schema recovery             |
| `PersistenceScope`                                                    | `src/recovery-schema.ts`            | Admin/comments recovery isolation                     |

## Public API Surface

| Export                                                                | Kind                  | Contract                                                                                                       |
| --------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `S3CompatibleObjectStore`, environment configuration helpers          | Class/functions       | Current CRUD, multipart and signed URL storage                                                                 |
| `S3ConditionalByteStore`                                              | Class                 | `read`, atomic `create` and ETag-conditional `replace`; binary private objects only                            |
| `ConditionalStoreError`                                               | Error                 | Distinguish access/configuration/capability rejection from ambiguous network outcomes                          |
| `ConditionalByteStore`, `ConditionalObject`, `ConditionalWriteResult` | Types                 | Stored/precondition-failed/unknown are distinct outcomes; ETag is opaque                                       |
| PostgreSQL pool/transaction and migration helpers                     | Functions/types       | Current explicit database operations                                                                           |
| `createLogicalBackup`, `verifyLogicalBackup`, `restoreLogicalBackup`  | Functions             | Exact-schema v2 capture, unknown-input validation and atomic empty-target recovery; no older format conversion |
| Image validation/variants and media repository                        | Functions/class/types | Existing media processing and metadata                                                                         |
| File/PostgreSQL build-job repositories                                | Classes               | Current job persistence adapters                                                                               |

## Extension Points

Other stores may implement `ConditionalByteStore` only with tested atomic
conditional creation and replacement. Missing ETags or unsupported conditions
cannot degrade to unconditional writes. Expose no bucket credentials or SDK
response object through the contract. Providers remain operator choices.

## Error Taxonomy

An absent object read returns `undefined`; access denial is not absence.
HTTP 412 produces `precondition-failed` for that request, not proof a previous
logical operation failed. Lost/unknown write responses produce `unknown`.
Explicit authorization, invalid configuration or unsupported operations raise
sanitized `ConditionalStoreError` codes. Bodies and credentials are never
included in those messages. Higher-level history reconciliation owns success.
Recovery rejects unsupported format/schema/migration/policy, bad digests or
row counts, nonempty targets and restored-data mismatch. SQL errors propagate
without returning a successful backup or partially restored transaction.

## Test Strategy

`local-first-conditional-storage.test.mjs` executes the real adapter against a
bounded local S3-protocol HTTP fixture. Assert actual request preconditions,
same-GET body/ETag, binary bytes, 404 versus access denial, 412, lost responses
and missing ETags. This proves adapter behavior, not every S3 provider. Existing
`portable-persistence-integration.test.mjs` covers current PostgreSQL and local
S3 CRUD/recovery. Selected providers need isolated acceptance before support.
`logical-recovery-contract.test.mjs` exercises real SQL two-publication
durable-data/session-policy round trips, exact census/provenance rejection,
transaction rollback and identity progression. Its PostgreSQL concurrency
scenario uses two independent server connections and a capture barrier to
prove one snapshot under a related-record update. Run with
`pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/logical-recovery-contract.test.mjs`;
set `PUBLISHER_RECOVERY_TEST_DATABASE_URL` only to a disposable local database
to run the independent-connection scenario.

## Class Contract Registry

- `S3CompatibleObjectStore` implements `ObjectStore`.
- `S3ConditionalByteStore` implements `ConditionalByteStore`.
- Current media and build-job implementations retain their existing contracts
  until the controlled local-first cutover removes replaced runtime paths.
