# Deployment contract

> Status: `pilot-pending`. The repository owner must complete the first real
> deployment walkthrough before this guide can be marked validated.

Publisher has three independent surfaces:

| Surface            | Required contract                                               | Failure boundary                               |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| Public publication | immutable static HTML/assets                                    | remains readable without every private service |
| `apps/admin`       | OIDC/JWKS, PostgreSQL, S3-compatible API                        | never shares the public origin                 |
| `apps/comments`    | separate PostgreSQL credentials and optional human verification | never blocks article delivery                  |

The application does not choose an infrastructure company. Cloudflare Free is
an allowed public DNS/CDN/static-hosting choice only after current `$0` billing
evidence is recorded. The admin remains the same Node.js 22 application. Paid
Cloudflare features are outside this deployment profile.

For an AI-led setup, read
[ai-assisted-deployment.ko.md](./ai-assisted-deployment.ko.md) first. It owns
the user interview, provider selection, authority boundaries, and owner pilot.

## Clean checkout

Use Node.js 22.x and pnpm 9:

```bash
git clone <repository-url>
cd publisher
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm harness:scan
```

`apps/site/out` is the checked-in fixture's complete static presentation preview.
It contains no `/admin`, `/api`, database connection, object-store credential,
or runtime secret. It is not an alternative production publisher. Production
content always follows the immutable snapshot, dependency graph, candidate
verification, and atomic activation path described below.

## Provider-independent clean-room smoke

Docker can verify the real PostgreSQL 16 and S3-compatible boundary without a
Cloudflare account or any provider console:

```bash
docker compose -f infra/local/compose.yml up -d --wait postgres object-storage
docker compose -f infra/local/compose.yml run --rm object-storage-init

export DATABASE_URL=postgresql://publisher_admin_app:admin-local-only@127.0.0.1:55432/publisher_admin
export COMMENTS_DATABASE_URL=postgresql://publisher_comments_app:comments-local-only@127.0.0.1:55432/publisher_comments
export RESTORE_DATABASE_URL=postgresql://publisher_admin_app:admin-local-only@127.0.0.1:55432/publisher_admin_restore
export COMMENTS_RESTORE_DATABASE_URL=postgresql://publisher_comments_app:comments-local-only@127.0.0.1:55432/publisher_comments_restore
export OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:59000
export OBJECT_STORAGE_REGION=us-east-1
export OBJECT_STORAGE_BUCKET=publisher-fixture
export OBJECT_STORAGE_ACCESS_KEY_ID=publisher-local
export OBJECT_STORAGE_SECRET_ACCESS_KEY=publisher-local-secret
export OBJECT_STORAGE_FORCE_PATH_STYLE=true
corepack pnpm clean-room:smoke
```

The final JSON must report `"status":"passed"`, eight posts, four tags, one
author, and 17 media objects. The command applies both database migration sets,
proves the credentials cannot query the other database, reconciles the checked-in
fixture and media checksums, validates and transforms an uploaded image, publishes
and atomically activates a static release, exercises object put/get/list/delete,
and restores both logical backups into empty databases with matching checksums.
The same flow runs in `.github/workflows/verify.yml` on Node.js 22.

Remove only these local disposable containers and volumes after the smoke:

```bash
docker compose -f infra/local/compose.yml down -v
```

## Provider selection

The operator chooses one product for each role after checking its current
official pricing, billing activation, quotas, deletion procedure, and outage
behavior:

| Role                   | Product contract                                                | Example choices                                               |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| PostgreSQL             | normal PostgreSQL URL, migrations, transactions, logical export | Neon Free, another managed PostgreSQL, self-hosted PostgreSQL |
| Private object store   | tested S3-compatible subset                                     | MinIO, AWS S3-compatible endpoint, another passing service    |
| Public static host/CDN | immutable candidate, atomic promotion or equivalent, rollback   | filesystem origin, static-host deployment product             |
| Admin runtime          | Node.js 22-compatible Next server with private environment      | container or managed Node runtime                             |
| Identity               | signed JWT, issuer/audience/JWKS verification, email claim      | any conforming OIDC provider or access proxy                  |
| Comments verification  | HTTPS form endpoint returning `{ "success": true }`             | any reviewed human-verification service                       |

Neon is an onboarding example, not an SDK dependency. A user supplies its
ordinary PostgreSQL connection string and can later move with standard logical
backup/restore. A free plan must not be treated as durable backup or an SLA.

## Environment

Admin:

```text
ADMIN_PUBLIC_ORIGIN=https://admin.publisher.com
ADMIN_PUBLISHERS=publisher@example.com
DATABASE_URL=postgresql://admin_user:...@db.example/admin
OIDC_ISSUER=https://identity.example
OIDC_AUDIENCE=publisher-admin
OIDC_JWKS_URL=https://identity.example/.well-known/jwks.json
OIDC_EMAIL_CLAIM=email
OIDC_TOKEN_HEADER=authorization
OBJECT_STORAGE_ENDPOINT=https://objects.example
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=publisher-private
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_PUBLIC_BASE_URL=https://media.example
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

Comments:

```text
COMMENTS_DATABASE_URL=postgresql://comments_user:...@db.example/comments
COMMENTS_MODERATION_TOKEN=...
HUMAN_VERIFICATION_URL=https://verification.example/siteverify
HUMAN_VERIFICATION_SECRET=...
PUBLIC_ORIGIN=https://www.publisher.com
```

Public build, only when comments are enabled:

```text
NEXT_PUBLIC_COMMENT_ORIGIN=https://comments.publisher.com
NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED=true
```

The verification widget or application integrates with the static comment form
by dispatching `publisher:verification-token` on the article comment section.
No third-party challenge script is present in the baseline public bundle.

The bundled Node comment adapter discards any inbound `X-Client-IP` value and
sets it from the TCP peer address. If a reverse proxy is placed in front, it
must strip the public header and set one trusted `X-Client-IP` value at the
private origin boundary; application code does not trust provider-specific or
client-supplied forwarding headers.

Secrets belong in the chosen runtime's secret store. Do not put them in shell
history, screenshots, chat, issues, commits, pull requests, build output, or
`NEXT_PUBLIC_*` variables.

## PostgreSQL setup

Use different URLs and users for admin and comments. Separate databases are the
simplest isolation boundary; separately owned schemas are allowed only after
cross-credential denial is tested.

```bash
corepack pnpm persistence:migrate -- --scope admin
corepack pnpm persistence:migrate -- --scope comments
```

The migrations create `publisher_admin` and `publisher_comments`, record each
migration checksum, and reject modified applied migrations.

To seed a new test installation with only the checked-in fixture and copy its
17 fixture media objects into the selected private bucket:

```bash
corepack pnpm fixture:reconcile -- \
  --site default \
  --output .data/fixture-evidence.json
```

The command does not overwrite an existing site. It checks post/tag/author
identity, media byte sizes and SHA-256 values, and records one deterministic
fixture checksum.

## Backup and recovery

Create provider-external logical backups for both databases:

```bash
corepack pnpm persistence:backup -- \
  --scope admin --output /secure-backup/admin.json
corepack pnpm persistence:backup -- \
  --scope comments --output /secure-backup/comments.json
```

Restore only into migrated, empty targets:

```bash
corepack pnpm persistence:restore -- \
  --scope admin --input /secure-backup/admin.json
corepack pnpm persistence:restore -- \
  --scope comments --input /secure-backup/comments.json
```

The restore fails on a non-empty target and verifies row counts plus a data-only
SHA-256 that is stable across backup timestamps. Copy private media, snapshots,
manifests, and artifacts to a provider-external bucket or offline archive and
periodically verify a clean restore.

## Billing and recovery evidence

Production preflight is fail-closed:

```bash
export BILLING_ATTESTATION_PATH=/secure-evidence/billing.json
export RECOVERY_EVIDENCE_PATH=/secure-evidence/recovery.json
export STATIC_DEPLOYMENT_ADAPTER=filesystem
export STATIC_DEPLOYMENT_ROOT=/srv/publisher-static
corepack pnpm deploy:preflight
```

Billing evidence must be verified within 30 days and contain a provider, plan,
and `monthlyCapUsd: 0` for `database`, `objectStorage`, and `staticHosting`, plus
an empty `paidFeaturesEnabled` array. “Free allowance” is insufficient when a
card, usage-billed subscription, or non-zero overage remains possible.

Recovery evidence must contain matching 64-character
`backupDataSha256`/`restoreDataSha256` values for both `admin` and `comments`.
Preflight also rejects shared database URLs/users, a shared public/admin host,
missing OIDC values, and incomplete generic object-storage configuration.

The evidence files are operator-owned and intentionally untracked. Their minimal
shape is:

```json
{
  "verifiedAt": "2026-09-11T00:00:00.000Z",
  "database": { "provider": "chosen-db", "plan": "free", "monthlyCapUsd": 0 },
  "objectStorage": {
    "provider": "chosen-store",
    "plan": "free",
    "monthlyCapUsd": 0
  },
  "staticHosting": {
    "provider": "chosen-host",
    "plan": "free",
    "monthlyCapUsd": 0
  },
  "paidFeaturesEnabled": []
}
```

```json
{
  "verifiedAt": "2026-09-11T00:00:00.000Z",
  "admin": {
    "backupDataSha256": "<64 lowercase hex characters>",
    "restoreDataSha256": "<the identical value>"
  },
  "comments": {
    "backupDataSha256": "<64 lowercase hex characters>",
    "restoreDataSha256": "<the identical value>"
  }
}
```

## Publish and incremental generation

An authorized publisher sends an idempotency key:

```http
POST /api/v2/sites/default/publish
Authorization: Bearer <publisher-token>
Origin: https://admin.publisher.com
Idempotency-Key: <unique-request-id>
```

The `202` response contains `snapshotId`, snapshot checksum, `jobId`, and
`jobStatus: "queued"`. The request does not build or deploy the public site.

Run one queued job:

```bash
corepack pnpm publication:next -- \
  --site default \
  --deployment-root /srv/publisher-static
```

`publication:next` is the queue-consuming form of the common
`publication:worker` command. The latter can also build an explicitly supplied
`--snapshot-file` or `--snapshot-key` for diagnostics without claiming a job.

The worker performs:

```text
queued → running → verifying → ready → published
```

It verifies the immutable snapshot checksum, reads approved media, hashes every
declared dependency, renders only dirty routes, uploads only missing
content-addressed objects, writes an immutable release manifest, fully
materializes and checks the candidate, then compare-and-swap activates it.
Failure marks the job failed and leaves the previous `current.json` pointer
unchanged. Rollback is the same compare-and-swap to a previously verified
release directory and does not rebuild content.

Retry a failed job only after correcting its recorded cause:

```bash
corepack pnpm publication:next -- \
  --retry <failed-job-id> \
  --site default \
  --deployment-root /srv/publisher-static
```

Rollback verifies the saved manifest and every deployed file checksum before
atomically moving the current pointer:

```bash
corepack pnpm publication:rollback -- <previous-release-id> \
  --deployment-root /srv/publisher-static
```

The checked-in adapter targets an atomic filesystem origin. A hosted static
adapter must implement the same candidate verification and promotion semantics;
the AI setup guide must not substitute a non-atomic overwrite and call it
complete.

## Static data behavior

- Article HTML contains the body, headings, byline, dates, canonical link,
  social metadata, breadcrumbs, essential navigation, and `NewsArticle` JSON-LD.
- Recent and policy-approved popular lists have dedicated crawlable HTML plus
  versioned same-origin JSON projections. Projection changes do not rebuild
  article HTML.
- Comment submission uses the isolated service, while approved comments reach
  readers through a short-lived per-article pointer to an immutable static
  projection. A moderation change regenerates only that article's pointer and
  projection; article HTML is unchanged. Failure leaves the static empty-state
  fallback readable.
- Visual themes are immutable self-hosted bundles selected through
  `/.well-known/publisher/runtime.json`. A theme-only change renders/uploads
  zero article HTML files, including a 1,000-article publication.
- A semantic template, canonical, JSON-LD, or essential-navigation change
  intentionally invalidates every affected article.

With optional integrations disabled, the exact baseline CSP is:

```text
default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'
```

## Static host and admin runtime

The selected public host receives only the verified release directory. It must
preserve immutable asset caching, bounded HTML caching, TLS, direct-origin
denial where applicable, and rollback evidence. It must never receive private
database or object-store credentials.

Deploy `apps/admin` to a different origin such as
`admin.publisher.com`. `corepack pnpm build:admin` produces the Node.js 22
Next.js application. The repository deliberately ships no provider-specific
admin runtime build: a selected host must run this same application and must
not replace its PostgreSQL, object-store, OIDC, snapshot, or publication
contracts.

Set the selected Node host or its reverse proxy to reject request bodies above
10,551,296 bytes before they reach Next.js. The media endpoint also requires a
valid `Content-Length`, rejects larger multipart requests before parsing, and
then independently verifies the decoded image is at most 10 MiB.

## Required smoke evidence

Before the owner pilot is complete, record direct observations for:

1. Public desktop/mobile rendering with JavaScript enabled and disabled.
2. Public content during database, object-store, admin, comment, and runtime
   projection outages.
3. Unauthenticated admin denial, valid OIDC access, role denial, and same-origin
   mutation enforcement.
4. Admin/comment cross-credential database denial.
5. Candidate checksum failure and stale concurrent activation rejection.
6. Publish idempotency, 1,000-article invalidation bounds, and no-op zero render.
7. Backup into empty databases with matching checksums.
8. Public cache/TLS/direct-origin/rate-limit behavior for the chosen host.
9. Rebuild-free rollback to the previous verified release.

Do not describe a local build as a production deployment. Provider account
creation, card registration, paid feature activation, DNS changes, and deletion
or overwrite of existing data require the user's explicit authority.
