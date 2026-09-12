# Publisher development spec

The Korean product architecture is
[publication-platform-plan.ko.md](./publication-platform-plan.ko.md). Active
implementation agreement is
[WEB-001](../.agents/spec-docs/active/WEB-001-static-public-site-and-admin.md).
The spec index is [specs/README.md](../specs/README.md).

Every cloned-repository deployment starts with the
[AI-assisted deployment guide](./ai-assisted-deployment.ko.md). It requires
user-selected providers, current official cost checks, explicit authority for
external changes, observed evidence, and an owner-first pilot.

## Primary goal

디도스 공격에 강한 뉴스 웹사이트를 만든다.

Readers receive static HTML and materialized media through a CDN/static origin.
Anonymous article delivery has no request-time dependency on PostgreSQL,
private object storage, the admin, comments, or an infrastructure API.

## Canonical architecture

- `apps/site`: static-only public publication with crawlable content and SEO.
- `apps/admin`: unlinked, separately deployed editor surface protected by
  standard OIDC/JWKS.
- PostgreSQL: normal wire-protocol connections through `DATABASE_URL` and a
  separately credentialed `COMMENTS_DATABASE_URL`.
- Object storage: the tested S3-compatible subset through generic
  `OBJECT_STORAGE_*` variables.
- Publication: immutable schema-version 4 snapshot, idempotent build job,
  declared dependency graph, content-addressed artifacts, verified candidate,
  compare-and-swap activation, and rebuild-free rollback.
- Themes and mutable projections: self-hosted versioned assets that cannot
  remove static article semantics when JavaScript or optional services fail.

Provider products are replaceable choices. No provider-specific database,
bucket, identity, queue, or public-content identifier is part of the domain
contract.

## Current phase

The repository contains eight checked-in pre-release fixture posts, local media,
static article/index/feed/search output, PostgreSQL migrations and repositories,
S3-compatible media/snapshot/artifact storage, logical backup/restore,
incremental publication, generic OIDC, an isolated comment service, and
fail-closed `$0` preflight checks.

Local integration covers PostgreSQL and S3 wire/API behavior, job idempotency,
image validation, recovery checksums, 1,000-article invalidation bounds,
candidate corruption, concurrent activation, and provider-outage readability.
Production remains `pilot-pending` until the repository owner chooses real
providers and records DNS, TLS, cache, identity, rate-limit, outage, restore,
and rollback evidence. See [deployment.md](./deployment.md).

## Source inspection baseline

The source was inspected from `https://www.publisher.com/`, its robots file,
sitemap, Atom feed, article links, and page links on 2026-08-17. It reported
eight posts and four categories. The checked-in dataset is a development
fixture, not a released platform dataset.
