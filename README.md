# Publisher

Publisher is a pre-release, static-first publishing platform. Editors work in
a separately deployed admin application; readers receive complete static HTML
that remains available when the admin, PostgreSQL, comments, or private object
storage is unavailable.

## Licensing

The source code is available under [AGPL-3.0-or-later](./LICENSE). A separate
written commercial license is required for rights outside that license; see
[Commercial licensing](./COMMERCIAL-LICENSE.md). Publisher branding and all
editorial content are excluded from the code license; see
[Trademark and content notice](./TRADEMARKS.md).

The product contracts are deliberately portable:

- PostgreSQL through `DATABASE_URL` and a separately credentialed
  `COMMENTS_DATABASE_URL`.
- A tested S3-compatible API through generic `OBJECT_STORAGE_*` settings.
- Standard OIDC/JWKS for the administrator identity boundary.
- Immutable, content-addressed public artifacts and atomic release activation.

No infrastructure company is required by the application model. After its
current $0 terms are verified, Cloudflare Free may be selected for public DNS,
CDN, or static hosting. The admin remains the same Node.js 22 application, and
no paid Cloudflare feature is required or enabled by this repository.

## Prerequisites

- Node.js 22.x
- Corepack with pnpm 9
- For persistence work: PostgreSQL 16+ and one tested S3-compatible private bucket

## Local development

Install and start the public site:

```bash
corepack pnpm install
corepack pnpm dev
```

Start the admin in another terminal:

```bash
ADMIN_DATA_DIR=.data/admin \
ADMIN_DEV_TOKEN=local-only-token \
corepack pnpm dev:admin
```

`ADMIN_DATA_DIR` is a development fixture. Production fails closed without
`DATABASE_URL`. Copy [apps/admin/.env.example](./apps/admin/.env.example) and
[apps/comments/.env.example](./apps/comments/.env.example) into a private
environment store; never commit real credentials.

## Useful commands

```bash
corepack pnpm build                 # static public export
corepack pnpm build:admin           # provider-neutral Next admin build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm harness:scan
corepack pnpm harness:browser
corepack pnpm preview:site           # serve apps/site/out on port 3000

corepack pnpm persistence:migrate -- --scope admin
corepack pnpm persistence:migrate -- --scope comments
corepack pnpm fixture:reconcile -- --output .data/fixture-evidence.json
corepack pnpm persistence:backup -- --scope admin --output .data/admin-backup.json
corepack pnpm persistence:restore -- --scope admin --input .data/admin-backup.json

corepack pnpm deploy:preflight
corepack pnpm publication:next -- --deployment-root .data/static
```

`apps/site/out` is the checked-in fixture's static presentation contract and
local visual preview. Production content is not deployed through a second
publication mode: the canonical `publication:next` pipeline consumes the
immutable PostgreSQL/S3 snapshot and materializes the verified release
directory that the selected public host serves.

Publishing from the admin validates content, stores a schema-version 4 immutable
snapshot, and enqueues an idempotent build job. `publication:next` claims one
job, creates only dirty artifacts, verifies the candidate, and performs a
compare-and-swap activation. It never chooses or provisions a hosting provider.

## Repository layout

```text
apps/site           static-only public publication
apps/admin          authenticated editing and publish orchestration
apps/comments       optional isolated comment API
packages/content    content, URL, theme, and snapshot contracts
packages/persistence PostgreSQL, S3-compatible storage, media, backup/restore
packages/publication dependency graph, artifacts, build jobs, activation
scripts/harness     regression, boundary, browser, and edge checks
docs                architecture and deployment runbooks
```

## Public search model

The search page and crawlable indexes are generated during publication. The
browser may filter the already-rendered result set, but it does not need a
database or a client-side content fetch to expose article titles and links.
Versioned JSON projections support optional enhancements while static HTML
remains the durable SEO record.

## Deployment with an AI assistant

Start with [docs/ai-assisted-deployment.ko.md](./docs/ai-assisted-deployment.ko.md).
The assistant must interview the user, present provider choices for each role,
verify current official pricing and billing requirements, and receive the
user's choice before it creates accounts or infrastructure. The repository
owner is the first pilot customer; the guide remains `pilot-pending` until that
real walkthrough and its evidence are complete.

The common application setup is documented in
[docs/deployment.md](./docs/deployment.md). Provider instructions are adapters
to that contract, not product architecture.

## Security and deployment boundaries

- `apps/site` builds without secrets, runtime database access, or admin routes.
- The public and admin origins must be different. The admin origin is unlinked
  from public pages and protected by a verified OIDC token.
- Admin and comments use different PostgreSQL URLs and database users.
- Original media, snapshots, manifests, and content-addressed artifacts are
  private until a verified static release materializes the public subset.
- Optional comments and human verification are separate services. Their failure
  cannot remove article HTML.
- Production preflight requires recent `$0` billing evidence and matching
  backup/restore checksums. Missing or chargeable evidence stops the release.

See [docs/admin-api.md](./docs/admin-api.md) for API details and
[docs/publication-platform-plan.ko.md](./docs/publication-platform-plan.ko.md)
for the complete architecture decision.
