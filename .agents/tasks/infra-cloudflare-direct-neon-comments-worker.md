# Cloudflare comments Worker with direct Neon PostgreSQL

- **Status**: in-progress
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: apps/comments, packages/persistence, apps/admin, apps/site, docs

## Objective

Deploy the isolated comments service to the selected Cloudflare Worker provider
while keeping Neon as the only relational database and adding no connection
proxy or Cloudflare persistence layer.

## Plan

- [x] Replace the uncommitted Hyperdrive adapter/configuration with direct Neon
      secret wiring and a Worker-safe PostgreSQL import boundary.
- [x] Update Worker transport and static-boundary regression coverage.
- [x] Document the direct Neon deployment and secret destinations without
      committing credentials or account IDs.
- [ ] Verify local Worker/static builds, then deploy and configure production
      origins only with observed evidence.
- [ ] Record observed public, comments, and moderation smoke evidence.

## Progress

### 2026-09-13

- Re-scoped INFRA-001 before any Cloudflare database configuration was created.
- Direct Neon scope passed GATE-WRITE and GATE-APPROVAL.
- Direct Worker configuration now has no database binding or proxy. It receives
  `COMMENTS_DATABASE_URL` only as a Worker secret and passes it to the standard
  PostgreSQL driver.
- Local verification passed: comment Worker typecheck and dry-run bundle,
  comments-enabled static-site build, 124 harness tests, and a static-output
  secret scan.
- The local shell runs Node 24 while the repository declares Node 22; all
  checks above passed with the existing engine warning.

## Decisions

- Cloudflare executes the comments HTTP Worker only; Neon PostgreSQL remains
  the comments persistence system.
- Hyperdrive and D1 are not used.

## Blockers

- Human-verification provider selection is pending. The comment write contract
  already fails closed without a valid verification token; deploying comments
  with writes enabled requires the operator to approve either Turnstile or a
  different verifier before the corresponding service/key can be created.

## Result
