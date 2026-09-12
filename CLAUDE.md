# CLAUDE.md

Publisher is a static-first news publication with a separately deployed admin surface.

## Hard gates

- Read the relevant spec before changing a public route, content contract, deployment setting, or admin behavior.
- Keep public site builds deterministic and independent from runtime secrets.
- Run `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` before declaring foundation work complete.
- Run browser verification after UI changes.
- Do not use Git worktrees in this repository.
- For every deploy, setup, hosting, provider-selection, or onboarding request,
  read `docs/ai-assisted-deployment.ko.md` before provider-specific docs or
  commands. Preserve its user-choice, billing, authority, secret, owner-first
  pilot, and observed-evidence gates.
- PostgreSQL, the tested S3-compatible API subset, and standard OIDC are the only
  production contracts. Do not add provider-specific storage or identity paths.
  Free allowance does not imply that billing activation is absent.

## Next.js rules

- This repository uses the App Router.
- `params` and `searchParams` are promises in Next.js 16 and must be awaited.
- `apps/site` uses `output: 'export'`; server actions, API routes, and runtime database access do not belong there.
- `apps/admin` owns authenticated mutations and publish orchestration.

## Content rules

- `packages/content` is the only owner for public content types and URL derivation.
- Every post requires a stable slug, publication timestamp, categories, excerpt, body, and metadata suitable for SEO.
- HTML from editors must be sanitized at the admin boundary before it enters the public build.
