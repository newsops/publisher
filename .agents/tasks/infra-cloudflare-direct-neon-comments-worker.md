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
- [x] Verify local Worker/static builds, then deploy and configure production
      origins only with observed evidence.
- [ ] Record a real human-verified submission and authenticated moderation
      approval cycle; public reads, CORS, invalid-token failure closure, static
      Pages output, and production admin deployment have been observed.

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
- Pushed direct-Neon Worker implementation and regression coverage to
  `origin/main` as `5333913` after the repository pre-push gate passed:
  typecheck, static build, 126 harness tests, portability scans, and secret
  scan.
- Read-only Cloudflare API observation confirms `publisher-comments` does not
  yet exist. The existing public Pages deployment remains separate; no Worker
  or production DNS change has been made.
- Cloudflare rejected the first production Worker deploy because its API clock
  considered the configured `2026-09-13` compatibility date to be in the
  future. The configuration is corrected to the observed allowed date before
  retrying; no architecture or persistence decision changed.
- Cloudflare Worker `publisher-comments` is deployed at its Workers HTTPS
  origin with direct Neon secrets, Siteverify endpoint/secret, exact public
  origin CORS, and no database binding or proxy. A read returned 200 with the
  expected CORS origin; an invalid verification token returned 403 and created
  no comment. The static Pages production deployment now embeds that Worker
  origin and the public Turnstile site key with exact CSP origins. Vercel
  production contains the matching comments origin/moderation token and its
  redeploy is ready.

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
