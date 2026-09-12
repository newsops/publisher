# Project Structure

```text
apps/
├── site/       @publisher/site   — Next.js static export for public pages
├── admin/      @publisher/admin  — authenticated admin and publish orchestration
└── comments/   @publisher/comments — optional isolated comment service

packages/
├── content/    @publisher/content — content types, seed snapshot, slug rules
├── persistence/ @publisher/persistence — PostgreSQL, S3 API, media, recovery
├── publication/ @publisher/publication — incremental build and activation
└── config/                         — shared configuration reserved for later extraction

.agents/       rules, skills, spec gates, tasks, templates
.claude/       hooks and reusable engineering skills
scripts/       repository checks and harness scans
specs/         human-facing spec index
docs/          project documentation and decision records
```

## Dependency direction

- `apps/site` may depend on `@publisher/content` and platform-neutral packages.
- `apps/admin` may depend on `@publisher/content` and admin-only infrastructure packages.
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
