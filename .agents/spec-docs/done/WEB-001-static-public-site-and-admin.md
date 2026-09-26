---
status: done
type: SCREEN
tags: [web, static, deployment, postgresql, s3]
---

# WEB-001: Static public publication and separate admin pilot

## Problem

Publisher has a production static public site, a separate authenticated admin,
and an isolated comments Worker, but the prior WEB-001 document describes
retired provider-specific paths that are not the product contract. The first
owner pilot needs one current, portable contract for static delivery, separate
admin access, PostgreSQL, S3-compatible media/snapshots, and verified comment
moderation without a public request-time dependency on private services.

The public artifact must remain readable with no runtime database connection,
while administration and comments use separate authenticated endpoints. A
deployment must never require D1, Hyperdrive, Cloudflare Access, a specific
object store, or a legacy compatibility mode.

The drift is reproduced by opening the prior active `WEB-001` during the
owner-pilot release checklist: its completion criteria ask for D1/Access/DNS
evidence even though the deployed public Pages site, Vercel admin, direct-Neon
comments Worker, and R2-compatible storage have no such application contract.

## Architecture Review

### Affected Scope

- `apps/site`: deterministic static routes, SEO, public comments projection,
  and no runtime secrets or database connection.
- `apps/admin`: local account/session authentication, content management, and
  publish orchestration on an unlinked admin origin.
- `apps/comments`: separate HTTP Worker using direct standard PostgreSQL and
  optional human verification.
- `packages/content`, `packages/persistence`, and `packages/publication`:
  portable content, PostgreSQL, S3-compatible snapshot, and release contracts.
- `scripts/harness` and deployment documentation: regression and owner-pilot
  evidence without committed provider credentials.

### Alternatives Considered

1. Put public site and admin behind one Node runtime. Pro: fewer deployments.
   Con: public delivery reaches application and database dependencies.
2. Couple public data to D1/R2/Access. Pro: fewer selected-provider settings.
   Con: changes the portable PostgreSQL/S3/local-account contract.
3. Keep public delivery static and deploy admin/comments separately. Pro:
   public HTML is independent of private services and each host is replaceable.
   Con: publication requires an explicit verified release step.

### Decision

Choose alternative 3. Owner-pilot adapters are Cloudflare Pages for `www`,
Vercel for the separate admin origin, Neon through ordinary PostgreSQL URLs,
Cloudflare R2 through the tested S3-compatible subset, and a direct-Neon
comments Worker with optional Turnstile verification. These are operator
choices, not application contracts. The public site never has request-time DB,
admin, object-store, or comments Worker access.

### Architecture Review Checklist

- [x] Affected packages and deployment surfaces are identified.
- [x] Existing implementation and public/admin/comments boundaries were
      scanned; no D1, Hyperdrive, or public database path is required.
- [x] At least two alternatives and trade-offs are documented.
- [x] The portable static-first decision is explicit.

## Solution

### Public delivery contract

- `apps/site` builds `apps/site/out` as static HTML/assets with canonical SEO,
  feeds, sitemap, and build-generated search data.
- `www` delivers only the generated artifact through a CDN-backed static host.
  It has no admin route, runtime secret, database SDK, or content-store fetch.
- Comments are progressive enhancement only: approved reads and verified writes
  use the separate Worker; an outage cannot remove static article HTML.

### Control-plane contract

- Admin is on a separate, unlinked domain with application-owned accounts,
  revocable sessions, role checks, CSRF protection, rate limiting, audit logs,
  and noindex/robots controls.
- Admin and comments use separate PostgreSQL URLs/roles. PostgreSQL is the only
  relational application contract; selected Neon service URLs remain secrets.
- Snapshots and media use the repository-tested S3-compatible API subset. The
  selected R2 bucket is private and never becomes a public application API.
- Publishing is idempotent, materializes a validated static candidate, and only
  promotes a verified release. The static host receives public artifact files,
  not private database or object-store credentials.

### Security and resilience contract

- Static delivery has immutable asset and bounded document cache policies.
  Article HTML still renders when JavaScript or comments are absent.
- The Worker permits only the configured public origin, fails closed on invalid
  verification tokens, creates pending comments, and exposes authenticated
  moderation.
- Provider-specific paid features, proxies, extra caches, and runtime layers
  are not implied. Later additions need a new architecture decision and
  operator approval.

## Affected Files

- `apps/site/**`, `apps/admin/**`, `apps/comments/**`
- `packages/content/**`, `packages/persistence/**`, `packages/publication/**`
- `scripts/harness/**`
- `docs/deployment.md`, `docs/ai-assisted-deployment.ko.md`

## Completion Criteria

- [x] TC-01: `pnpm build` produces deterministic static `apps/site/out/`
      without runtime secrets or a database connection.
- [x] TC-02: Static-output and boundary tests prove public routes, SEO/feed
      metadata, and absence of admin/database/private credential material.
- [x] TC-03: Admin authentication rejects unauthenticated operations and the
      deployed admin is on a separate, noindex origin.
- [x] TC-04: The publish workflow contract proves validated snapshot creation,
      idempotent operation identity, and public-artifact-only delivery input.
- [x] TC-05: A live public article, feed, and sitemap return through the
      selected static host; JavaScript-disabled rendering remains readable.
- [x] TC-06: A verified comment completes pending submission, authenticated
      approval, and subsequent approved public read without changing static
      article availability.
- [x] TC-07: `pnpm typecheck`, `pnpm test`, `pnpm build`, and
      `pnpm harness:scan` pass without provider credentials.
- [x] TC-08: Deployment documentation names only portable contracts and secret
      destinations, with no D1, Hyperdrive, mandatory Access, or paid runtime
      dependency.

## Test Plan

| TC-ID | Test Type        | Tool / Approach                                                                                                                                       | Notes                                                                   |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TC-01 | build            | `pnpm build`; `scripts/harness/__tests__/static-deployment-contract.test.mjs` → `static deployment contract`                                          | Must pass with no production secrets.                                   |
| TC-02 | contract         | `static-deployment-contract.test.mjs` → `contains only public static routes and no admin/API output`; `pnpm harness:scan`                             | Inspects public output and source boundaries.                           |
| TC-03 | security + live  | `admin-auth-contract.test.mjs` → `admin authentication contract`; deployed admin URL                                                                  | Local auth plus distinct noindex-origin observation.                    |
| TC-04 | integration      | `publish-workflow-contract.test.mjs` → `publish workflow contract`; publication tests                                                                 | Covers idempotency and validated candidate input.                       |
| TC-05 | live browser     | `scripts/harness/browser-smoke.mjs` → `article-no-javascript-mobile`; HTTPS reads                                                                     | Anonymous (`N/A` account) static article at `390x844` with JS disabled. |
| TC-06 | live integration | `comments-worker-adapter-contract.test.mjs` → `preserves write and moderation semantics through the Worker transport`; Worker/API/admin browser smoke | Actual verification and moderation used no committed test secret.       |
| TC-07 | regression       | `pnpm typecheck && pnpm test && pnpm build && pnpm harness:scan`                                                                                      | Full credential-free regression: 32 files / 133 tests and six scans.    |
| TC-08 | documentation    | `scripts/harness/scan-portable-runtime.mjs` → `portable-runtime`; deployment-doc review                                                               | Confirms portability and secret boundaries.                             |

## Tasks

- [x] `.agents/tasks/completed/WEB-001.md` — archived after verification with
      one completed task for each criterion.
      for each completion criterion.

## Scope History

This replaces retired WEB-001 assumptions of D1, Hyperdrive, mandatory
Cloudflare Access, source-site migration, and provider-bound administration.
The user selected Pages public delivery, a separate Vercel admin, Neon,
R2-compatible storage, direct Worker connections, and local authentication.

## Evidence Log

### [GATE-WRITE] — ❌ FAIL | 2026-09-13

**Status remains:** draft
**Failed criteria:**

- Problem reproduction condition: The Problem identifies the retired-provider
  document as the incorrect behavior, but does not state a reproducible
  condition (for example, the document/command and the deployment or owner
  pilot situation in which the obsolete requirement is encountered).
  **Required action:** Add an explicit, repeatable reproduction condition to
  the Problem section, then rerun GATE-WRITE.

**Verified:** YAML frontmatter has `status: draft`, one permitted `SCREEN`
type, and non-empty tags; Architecture Review has four checked items, a
completed sibling-scan statement, three pro/con alternatives, and a
trade-off-based decision. Eight TC-N criteria use command or observable forms
and map one-to-one to eight non-empty Test Plan rows with no manual-only row.
Tasks is a placeholder and this was the first Evidence Log entry.

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready

- Frontmatter: the document starts with YAML and contains `status: draft`, the
  permitted single type `SCREEN`, and non-empty `tags`.
- Problem: identifies provider-contract drift, states the owner-pilot
  reproduction action (open prior active `WEB-001` during the release
  checklist), and records the observable mismatch: D1/Access/DNS evidence is
  requested despite the deployed Pages, Vercel, direct-Neon Worker, and
  S3-compatible storage contract; no unresolved placeholder is present.
- Architecture Review: all four checklist rows are checked, including the
  completed public/admin/comments boundary sibling scan; three alternatives
  each state a pro and con; the Decision selects static-first delivery for the
  stated portability and private-service-independence trade-off.
- Completion Criteria: TC-01 through TC-08 are eight uniquely prefixed,
  command or observable behavior criteria without prohibited vague wording.
- Test Plan: its eight non-empty rows map one-to-one to TC-01 through TC-08;
  every row has a test type, tool/approach, and non-empty strategy note, with
  no TBD or manual-only entry.
- Structure: the required post-approval Tasks placeholder exists. The prior
  failed GATE-WRITE entry records the first attempt; this rerun follows its
  required Problem correction.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved

- The user explicitly selected the intended public/admin topology: “www. 는 cf
  pages가 맞다. admin. 은 vercel도 좋고 어디든 좋다. ... comments. 는 www.와
  동일한 업체로 하자”.
- The user explicitly selected the portable persistence and storage contract:
  “그러면 Cloudflare를 채택하자. postgreSQL만 어쩔수 없이 neon으로 하는거야”,
  then activated R2; this matches PostgreSQL plus the S3-compatible subset and
  does not make either selected provider an application contract.
- The user explicitly required comments from launch and application-owned
  accounts: “댓글은 처음부터 켭니다” and “계정관리나 인증은 너가 직접 구현해야
  의존성이 없다”.
- The user then gave implementation approval, most recently “승인함”, after the
  current static Pages, separate Vercel admin, direct Worker, Neon, R2, and
  local-auth design had been presented.
- The reviewed frontmatter (`SCREEN`, `web, static, deployment, postgresql,
s3`) and Architecture Review remain limited to those approved choices; no
  post-approval change adds D1, Hyperdrive, mandatory Access, a paid runtime,
  proxy, or another provider-bound application layer.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress

- Tasks file: `.agents/tasks/WEB-001.md` exists and is the exact path recorded
  in this document's `## Tasks` section.
- TC-01 through TC-08: the task file has one distinct planned verification
  task for each completion criterion: secret-free static build; public output
  and SEO boundaries; separate admin authentication; publish workflow;
  live static/JavaScript-disabled reading; pending-to-approved comments;
  credential-free regression; and portable deployment documentation.

### [IMPLEMENTATION / VERIFICATION] — ✅ PASS | 2026-09-13

- **TC-01:** `pnpm build` completed with a static Next export: 22 routes were
  generated and the post-build steps normalized 21 HTML files and generated
  sitemap, feeds, search index, `robots.txt`, and `llms.txt`. No production
  provider credential was supplied to the command.
- **TC-02:** `static-deployment-contract.test.mjs` passed, and
  `pnpm harness:scan` passed both `static-boundary` and `static-output` scans.
  They verify static export configuration, prohibited private-runtime absence,
  required public routes, generic feeds, sitemap, `llms.txt`, and search data.
- **TC-03:** `admin-auth-contract.test.mjs` passed. Observed live
  `https://admin.example.com/` response had Vercel delivery and
  `private, no-cache, no-store`; its unauthenticated `/api/posts` response was
  `401 {"error":"Authentication required"}`. The public origin is separately
  served by Cloudflare Pages.
- **TC-04:** `publish-workflow-contract.test.mjs` passed, covering validated
  snapshot/candidate flow, idempotent operation identity, and public-artifact
  delivery input.
- **TC-05:** HTTPS reads returned `200` for the live article,
  `/feed.xml`, and `/sitemap.xml`. The production browser harness passed with
  Chrome against `https://news.example.com`; this is an anonymous public
  static route, so the test-account label is **N/A**. Its
  `article-no-javascript-mobile` scenario used the exact `390x844` viewport
  with JavaScript disabled and returned `200`, had an author link, keyboard
  focus, no horizontal overflow, and zero console errors.
- **TC-06:** In the owner-pilot Worker verification, a real Turnstile-verified
  submission returned `202`, appeared pending in the authenticated admin,
  was approved there, and then appeared in the Worker public approved read and
  in the unchanged live static article. The deployed Worker uses direct Neon
  PostgreSQL and only permits the configured public origin.
- **TC-07:** `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm harness:scan` all passed without provider credentials. Harness result:
  32 files / 133 tests passed; all six repository scans passed.
- **TC-08:** The portable-runtime scan passed. A targeted repository scan found
  only explicit prohibitions of D1, Hyperdrive, and mandatory Cloudflare Access
  in deployment documentation; no selected provider is an application runtime
  contract and no paid runtime layer is required.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-13

**Status remains:** in-progress
**Failed criteria:**

- Browser verification evidence: the anonymous public browser check recorded a
  mobile scenario but omitted both its explicit N/A account label and exact
  viewport.
  **Required action:** Record `N/A — anonymous public static route` and the
  `390x844` viewport for `article-no-javascript-mobile`, then rerun this gate.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying

- All eight tasks in `.agents/tasks/WEB-001.md` are marked `[x]`; Blockers is
  `None`.
- `pnpm --filter @publisher/site build` passed: 22 static routes were built,
  and post-build normalized 21 HTML files.
- `pnpm --filter @publisher/site test` passed.
- Agent-run browser evidence is recorded above for the anonymous (`N/A`)
  public route at exact `390x844` viewport with JavaScript disabled; source
  `scripts/harness/browser-smoke.mjs` independently defines that scenario.
- The only command warning was local Node `v24` versus the repository's
  declared Node 22 range; it did not affect build or test success.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`pnpm build` completed a static export with 22 generated routes; the site
post-build normalized 21 HTML files and generated public metadata without
runtime provider credentials. Test reference:
`scripts/harness/__tests__/static-deployment-contract.test.mjs` — `static
deployment contract`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

`pnpm harness:scan` reported passing `static-boundary` and `static-output`
scans, including absence of forbidden private runtime paths and presence of
static feeds/sitemap/search metadata. Test reference:
`static-deployment-contract.test.mjs` — `contains only public static routes and
no admin/API output`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

`admin-auth-contract.test.mjs` passed; a live unauthenticated request to
`https://admin.example.com/api/posts` returned
`401 {"error":"Authentication required"}` while the separate admin response
was private/no-store. Test reference: `admin authentication contract`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

`publish-workflow-contract.test.mjs` passed its `publish workflow contract`
tests, proving validated immutable local snapshot creation and fail-closed
production storage configuration. The public deployment input is static output,
not a database or object-store credential.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

HTTPS reads to the article, `/feed.xml`, and `/sitemap.xml` returned `200`.
`CHROME_BIN='…/Google Chrome' PUBLIC_BROWSER_ONLY=1
PUBLIC_BROWSER_ORIGIN=https://news.example.com pnpm harness:browser` passed;
anonymous (`N/A`) scenario `article-no-javascript-mobile` at `390x844` with
JavaScript disabled returned `200` with readable author link, focusable control,
no overflow, and zero console errors. Test reference:
`scripts/harness/browser-smoke.mjs` — `article-no-javascript-mobile`.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-13

The actual Turnstile-verified comment POST returned `202`, authenticated admin
approval succeeded, and the approved public Worker read and unchanged static
article displayed the comment. Test reference:
`scripts/harness/__tests__/comments-worker-adapter-contract.test.mjs` —
`preserves write and moderation semantics through the Worker transport`.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-09-13

`pnpm typecheck && pnpm test && pnpm build && pnpm harness:scan` completed
without provider credentials. Observed result: 32 test files / 133 tests passed
and six scans passed. The only warning was the nonblocking local Node 24 versus
declared Node 22 engine range.

### [GATE-COMPLETE: TC-08] — ✅ PASS | 2026-09-13

`pnpm harness:scan` passed `portable-runtime`; targeted `rg` inspection found
only explicit prohibitions of D1, Hyperdrive, and mandatory Access in the
deployment documents. Test reference: `scripts/harness/scan-portable-runtime.mjs`
— `portable-runtime` scan.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done

- TC-01 through TC-08: all Completion Criteria are checked and each has a
  matching `[GATE-COMPLETE: TC-N]` evidence entry above with an exact command
  or observed live action, its actual result, and a test reference.
- Test Plan: all eight TC-N rows name a concrete test file/function or command
  and retain a non-empty verification strategy; no criterion is silently
  untested or skipped.
- Task archive: `.agents/tasks/completed/WEB-001.md` exists, marks all eight
  tasks complete, records no blockers, and is the archived path in `## Tasks`.
