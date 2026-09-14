---
status: in-progress
type: INFRA
tags: [web, rest, auth]
authority: delegated
---

# INFRA-005: Complete multi-publication management and AiTrendTimes activation

## Problem

The production platform currently exposes only the XRTechNews public Pages
project and its `default` administrator site. Its partial multi-site path is
not sufficient: site identity is environment-configured and the versioned
machine API does not yet cover every management capability. A new AI-news
publication, AiTrendTimes.com, must operate as a separately managed site
without sharing content, canonical URLs, public artifacts, comments, audit
history, or authorization scope with XRTechNews. The management solution must
provide every supported capability independently through both the human web UI
and agent CLI/API.

## Architecture Review

### Affected Scope

- Cloudflare Pages: a separate `aitrendtimes-public` static project and its
  production domain mapping.
- Vercel-hosted admin configuration: `ADMIN_SITES_JSON` site catalog entry and
  automation-key site allow-list.
- PostgreSQL site registry migration: the application-owned source of truth for
  publication identity and administrator assignment, replacing the
  environment-only catalog rather than adding a dual-read compatibility mode.
- Admin API and `@publisher/ops-cli`: a site-scoped bootstrap operation that
  creates an empty publication state from the configured site identity.
- Human admin UI: a publication-management screen with the same create, list,
  update, bootstrap, and archive capabilities as the machine interface.
- Admin PostgreSQL repository and its tests: an idempotent empty-state insert
  for a configured site, without copying another site's state or starter posts.
- All management domains: publication settings, authors, taxonomy, posts,
  media, plugins, publication jobs, archive/restore operations, comments,
  audit events, and per-site administrator assignment.
- API retirement: remove default-site-only v1 automation routes rather than
  retaining a legacy path beside complete site-scoped v2 routes.
- Existing Neon PostgreSQL state, existing S3-compatible store, and the
  publication worker: only the `aitrendtimes` site namespace.
- Reusable operations documentation: `docs/adding-a-publication.ko.md`, this
  specification, and `.agents/tasks/INFRA-005.md`.

### Alternatives Considered

1. Create an independent repository, database, storage bucket, admin runtime,
   and public host. Pro: strongest operational separation. Con: duplicates the
   tested platform and makes one operator manage unnecessary credentials and
   releases.
2. Serve both publications from one Pages project and choose a site by host at
   runtime. Pro: one public deployment. Con: violates the static artifact
   boundary and risks cross-site content or cache leakage.
3. Use the existing multi-site contracts with a new static Pages project and a
   new `siteId`. Pro: preserves isolated content/release namespaces while
   reusing provider-neutral PostgreSQL and S3-compatible contracts. Con: each
   publication needs its own build, Pages deployment, and domain activation.
4. Ask an operator to initialize the site through a direct database script or
   browser form after catalog deployment. Pro: no API work. Con: violates the
   agent-first operations direction and makes the next publication error-prone.
5. Retain an environment-only site catalog and add a CLI bootstrap command.
   Pro: minimal initial change. Con: a human cannot independently create or
   administer the same publication lifecycle through the web UI.
6. Make the application-owned PostgreSQL site registry the single catalog,
   exposing the same site lifecycle through the authenticated UI and versioned
   CLI/API. Pro: both first-class control planes have complete, auditable
   capabilities. Con: requires one data migration and parity tests.
7. Limit UI/CLI parity to site creation and retain default-site-only settings,
   taxonomy, author, comment, and recovery actions. Pro: faster activation.
   Con: contradicts complete multi-publication management and leaves hidden
   cross-site operational risk.

### Decision

Choose alternatives 3 and 6, rejecting alternatives 5 and 7. The application-owned PostgreSQL site
registry replaces `ADMIN_SITES_JSON` as the sole runtime catalog, and existing
site identity is migrated once rather than preserved through a compatibility
read path. Both the authenticated UI and versioned CLI/API expose every
supported owner-authorized management capability with the same validation,
authorization, idempotency, audit records, stable machine errors, and
site-qualified input/output. Default-site-only v1 automation routes are
removed, not retained as compatibility behavior. A newly created site receives
a blank site-owned publication state; it neither imports generic starter posts
nor copies a different site's identity. Each publication has a separate static
Pages project. PostgreSQL rows, snapshots, build jobs, media, comments, audit
events, and R2-compatible object keys remain qualified by site ID; no new
runtime, proxy, queue, cache layer, database product, bucket, or
provider-specific application contract is added. DNS is the sole irreversible
action and will be performed only after a narrow owner confirmation.

The operating target is a free-plan or Hobby-scale budget while static public
delivery absorbs enterprise-scale read traffic. Public page views must resolve
to CDN-delivered immutable HTML/assets and never create database, admin-runtime,
or private-object-store reads. PostgreSQL remains limited to authenticated
administration, publication, audit, and comment write/moderation paths; dynamic
projections degrade to an SEO-complete static baseline. This is a read-delivery
capacity target, not a claim of unlimited writes, SLA, or provider-enforced
zero spend.

Comment threads use a mandatory `(siteId, slug)` identity. The static release
may expose a public comment-service origin and Turnstile site key, never a
credential; browser reads and submissions are delayed until the comment section
is used. Each site has an exact canonical-origin allowlist entry. The static
approved-comment baseline remains indexable and is retained if the interactive
service is unavailable. This keeps ordinary public HTML delivery DB-free while
preventing cross-site same-slug reads, cache invalidations, moderation, or
submissions.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing `xrtechnews-public`, `default`, and
      site-qualified paths were checked; `aitrendtimes` and
      `aitrendtimes-public` do not collide.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Read existing Cloudflare Pages, R2, Vercel, and admin-site configuration
   without exposing secrets.
2. Migrate the site catalog once to PostgreSQL and remove the environment-only
   catalog path. The authenticated UI and versioned machine API/CLI each create
   and bootstrap `aitrendtimes` from its own identity into an empty state;
   confirm that no XRTechNews data is selected or copied.
3. Complete site qualification and UI/API/CLI parity for every management
   domain, and remove default-only machine routes before activating the new
   production publication.
4. Materialize an `aitrendtimes` release and deploy it only to a new Pages
   project.
5. After explicit owner confirmation, attach the verified AiTrendTimes domain
   records to that new Pages project; verify desktop and mobile public output,
   canonical URLs, static assets, cache headers, and the admin site selector.
6. Record the provider-neutral reusable procedure for adding a publication,
   including authority boundaries, agent/CLI-first operations, site isolation,
   verification, rollback, and what never belongs in repository documentation.

## Affected Files

- `.agents/spec-docs/draft/INFRA-005-aitrendtimes-multisite-activation.md`
- `.agents/tasks/INFRA-005.md`
- `docs/adding-a-publication.ko.md`
- `apps/admin/app/api/v2/sites/[siteId]/bootstrap/route.ts`
- `apps/admin/app/api/v2/sites/route.ts` and related site lifecycle routes
- `apps/admin/app/SiteSelector.tsx` and publication-management UI components
- All `/api/*` management routes, their site-qualified v2 API replacements,
  and comment moderation routes.
- `apps/admin/app/lib/site-catalog.ts` and site-registry repository
- `apps/admin/app/lib/postgres-content-repository.ts`
- `apps/admin/app/lib/repository-seed.ts`
- `packages/persistence/migrations/admin/0004_site_registry.sql`
- `packages/ops-cli/bin/publisher.mjs`
- `packages/admin-client/src/*`
- Relevant admin, CLI, and repository contract tests.
- Deployment-provider environment configuration only; no repository secret or
  Cloudflare-specific application code is added.

## Completion Criteria

- [ ] TC-01: The UI and authenticated `GET /api/v2/sites` response both list
      `default` and `aitrendtimes`; the same non-default record has the selected
      AiTrendTimes HTTPS canonical origin and no environment-only catalog is read.
- [ ] TC-02: An authenticated site-scoped automation request for
      `aitrendtimes` bootstraps exactly one blank state with its own configured
      identity, subsequent bootstrap requests are idempotent, and a request without
      its exact allow-list is rejected.
- [ ] TC-03: The publication worker produces a verified candidate manifest
      whose `siteId` is `aitrendtimes`, with all snapshot and media logical paths
      under `sites/aitrendtimes/`.
- [ ] TC-04: Cloudflare Pages lists `aitrendtimes-public` as a project separate
      from `xrtechnews-public`, and its production deployment serves the verified
      `aitrendtimes` release without runtime database or admin requests.
- [ ] TC-05: After a recorded owner confirmation immediately before DNS
      mutation, AiTrendTimes' selected canonical hostname returns HTTP 200 with
      matching canonical/OG metadata, responsive desktop/mobile styling, and the
      standard static cache policy; `www.xrtechnews.com` remains unchanged.
- [ ] TC-06: `docs/adding-a-publication.ko.md` describes a provider-neutral,
      reusable multi-publication procedure without site-specific secrets, account
      identifiers, or a requirement to use a browser for agent operations.
- [ ] TC-07: `publisher site bootstrap --site <siteId> --non-interactive --json`
      invokes the versioned site-scoped bootstrap contract and returns a stable
      machine-readable result without exposing an automation token or database
      credential.
- [ ] TC-08: An owner can create, update, bootstrap, and archive a publication
      through either the authenticated web UI or the CLI/API, with matching
      validation, authorization, idempotency, and audit-visible operation results.
- [ ] TC-09: For settings, authors, taxonomy, posts, media, plugins,
      publish/build status, archive/restore, comments, audit history, and site
      administrators, each supported operation is site-qualified and is available
      through both the authenticated UI and CLI/API with matching authorization,
      validation, error code, idempotency, and audit behavior.
- [ ] TC-10: The repository contains no default-site-only v1 automation route,
      `ADMIN_SITES_JSON` runtime read, or unqualified cross-site management query;
      contract tests prove a caller from one site cannot read or mutate another
      site's records.

## Test Plan

| TC-ID | Test Type                    | Tool / Approach                                                                                    | Notes                                                                                                                                                                                                                                         |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | integration + browser        | PostgreSQL site-registry fixture, authenticated `GET /api/v2/sites`, and admin UI test             | Preconditions: migrated existing site plus newly created AiTrendTimes; assert the UI and machine response derive the same record and the environment-only path is absent.                                                                     |
| TC-02 | security integration         | Admin API integration tests with PostgreSQL fixture                                                | Preconditions: one configured but uninitialized site and one non-matching key; assert blank state, catalog-derived identity, idempotency, no cross-site rows, and a structured denial.                                                        |
| TC-03 | integration                  | Publication worker manifest inspection and S3-compatible object listing                            | Preconditions: only the AiTrendTimes site state is selected; verify `siteId` and logical prefixes, never raw provider credentials.                                                                                                            |
| TC-04 | deployment smoke             | Wrangler Pages project/deployment listing plus static curl                                         | Preconditions: the new project exists and a candidate passed verification; assert project isolation and no runtime dependency from static output.                                                                                             |
| TC-05 | manual + HTTP smoke          | Owner-confirmed Cloudflare DNS action, curl, and browser mobile/desktop inspection                 | Preconditions: owner grants narrow DNS confirmation after target records are shown; confirm both new hostname behavior and the unchanged XRTechNews origin.                                                                                   |
| TC-06 | documentation review         | `rg` secret/account-identifier scan and manual review                                              | Verify the Korean reusable guide uses role-based placeholders, retains the PostgreSQL/S3-compatible/static-host contracts, documents explicit DNS authority, and directs agents to CLI/API rather than browser controls.                      |
| TC-07 | CLI integration              | `pnpm --filter @publisher/ops-cli test`                                                            | Preconditions: local authenticated API fixture; assert the CLI's stable JSON schema, exact site scope, idempotency behavior, and redaction of credentials.                                                                                    |
| TC-08 | UI/API/CLI parity            | Admin integration tests, ops-cli fixture tests, and browser UI test                                | Preconditions: owner identity and an isolated PostgreSQL fixture; run the same lifecycle through each control plane and compare validation, authorization, idempotent results, and audit events.                                              |
| TC-09 | end-to-end parity matrix     | Domain contract tests, admin API integration tests, ops-cli tests, and authenticated browser tests | Preconditions: two initialized sites, distinct administrator assignments, and independent content/comments/media fixtures; execute every supported domain operation in both control planes and prove equivalent result/error/audit semantics. |
| TC-10 | regression and security scan | `rg` guard plus multi-site integration tests                                                       | Preconditions: migrated two-site PostgreSQL fixture; assert removed default-only/environment catalog paths and denial of every cross-site read/write attempt.                                                                                 |

## Tasks

- [ ] `.agents/tasks/INFRA-005.md` — active implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready
Frontmatter begins with a YAML block and declares `status: draft`, one permitted `type: INFRA`, non-empty `tags`, and `authority: delegated`.
Problem identifies the current single-publication exposure and the reproduction condition of activating AiTrendTimes alongside XRTechNews; it contains no TBD/TODO placeholder.
Architecture Review has four checked checklist entries, including sibling-scan collision evidence; three alternatives each state pro/con, and the Decision records the isolation-versus-operations trade-off.
Completion Criteria contain six observable TC-prefixed criteria (TC-01 through TC-06), covering each scoped activation and reusable-documentation outcome without prohibited vague completion language.
Test Plan has exactly six corresponding TC rows; every row supplies a test type, concrete tool/approach, and non-empty verification notes. The owner-confirmed DNS row documents its authority prerequisite and combines it with HTTP/browser smoke checks.
Tasks placeholder and an initially empty Evidence Log were present before this entry.

### [GATE-WRITE: RECHECK] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready
Frontmatter remains a YAML block with `status: draft`, permitted `type: INFRA`, `tags`, and `authority: delegated`.
Problem still identifies the single-publication condition and the incorrect cross-publication sharing outcome when AiTrendTimes is activated; it contains no TBD/TODO placeholder.
Architecture Review now covers the CLI/bootstrap scope, has four checked checklist entries with sibling collision evidence, four alternatives with pro/con statements, and a Decision that states the isolation, agent-first, and operational trade-offs.
Completion Criteria contain seven observable TC-prefixed criteria (TC-01 through TC-07), including blank-state idempotency and non-interactive, credential-redacting CLI bootstrap behavior; none uses prohibited vague completion language.
Test Plan has exactly seven matching TC rows; every row provides a type, concrete tool/approach, and non-empty verification notes. The owner-confirmed DNS row retains its explicit authority precondition and HTTP/browser smoke coverage.
Tasks placeholder remains present; this recheck appends to the prior GATE-WRITE evidence as requested.

### [GATE-WRITE: RESCOPE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready
Frontmatter remains valid with `status: draft`, permitted `type: INFRA`, `tags`, and `authority: delegated`; the Problem retains a concrete single-publication symptom and activation condition without placeholders.
Architecture Review identifies the PostgreSQL site-registry migration and UI/API/CLI parity scope, has four checked checklist entries with sibling collision evidence, and documents six alternatives with pro/con statements.
Decision explicitly selects alternatives 3 and 6, replacing `ADMIN_SITES_JSON` with one PostgreSQL runtime catalog rather than a dual-read compatibility path; it states the isolation, lifecycle-parity, migration, and operational trade-offs.
Completion Criteria contain eight observable TC-prefixed criteria (TC-01 through TC-08), including registry replacement, blank-state bootstrap, static deployment isolation, documentation, credential-redacting CLI use, and equivalent human/machine lifecycle controls; no criterion uses prohibited vague completion language.
Test Plan has exactly eight matching TC rows with non-empty test type, tool/approach, and Notes cells. The owner-confirmed DNS row documents the required authority boundary and HTTP/browser verification coverage.
Tasks placeholder remains present; this rescope recheck appends to the prior GATE-WRITE evidence as requested.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-14

**Status upgrade:** review-ready → approved
`authority: delegated` is present, and the completed Architecture Review records affected scope, sibling-scan evidence, six alternatives with trade-offs, the PostgreSQL single-registry decision, and a verification plan.
Standing delegation is defined by `.agents/rules/authority-delegation.md`; it applies to this ordinary implementation decision without a second item-by-item approval.
The owner’s current direction supplies the product intent: create the separate AI publication, preserve a reusable neutral procedure, make subsequent publication setup agent-friendly, and provide full independent UI and CLI controls.
Read-only repository inspection found no implementation-file changes or INFRA-005 task file before this approval gate; the spec itself is the only untracked item in scope.
Execution-time exceptions remain: billing or chargeable-resource changes, production DNS mutation, production-data deletion/overwrite, external messages, account changes, secret disclosure, and any new external runtime/proxy/queue/cache/managed service still require narrow confirmation immediately before execution.

### [GATE-WRITE: COMPLETE-MULTISITE-RESCOPE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready
Frontmatter is a valid YAML block with `status: draft`, one permitted `type: INFRA`, `tags`, and `authority: delegated`; the Problem gives the concrete partial-multisite failure condition without TODO/TBD placeholders.
Architecture Review covers the complete management-domain parity and v1 retirement scope, has all four checklist entries checked with sibling collision evidence, and documents seven alternatives with pro/con statements.
Decision selects alternatives 3 and 6, rejects the incomplete catalog/parity alternatives, removes the `ADMIN_SITES_JSON` runtime catalog and default-site-only v1 routes instead of retaining compatibility paths, and states the isolation, parity, migration, and operational trade-offs.
Completion Criteria contain ten observable TC-prefixed criteria (TC-01 through TC-10), covering site registry, all management domains, UI/API/CLI parity, static isolation, and cross-site denial without prohibited vague completion language.
Test Plan has exactly ten matching TC rows; every row supplies a non-empty test type, concrete tool/approach, and Notes cell. The owner-confirmed DNS row retains its explicit authority prerequisite and HTTP/browser verification coverage.
Tasks placeholder remains present; this complete-multisite rescope recheck appends to the prior Evidence Log as requested.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-14

**Status upgrade:** review-ready → approved
`authority: delegated` and the completed Architecture Review satisfy the standing delegation defined in `.agents/rules/authority-delegation.md` for this final complete-multisite implementation scope.
The owner’s current directives cover the separate AI publication, reusable neutral setup procedure, easier subsequent publication creation, and complete independent human UI and agent CLI/API control for every supported management domain.
Read-only inspection found no INFRA-005 implementation-file changes or task file before this gate; the outstanding changes are documentation/specification only.
Execution-time exceptions remain unchanged: chargeable-resource or billing changes, production DNS mutation, production-data deletion/overwrite, external messages, account changes, secret disclosure, and a new external runtime/proxy/queue/cache/managed service require narrow confirmation immediately before the final action.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-14

**Status upgrade:** approved → in-progress
`.agents/tasks/INFRA-005.md` exists and is recorded in the spec's `## Tasks` section as the active implementation record.
Its Plan maps TC-01 through TC-10 one-for-one: registry/catalog replacement, bootstrap authorization, release isolation, Pages deployment, DNS verification, reusable manual, CLI bootstrap, lifecycle parity, complete management-domain parity, and removal/isolation regressions.
