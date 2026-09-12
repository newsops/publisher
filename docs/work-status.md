# Work status

Last reconciled: 2026-09-12

A feature is completed only after every criterion is checked and its spec has a
passing `GATE-COMPLETE` entry. Earlier completed specs remain decision records;
current active specs override their provider details.

## Active foundation

| ID        | Status                 | Scope                                                                          |
| --------- | ---------------------- | ------------------------------------------------------------------------------ |
| WEB-001   | External pilot pending | Static public site, separate admin, real DNS/session/cache/rate-limit evidence |
| ADMIN-004 | In progress            | Application-owned accounts, roles, and revocable browser sessions              |
| INFRA-004 | In progress            | Separately gated advertising adapter work; user-owned changes are preserved    |

## Completed foundation

| ID        | Status   | Scope                                                                                               |
| --------- | -------- | --------------------------------------------------------------------------------------------------- |
| INFRA-005 | Complete | PostgreSQL, S3-compatible object storage, media, recovery, `$0` preflight, clean-room onboarding    |
| WEB-008   | Complete | Idempotent build jobs, incremental static artifacts, projections, runtime themes, atomic activation |

## Completed implementation

- PostgreSQL repositories and plain SQL migrations for admin and an isolated
  comment database.
- Generic S3-compatible put/get/head/list/delete/multipart/signed-URL contract.
- Private image validation, full decode, checksum keys, metadata, and approved
  WebP/AVIF variants.
- Immutable schema-version 4 snapshots and idempotent queued build jobs.
- Content-addressed `.html`, JSON, CSS, JavaScript, XML, and media artifacts.
- Declared route dependencies, no-op reuse, bounded projection invalidation,
  and a deterministic 1,000-article regression fixture.
- Candidate checksum/schema/SEO/link/CSP/projection/materialization/smoke gates,
  compare-and-swap activation, safe candidate retry, provider-outage static
  readability, and rebuild-free rollback.
- Application-owned admin accounts, password hashes, and revocable secure-cookie
  sessions; comments are independently moderated.
- Logical PostgreSQL backup/empty-target restore checksums and checked-in fixture
  reconciliation into PostgreSQL plus a private S3-compatible store.
- Fail-closed production preflight requiring recent `$0` billing evidence,
  separate credentials, recovery evidence, and an implemented static adapter.

The product has never been released. Only the checked-in fixture is imported;
no alternate database, bucket binding, importer, or runtime fallback is shipped.

## External pilot blocker

The owner-first pilot still needs user-selected real providers and authority for
account setup and production DNS. Local builds cannot satisfy these checks:

1. Current official plan and billing evidence for database, object storage, and
   static hosting with the selected cost policy.
2. Real `DATABASE_URL` and separately credentialed `COMMENTS_DATABASE_URL`.
3. A tested private S3-compatible bucket.
4. A production static adapter with observed atomic activation and rollback.
5. Separate public/admin domains, local-account session, TLS, cache, direct-origin, and rate-limit
   evidence.
6. Provider-external backup and clean restore evidence.

Cloudflare Free may be selected for public DNS/CDN/static hosting after its
current `$0` terms are verified. The admin remains the provider-neutral Node.js
22 application. The owner account's usage-billed object-storage subscription
was canceled on 2026-09-11 and is not part of the release path.

## Current release sequence

1. Keep the completed INFRA-005 and WEB-008 contracts green on Node.js 22 and
   real PostgreSQL/S3-compatible clean-room CI.
2. Keep WEB-001 open while the owner chooses real providers and authorizes the
   external pilot.
3. Record real billing, DNS, local-account bootstrap, isolation, activation, rollback, resilience,
   and restore evidence before declaring the production deployment complete.

See [deployment.md](./deployment.md),
[ai-assisted-deployment.ko.md](./ai-assisted-deployment.ko.md), and
[publication-platform-plan.ko.md](./publication-platform-plan.ko.md).
