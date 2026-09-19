# Project Structure

```text
apps/
├── site/       @publisher/site   — Next.js static export for public pages
├── admin/      @publisher/admin  — authenticated admin and publish orchestration
└── comments/   @publisher/comments — optional isolated comment service

packages/
├── content/    @publisher/content — content types, seed snapshot, slug rules, theme ids
├── persistence/ @publisher/persistence — PostgreSQL, S3 API, media, recovery
├── publication/ @publisher/publication — renderers, theme stylesheets, incremental build and activation
├── admin-client/ @publisher/admin-client — reusable authenticated Admin API client
├── ops-cli/ @publisher/ops-cli — command-line adapter over admin-client
└── config/                         — shared configuration reserved for later extraction

.agents/       rules, skills, spec gates, tasks, templates
.claude/       hooks and reusable engineering skills
scripts/       repository checks and harness scans
specs/         human-facing spec index
docs/          project documentation and decision records
```

## Layer hierarchy

Generated from `scripts/harness/layer-map.json` (the authority) and enforced
by `pnpm harness:scan`; see `.agents/rules/layer-boundaries.md`.

| Layer | Name        | Directories                                                                                                                                                                                                                                            | May import                                                        |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| L0    | contract    | `packages/content/src/**`                                                                                                                                                                                                                              | `node:crypto`, parsers                                            |
| L1    | adapters    | `packages/persistence/src/**`, `apps/admin/app/lib/{postgres-*,file-*,build-job-repository,article-repository-adapter,media-service,publisher,release}.ts`                                                                                             | L0, builtins, SDKs (`pg`, `@aws-sdk/*`, `sharp`), L2/L3 types     |
| L2    | publication | `packages/publication/src/**`                                                                                                                                                                                                                          | L0, builtins, L1 types                                            |
| L3    | services    | `apps/admin/app/lib/*.ts` (services); `repository.ts`, `plugin-repository.ts`, `config.ts`, `index.ts` (composition)                                                                                                                                   | L0, L2, L1 types; composition may wire L1 values                  |
| L4    | surfaces    | `apps/admin/app/api/v2/**` (automation), `apps/admin/app/api/**` (browser), `apps/admin/app/lib/{auth,automation-auth,api-*,request-repository,author-context,media-view}.ts` (http), `apps/admin/app/**` (ui), `apps/site/**`, `apps/comments/src/**` | L3, http, L0, framework; `apps/site` only L0                      |
| L5    | operators   | `packages/admin-client/**`, `packages/ops-cli/**`, `scripts/**`                                                                                                                                                                                        | client: nothing; cli: client + builtins; scripts: package indexes |

Access surfaces inside L4/L5 — admin page (session cookie, `/api/**`),
automation API (bearer key, `/api/v2/sites/{siteId}/**`), CLI
(`publisher` → `@publisher/admin-client` → automation API) — are registered
per capability in `scripts/harness/surface-map.json`.

## Dependency direction

- `apps/site` may depend on `@publisher/content` and platform-neutral packages.
- `apps/admin` may depend on `@publisher/content` and admin-only infrastructure packages.
- `packages/admin-client` may depend only on web-standard HTTP types and has no
  environment, browser, database, object-storage, or deployment-provider
  dependency. `packages/ops-cli` may depend on it and owns CLI-only process I/O.
- `apps/admin` owns API-route authentication, authorization, audit, and all
  mutations; `packages/admin-client` is a caller and must never be imported by
  `apps/admin`.
- `apps/site` must not import admin code or secrets.
- `packages/content` must not depend on Next.js, React, a database SDK, or a deployment provider.
- The public build consumes a content snapshot; publishing creates a new snapshot and deployment.
- Relational persistence targets PostgreSQL through provider-neutral repository
  contracts. Admin and comments use separate databases or schemas and separate
  credentials. No second relational runtime or fallback path is shipped.
- Binary media and immutable snapshots target a tested S3-compatible API subset.
  Provider-specific identifiers cannot enter `packages/content` or the public
  snapshot schema.
- `packages/publication` owns content-addressed artifacts, declared dependency
  digests, build-job states, candidate verification, compare-and-swap activation,
  and rebuild-free rollback.
- `apps/site/out` is the checked-in fixture's visual/static contract. Deployed
  editorial content has one canonical path: `packages/publication` materializes
  a verified snapshot-specific release for the selected static host.
- Public output must stay readable from its static host when PostgreSQL, object
  storage, admin, or a selected infrastructure provider is unavailable.

## Deployment surfaces

| Surface           | Build                      | Runtime                          | Recommended origin              |
| ----------------- | -------------------------- | -------------------------------- | ------------------------------- |
| Public site       | Static HTML artifacts      | CDN/static object delivery only  | `www.publisher.com`             |
| Admin             | Next server or managed app | OIDC + API + PostgreSQL + S3 API | Unlinked `admin.publisher.com`  |
| Comment service   | Isolated service           | API + isolated PostgreSQL        | `comments.publisher.com`        |
| Relational stores | Admin/comment-owned        | PostgreSQL                       | private provider or self-hosted |
| Object stores     | Admin/release-owned        | Tested S3-compatible API subset  | private provider or self-hosted |
