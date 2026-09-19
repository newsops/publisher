# Work status

Last reconciled: 2026-09-19

A feature is completed only after every criterion is checked and its spec has a
passing `GATE-COMPLETE` entry. Earlier completed specs remain decision records;
current active specs override their provider details.

## Completed foundation

| ID            | Status   | Scope                                                                                               |
| ------------- | -------- | --------------------------------------------------------------------------------------------------- |
| ARCH-001..006 | Complete | Six-layer hierarchy and three access surfaces enforced by harness scans; baseline empty             |
| INFRA-005     | Complete | PostgreSQL, S3-compatible object storage, media, recovery, `$0` preflight, clean-room onboarding    |
| WEB-008       | Complete | Idempotent build jobs, incremental static artifacts, projections, runtime themes, atomic activation |
| WEB-001       | Complete | Static public site, separate admin, portable PostgreSQL/S3, and direct comments Worker decision     |
| INFRA-003     | Complete | Provider-neutral managed static-host activation evidence                                            |

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
- Fail-closed production preflight requiring recent hard-zero or acknowledged
  included-usage billing evidence, separate credentials, recovery evidence,
  and an implemented static adapter.

The checked-in fixture is generic starter content; no alternate database, bucket
binding, importer, or runtime fallback is shipped.

## External pilot blocker

The owner-first pilot still needs user-selected real providers and authority for
account setup and production DNS. Local builds cannot satisfy these checks:

1. Current official plan and billing evidence for database, object storage, and
   static hosting with the selected cost policy.
2. Real `DATABASE_URL` and separately credentialed `COMMENTS_DATABASE_URL`.
3. A tested private S3-compatible bucket.
4. A production static adapter with observed atomic activation and rollback;
   `managed-static-host` records these observations without a provider SDK.
5. Separate public/admin domains, local-account session, TLS, cache, direct-origin, and rate-limit
   evidence.
6. Provider-external backup and clean restore evidence.

Cloudflare may be selected for public DNS/CDN/static hosting after the current
terms are verified. R2 Standard is an S3-compatible operator choice with
included usage and possible overage, not a paid application runtime dependency.
The admin remains a provider-neutral Node.js 22 application.

## Current release sequence

1. Keep the completed INFRA-005 and WEB-008 contracts green on Node.js 22 and
   real PostgreSQL/S3-compatible clean-room CI.
2. Record real billing, DNS, local-account bootstrap, isolation, activation, rollback, resilience,
   and restore evidence before declaring the production deployment complete.

See [deployment.md](./deployment.md),
[ai-assisted-deployment.ko.md](./ai-assisted-deployment.ko.md), and
[publication-platform-plan.ko.md](./publication-platform-plan.ko.md).
