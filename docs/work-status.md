# Work status

Last reconciled: 2026-10-24

A feature is completed only after every criterion is checked and its spec has a
passing `GATE-COMPLETE` entry. Earlier completed specs remain decision records;
current active specs override their provider details.

## Current execution checkpoint

The approved target is local-first management: per-publication SQLite on the
operator's PC, encrypted private object-storage synchronization and independent
static public delivery. See [the architecture contracts](./design/local-first-contracts.md)
and [ARCH-008](../.agents/spec-docs/active/ARCH-008-local-first-product-boundaries.md).
The existing admin and CLI still use the hosted PostgreSQL composition. The
new operator package is a tested foundation, not a completed runtime cutover.

- ADMIN-002, CLI-005, SECURITY-001 and ARCH-007 passed their local completion
  gates. Publication extensions now use Adapter terminology; the agent-facing
  Desk Plugin retains its name.
- ARCH-008 remains in progress: complete callers, local security/key custody,
  media, encrypted intake, publication, recovery and controlled migration.
- INFRA-005 remains active for complete multisite lifecycle/domain parity and
  separately recorded external acceptance.
- SECURITY-002 still needs its operated-installation acceptance. A synthetic
  consent smoke test does not close that criterion.

Latest local verification passed on Node.js 22: package tests, 71 harness suites
with 420 tests, both app builds, workspace typecheck/lint and 13 harness scans.
Chrome checks used isolated generic fixtures at desktop and mobile sizes.
No production mutation or main-branch release is implied by this checkpoint.

## Completed foundation

| ID            | Status   | Scope                                                                                               |
| ------------- | -------- | --------------------------------------------------------------------------------------------------- |
| ARCH-001..006 | Complete | Six-layer hierarchy and three access surfaces enforced by harness scans; baseline empty             |
| PLUG-001      | Complete | Desk Plugin: bundled CLI, five commands, three skills, reviewer agent, Desk Plugin contract scan    |
| Persistence   | Complete | Existing PostgreSQL/S3 foundation, media, recovery, `$0` preflight and clean-room onboarding        |
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

The checked-in fixture is generic starter content. The local-first operator
foundation does not enable a parallel legacy runtime or silently switch the
current admin/CLI persistence.

## External acceptance

Each operated installation keeps its provider choices, credentials and evidence
outside this repository. Local builds cannot satisfy these checks for it:

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

1. Keep the existing release contracts and local-first foundation green on
   Node.js 22 while completing every ARCH-008 acceptance criterion.
2. Rehearse import and cutover in isolation, then remove replaced runtime paths;
   do not introduce a legacy or dual-write product mode.
3. Record the selected installation's real billing, DNS, authentication,
   isolation, activation, rollback, resilience and recovery evidence before
   declaring its deployment complete.

See [deployment.md](./deployment.md),
[ai-assisted-deployment.ko.md](./ai-assisted-deployment.ko.md), and
[publication-platform-plan.ko.md](./publication-platform-plan.ko.md).
