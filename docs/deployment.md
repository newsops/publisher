# Deployment contract

> Status: `pilot-pending`. The repository owner must complete the first real
> deployment walkthrough before this guide can be marked validated.

Publisher has three independent surfaces:

| Surface            | Required contract                                               | Failure boundary                               |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| Public publication | immutable static HTML/assets                                    | remains readable without every private service |
| `apps/admin`       | local accounts/sessions, PostgreSQL, S3-compatible API          | never shares the public origin                 |
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

## Static presentation and CDN contract

Generated HTML contains semantic content, SEO metadata, and stable same-origin
references. It does not contain the visual theme itself. Every document loads
the baseline and `/theme-runtime/current.css` as ordinary synchronous
stylesheets, so the complete layout is present on first paint and still works
with JavaScript disabled. JavaScript may progressively load comments or list
projections, but it is not responsible for applying the page design.

The publication release includes a conventional `/_headers` file. It assigns a
one-year immutable browser lifetime only to content-addressed namespaces:

- `/media/*`
- `/theme-runtime/immutable/*`
- `/data/immutable/*`

HTML and stable pointers such as `/theme-runtime/current.css`, runtime
manifests, comment pointers, and the search index use `max-age=0,
must-revalidate`. A theme-only publication therefore replaces the stable theme
pointer and creates a new hashed stylesheet without rebuilding article HTML.
Never apply an immutable rule to all `/theme-runtime/*`, all `/data/*`, or HTML.

This is a provider-neutral HTTP cache contract. A host that understands the
static `_headers` convention can consume it directly; another host can map the
same immutable and revalidation classes in its static adapter. On Cloudflare
Pages, use the normal static deployment and its built-in CDN. No Worker, Pages
Function, KV, Cache Rule, Cache Reserve, database proxy, or paid Cloudflare
feature is required for this caching design.

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
| Identity               | application-owned accounts, password hashes, revocable sessions | Publisher admin runtime                                       |
| Comments verification  | HTTPS form endpoint returning `{ "success": true }`             | any reviewed human-verification service                       |

Neon is an onboarding example, not an SDK dependency. A user supplies its
ordinary PostgreSQL connection string and can later move with standard logical
backup/restore. A free plan must not be treated as durable backup or an SLA.

## Environment

Admin:

```text
ADMIN_PUBLIC_ORIGIN=https://admin.publisher.com
ADMIN_PUBLISHERS=publisher@example.com
# Local file-backed development only (ignored in production): grants the
# fixture identity owner access to the browser admin.
# ADMIN_OWNERS=owner@example.com
DATABASE_URL=postgresql://admin_user:...@db.example/admin
ADMIN_BOOTSTRAP_SECRET=replace-with-a-long-random-one-time-secret
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

### Cloudflare Worker + direct Neon comments adapter

When the operator selects Cloudflare for comments, deploy
`apps/comments/src/worker.ts` as a separate Worker. This is a deployment
adapter: the application connects directly to Neon over the standard PostgreSQL
wire contract. It has no Hyperdrive, D1, database binding, or proxy layer.

1. In Neon, create a dedicated comments role and database (or an equivalently
   isolated database/user). It must not be the `DATABASE_URL` principal used by
   the admin application. Run `corepack pnpm persistence:migrate -- --scope
comments` with that role before serving traffic.
2. Set `PUBLIC_ORIGIN`, `HUMAN_VERIFICATION_URL`, and rate-limit values as
   non-secret Worker variables. For an operator-selected Turnstile integration,
   set `HUMAN_VERIFICATION_URL=https://challenges.cloudflare.com/turnstile/v0/siteverify`.
   Set `COMMENTS_DATABASE_URL`,
   `COMMENTS_MODERATION_TOKEN`, and `HUMAN_VERIFICATION_SECRET` only as Worker
   secrets. The database URL is the dedicated Neon comments URL. Set the same
   moderation origin/token only in the admin runtime's secret store as
   `COMMENTS_ORIGIN` and `COMMENTS_MODERATION_TOKEN`. The admin resolves the
   selected publication and calls the Worker only through
   `/v1/sites/:siteId/moderation/comments`; do not embed a site path in
   `COMMENTS_ORIGIN`.
3. Run `corepack pnpm --filter @publisher/comments build:worker` before
   deployment. It is a dry run and requires neither the Neon URL nor an account
   ID in source control. Deploy a preview first, verify preflight, reads,
   pending submission, moderation, and outage behavior, then bind the
   production comment hostname.
4. Only after the Worker hostname responds correctly, rebuild the static site
   with `NEXT_PUBLIC_COMMENT_ORIGIN` set to that HTTPS origin and
   `NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED=true`. These are public build-time
   values; no database or moderation secret is included in the static bundle.

The Worker removes any inbound `X-Client-IP` and does not consume a
provider-specific forwarding header. The Node adapter instead uses the direct
TCP peer. A Worker therefore enforces the article-wide rate limit and mandatory
human verification, while the Node adapter additionally enforces an IP bucket.
Do not put a second Worker or proxy in this path; if one is later proposed, it
requires an explicit architecture decision and an operator approval before
implementation.

Public build, only when comments are enabled:

```text
NEXT_PUBLIC_COMMENT_ORIGIN=https://comments.publisher.com
NEXT_PUBLIC_COMMENT_SUBMISSION_ENABLED=true
```

### Optional Turnstile comment verification

Turnstile is an operator-selected human-verification adapter, not a Publisher
application dependency. It is suitable for this pilot only after the operator
has evaluated its own billing, privacy, and availability requirements; neither
this repository nor a project consumer requires a Cloudflare paid plan or a
Cloudflare account to use comments with a different verifier.

For the Turnstile adapter, set this additional **public build-time** variable
on the static-site host:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-public-turnstile-site-key
```

The site key is public and is deliberately emitted into static HTML. It is not
an authentication secret. Keep `HUMAN_VERIFICATION_SECRET` only in the
comments Worker secret store, never in Pages/Vercel public build variables,
source control, browser logs, or the static artifact. When the public site key
is omitted, the static output emits no Turnstile script, frame, CSP origin, or
comment-submission form; approved-comment reads remain available. When it is
present with comment submissions enabled, the build adds the exact
`https://challenges.cloudflare.com` CSP origins and the browser adapter obtains
a token before the existing generic comment API submits it.

Other verification providers can integrate by delivering a token through the
documented `publisher:verification-token` event on the article comment section.
The generic Worker verifier still receives only a verification endpoint and its
secret; no provider-specific persistence, proxy, or database service is added.

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
export STATIC_DEPLOYMENT_ADAPTER=managed-static-host
export STATIC_HOSTING_EVIDENCE_PATH=/secure-evidence/static-hosting.json
corepack pnpm deploy:preflight
```

Billing evidence must be verified within 30 days and contain a provider and
plan for `database`, `objectStorage`, and `staticHosting`, plus an empty
`paidFeaturesEnabled` array. A hard-zero record uses `monthlyCapUsd: 0`. An
included-usage record instead sets `billingMode: "included-usage"`, records the
observed storage, Class A, and Class B allowances, sets `overagePossible: true`,
and records the owner's acknowledgement timestamp. It must never misrepresent a
free allowance as a provider-enforced spending cap.

Recovery evidence must contain matching 64-character
`backupDataSha256`/`restoreDataSha256` values for both `admin` and `comments`.
Preflight also rejects shared database URLs/users, a shared public/admin host,
missing owner-bootstrap secret, and incomplete generic object-storage configuration.

`STATIC_DEPLOYMENT_ADAPTER=filesystem` remains available for an operator-owned
origin and requires an absolute `STATIC_DEPLOYMENT_ROOT`. A managed CDN/static
host instead uses `STATIC_DEPLOYMENT_ADAPTER=managed-static-host` and must
provide recent, non-secret activation evidence. This keeps the static host an
operator choice: Cloudflare Pages is one suitable mapping because its native
deployment promotion and rollback can be observed, but Publisher neither
imports its SDK nor receives a Pages credential.

The evidence files are operator-owned and intentionally untracked. Their minimal
shape is:

```json
{
  "verifiedAt": "2026-09-11T00:00:00.000Z",
  "database": { "provider": "chosen-db", "plan": "free", "monthlyCapUsd": 0 },
  "objectStorage": {
    "provider": "cloudflare-r2",
    "plan": "standard",
    "billingMode": "included-usage",
    "includedUsage": {
      "storageGbMonth": 10,
      "classAOperations": 1000000,
      "classBOperations": 10000000
    },
    "overagePossible": true,
    "operatorAcknowledgedAt": "2026-09-13T00:00:00.000Z"
  },
  "staticHosting": {
    "provider": "chosen-host",
    "plan": "free",
    "monthlyCapUsd": 0
  },
  "paidFeaturesEnabled": []
}
```

The R2 fields above are an example of an operator attestation, not a committed
production selection. R2 Standard does not require a paid application runtime,
but its included monthly usage can be exceeded. The operator must review current
provider billing before every production release and retain the evidence outside
the repository.

For a managed static host, retain a separate evidence record after the host has
received a verified candidate, activated it, and completed a rollback smoke:

```json
{
  "verifiedAt": "2026-09-13T00:00:00.000Z",
  "publicOrigin": "https://www.example.com",
  "deploymentId": "host-observed-deployment-id",
  "candidateVerifiedAt": "2026-09-13T00:00:00.000Z",
  "activationObservedAt": "2026-09-13T00:00:00.000Z",
  "rollbackObservedAt": "2026-09-13T00:00:00.000Z"
}
```

`publicOrigin` must exactly match `PUBLIC_SMOKE_URL`'s origin. The deployment
identifier is an operator observation, not a credential; the record must not
contain a provider token, account identifier, bucket name, or private endpoint.

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

## Private archive recovery

Before replacing the generic starter fixture with a private archive, create a
logical admin backup outside the repository and retain its checksum evidence.
An autonomous operator uses the authenticated CLI/API contract; it never
opens the browser editor, connects to PostgreSQL, or uses a hosting-provider
control plane directly.

```bash
publisher content inspect --archive /secure/archive --json --non-interactive
publisher content restore --archive /secure/archive --site default \
  --expected-revision <observed-state-revision> \
  --idempotency-key restore-<unique-id> --non-interactive --json
```

The restore API accepts only an untouched checked-in starter fixture and an
exact expected state revision. It verifies the versioned archive, binds the
idempotency key to a canonical archive digest, uses approved checksum-addressed
media variants, replaces state and articles in one PostgreSQL transaction, and
does not publish or activate a public release. Replay of the same key and
digest returns the original operation; reuse with different archive content,
stale revisions, or any already-edited/published target fail closed.

Only after a successful restore should the operator send the normal publish
request, materialize the verified candidate, and pass that directory to the
chosen static-host CLI. This is an existing-production-data overwrite boundary:
the operator must give an immediate, narrowly scoped confirmation before the
real command is run.

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
not replace its PostgreSQL, object-store, local-account, snapshot, or publication
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
3. Unauthenticated admin denial, valid local-session access, role denial, and same-origin
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
