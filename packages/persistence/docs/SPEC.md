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

## Type Ownership

| Type                                                                  | Location                            | Purpose                                               |
| --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `ObjectStore`, `ObjectHead`, `PutObjectInput`, `ObjectStorageConfig`  | `src/object-storage-contract.ts`    | Current byte/media storage boundary                   |
| `ConditionalByteStore`, `ConditionalWriteResult`, `ConditionalObject` | `src/conditional-object-storage.ts` | Required atomic operations for private commit history |
| `MediaMetadata`, `MediaVariant`, `ValidatedImageUpload`               | `src/media.ts` exports              | Current validated media metadata                      |
| `PostgresPool`, `PostgresQueryable`                                   | `src/postgres.ts`                   | Current SQL boundary                                  |

## Public API Surface

| Export                                                                | Kind                  | Contract                                                                              |
| --------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `S3CompatibleObjectStore`, environment configuration helpers          | Class/functions       | Current CRUD, multipart and signed URL storage                                        |
| `S3ConditionalByteStore`                                              | Class                 | `read`, atomic `create` and ETag-conditional `replace`; binary private objects only   |
| `ConditionalStoreError`                                               | Error                 | Distinguish access/configuration/capability rejection from ambiguous network outcomes |
| `ConditionalByteStore`, `ConditionalObject`, `ConditionalWriteResult` | Types                 | Stored/precondition-failed/unknown are distinct outcomes; ETag is opaque              |
| PostgreSQL pool/transaction and migration helpers                     | Functions/types       | Current explicit database operations                                                  |
| Logical backup/restore/checksum helpers                               | Functions/types       | Current relational recovery, not SQLite/key recovery                                  |
| Image validation/variants and media repository                        | Functions/class/types | Existing media processing and metadata                                                |
| File/PostgreSQL build-job repositories                                | Classes               | Current job persistence adapters                                                      |

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

## Test Strategy

`local-first-conditional-storage.test.mjs` executes the real adapter against a
bounded local S3-protocol HTTP fixture. Assert actual request preconditions,
same-GET body/ETag, binary bytes, 404 versus access denial, 412, lost responses
and missing ETags. This proves adapter behavior, not every S3 provider. Existing
`portable-persistence-integration.test.mjs` covers current PostgreSQL and local
S3 CRUD/recovery. Selected providers need isolated acceptance before support.

## Class Contract Registry

- `S3CompatibleObjectStore` implements `ObjectStore`.
- `S3ConditionalByteStore` implements `ConditionalByteStore`.
- Current media and build-job implementations retain their existing contracts
  until the controlled local-first cutover removes replaced runtime paths.
