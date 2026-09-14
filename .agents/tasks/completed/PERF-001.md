# Define the static CDN cache boundary

- **Status**: completed
- **Created**: 2026-09-14
- **Branch**: fix/restore-public-editorial-design
- **Scope**: packages/publication, apps/site, scripts/harness, docs

## Objective

Separate semantic HTML from presentation assets and let ordinary static CDN
caching retain only content-addressed files without any Cloudflare-specific
runtime feature.

## Plan

- [x] Generate a portable `/_headers` artifact with immutable and revalidation boundaries.
- [x] Move immutable theme, projection, and approved-comment payloads into explicit hashed namespaces while keeping stable pointers stable.
- [x] Verify theme-only updates reuse article HTML and reject incomplete cache-policy releases.
- [x] Document the provider-neutral cache-class mapping and standard Cloudflare Pages behavior.
- [x] Run focused, full, and live deployment verification before lifecycle completion.

## Progress

### 2026-09-14

- GATE-WRITE and GATE-APPROVAL passed.
- User clarified that HTML/CSS separation and ordinary CDN use are required;
  Workers, Functions, cache rules, and other Cloudflare-specific layers remain
  out of scope.
- Focused cache-boundary tests, the 1,000-article invalidation regression, the
  complete 175-test suite, build, typecheck, lint, and harness scan pass.
- Production-snapshot browser checks pass at 1440px and 390px, including home
  and article loads with JavaScript disabled and synchronous `current.css`.
- Cloudflare Pages deployment `83b4aa27` is active on the custom domain. Hashed
  theme and media requests changed from `MISS` to `HIT`; stable theme CSS
  changed from `MISS` to `REVALIDATED` with the expected cache directives.

## Decisions

- HTML owns semantic content and SEO; synchronously linked CSS owns presentation.
- Only hashed immutable paths receive a long browser cache lifetime.
- Stable HTML, current-theme CSS, runtime metadata, search, and comment pointers revalidate.

## Blockers

- None.

## Result

The portable immutable/revalidation cache boundary is verified locally and on
the active production Pages deployment.
