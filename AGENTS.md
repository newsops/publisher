# AGENTS.md

This repository is a pnpm monorepo for Publisher.

## Document discovery

- `CLAUDE.md` contains hard gates for development and verification.
- `.agents/rules/index.md` routes engineering rules.
- `.agents/skills/index.md` routes procedural skills.
- `.agents/project-structure.md` is the source of truth for package boundaries.
- `.agents/spec-docs/` contains the spec gate lifecycle.
- `.agents/tasks/` contains active work records.
- `docs/development-spec.md` links to the canonical platform spec.
- `docs/ai-assisted-deployment.ko.md` is the mandatory first stop for every
  deploy, setup, hosting, provider-selection, or onboarding request.

## Commands

```bash
pnpm install
pnpm dev
pnpm dev:admin
pnpm build
pnpm build:admin
pnpm typecheck
pnpm test
pnpm harness:scan
```

## Architecture rules

- `apps/site` is a static-only public publication. It must build without runtime secrets or a database connection.
- `apps/admin` is a separate authenticated surface on an unlinked admin domain and must not be deployed under the public site's origin.
- `packages/content` owns content types, slug rules, and the build input contract.
- Public route implementation is independent, while existing public URLs remain compatible where practical.
- No Blogger, jQuery, third-party theme runtime, or analytics script is copied into the new public bundle without an explicit decision.
- Secrets belong in environment variables or the deployment provider; never commit them.
- Relational persistence uses PostgreSQL, and media/snapshots use the tested
  S3-compatible API subset. Hosted services are replaceable operator choices,
  never application contracts.

## Deployment assistance

- Before opening provider-specific instructions or running deployment commands,
  read `docs/ai-assisted-deployment.ko.md` completely and follow its interview,
  capability, cost, authority, secret, verification, and handoff gates.
- Let the user choose each platform role after presenting current official
  facts and trade-offs. Never equate a free allowance with billing-free access.
- Do not create chargeable resources, change production DNS, or claim deployment
  success without the guide's required authority and observed evidence.
- The repository owner is the first pilot customer. The flow remains
  `pilot-pending` until that owner completes and records the real walkthrough.

## Language policy

- Production code and comments: English.
- Documentation: English unless a document is explicitly marked Korean.
- User communication: Korean.
