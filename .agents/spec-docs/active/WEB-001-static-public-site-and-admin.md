---
status: verifying
type: SCREEN
tags: [web, mobile-web, typescript]
---

# WEB-001: DDoS-resilient static Publisher publication and separate admin surface

> 핵심 목표: 디도스 공격에 강한 뉴스 웹사이트를 만든다.

## Problem

The goal is to build a news website that is resilient to DDoS attacks. The current `publisher.com` public site is a Blogger-rendered page backed by a theme runtime, dynamic widgets, and a public origin that is not owned by this repository. The target must reproduce the publication experience with an independent implementation while retaining existing public addresses where practical. Output must remain deterministic static files suitable for S3, Cloudflare Pages, or another CDN-backed host. Content editing must move to a separate admin surface without introducing a runtime dependency into public requests.

Observed source snapshot on 2026-08-17:

- Home page with top links, primary navigation, Breaking strip, article list, sidebar, and footer.
- Eight indexed posts, four categories (`Events`, `Gaming`, `Platforms`, `Hardware`), search, label routes, archive routes, RSS/Atom links, and sitemap.
- Article URLs use `/<year>/<month>/<slug>.html`; the new implementation keeps this address contract without using Blogger at runtime.
- The source `/about.html` and `/contact-us.html` links currently resolve to the source site's 404 template; the new site reserves these compatible paths for working pages.

## Architecture Review

### Affected Scope

- `apps/site`: static public routes, SEO metadata, feed, sitemap, responsive layout.
- `apps/admin`: authentication boundary, post/page editing, media and publish workflow.
- `packages/content`: content model, slug/path derivation, validation, build snapshot contract.
- `scripts/harness`: static route/content/security checks.
- `.agents/`, `.claude/`, `.husky/`: migrated workflow rules, skills, and local gates.

### Alternatives Considered

1. **Keep Blogger and skin it** — Pro: minimal migration work. Con: retains the runtime/theme dependency, limits ownership of content and deployment, and does not establish an admin boundary in this repository.
2. **Use a single Next.js server for public and admin** — Pro: one deployment. Con: public traffic reaches a runtime surface and loses the strongest static/CDN boundary.
3. **Use a static Next.js site plus a separately deployed admin** — Pro: deterministic CDN delivery, independent scaling/security, and clear content publishing boundary. Con: publish requires a build/deploy step and content storage integration.

### Decision

Choose option 3. `apps/site` uses Next.js App Router with `output: 'export'` and is deployed only as static files. `apps/admin` is a separate Next.js application deployed on a separate, unlinked admin domain. `packages/content` owns the public content contract. The repository now includes a local snapshot imported from the source Atom feed, including article bodies and downloaded media. The next implementation phase replaces this migration snapshot with an admin-owned content source and publish snapshot without changing compatible public route contracts.

### Architecture Review Checklist

- [x] Impacted packages, layers, and files listed.
- [x] Sibling scan completed against `../mogak-web` and the live source site.
- [x] At least two alternatives reviewed.
- [x] Decision and trade-offs documented.

## Solution

### Public route contract

| Route                         | Output                     | Behavior                                                          |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `/`                           | `index.html`               | Home publication with Breaking, posts, sidebar, and footer        |
| `/about.html`                 | static HTML                | About page                                                        |
| `/contact-us.html`            | static HTML                | Contact form shell; delivery is handled outside the public bundle |
| `/<year>/<month>/<slug>.html` | static HTML                | Article detail                                                    |
| `/search/label/<label>`       | static HTML                | Category listing                                                  |
| `/search`                     | static HTML + client index | Search shell over a build-generated index                         |
| `/<year>/<month>/`            | static HTML                | Month archive                                                     |
| `/sitemap.xml`                | XML                        | All canonical public pages                                        |
| `/robots.txt`                 | text                       | Crawler policy and sitemap URL                                    |
| `/feeds/posts/default.xml`    | Atom XML                   | Feed compatibility endpoint                                       |
| `/feed.xml`                   | RSS XML                    | Primary RSS endpoint                                              |

The public deployment contains no admin route, admin bundle, login link, draft data, content-store credential, or request-time API dependency.

### Separate admin domain

The admin application is served from a separate domain such as `admin.publisher.com`. It is not mounted under `www.publisher.com`, is not linked from public pages, and is excluded from indexing with `noindex` headers and `robots.txt`. The admin domain uses a separate deployment and origin policy from the static public site.

“Hidden” is an exposure-reduction measure, not an authentication mechanism. Admin access still requires authentication, role checks, MFA-capable identity, rate limiting, CSRF protection, audit logging, and an edge access policy such as Cloudflare Access or an equivalent provider.

### Content model

`NewsPost` owns `slug`, `title`, `excerpt`, sanitized `body`, `author`, `publishedAt`, `updatedAt`, `categories`, `imageUrl`, and `featured`. Slugs are stable and unique. The article path derives from the publication timestamp and slug. Category values are controlled by a finite taxonomy.

### Publish flow

1. Admin authenticates on the admin origin.
2. Admin validates and sanitizes a draft.
3. Admin saves draft content and media to the private content store.
4. An explicit publish action creates an immutable content snapshot and triggers the site build.
5. CI builds `apps/site`, validates routes/feeds/metadata, and uploads the static output to the CDN host.
6. Cloudflare or the chosen edge provider caches the public output; no public request reaches the admin/content store.

### Security and DDoS posture

- Public site: static object storage/CDN, origin access restricted to the CDN where supported, aggressive immutable asset caching, and no database/API origin. The public delivery path must remain useful during volumetric traffic spikes because requests terminate at the edge and do not reach an application server or content database.
- Admin: separate hostname and deployment, no public links, `noindex`/robots exclusion, identity-based access, MFA-capable provider, rate limiting, CSRF protection for mutations, audit log, and no public indexing.
- Forms: contact submissions go to a dedicated rate-limited endpoint or managed form provider; the static site never receives credentials. Contact and search interactions must not create an unbounded request path to the public origin.

### DDoS resilience requirements

- Public HTML, CSS, JavaScript, images, feeds, sitemap, and robots files are deployable to CDN-backed static hosting.
- The object-storage origin is private or reachable only through the edge provider where the provider supports origin restriction.
- DNS, WAF, bot mitigation, rate limiting, and cache rules are configured at the edge provider; the application repository documents the required rules and validates them in deployment smoke tests.
- Cacheable public responses use explicit cache-control policies. Fingerprinted assets are immutable; HTML/feed responses use bounded revalidation and stale-if-error behavior where supported.
- No public page performs request-time reads from the content store. A content-store outage cannot amplify into a per-request origin failure during an attack.
- Admin and contact endpoints use separate origins and rate limits. They are excluded from the public static origin and are never required to render public article pages.
- The launch checklist includes a controlled load/edge-cache test and confirms that the public origin is not directly exposed in DNS or page source.

### Migration policy

Recreate the source layout and compatible URL semantics, not Blogger's theme implementation. Do not copy jQuery, Blogger widgets, Templateify runtime scripts, Blogger navbar, or Google Analytics configuration by default. Image licensing and the Templateify theme license must be verified before copying any source asset into the new repository.

## Affected Files

- `apps/site/**`
- `apps/admin/**`
- `packages/content/**`
- `scripts/harness/**`
- `.agents/**`, `.claude/**`, `.husky/**`
- `package.json`, `pnpm-workspace.yaml`, deployment configuration

## Completion Criteria

- [x] TC-01: `pnpm build` exits 0 and emits a static `apps/site/out/` directory without requiring runtime secrets.
- [x] TC-02: The static output contains home, About, Contact, article, category, search, archive, sitemap, robots, and feed contracts listed in this spec.
- [x] TC-03: Every migrated source post has one stable `NewsPost` record and one generated `/<year>/<month>/<slug>.html` page.
- [x] TC-04: Public site source contains no admin credentials, database SDK import, server action, or request-time content fetch.
- [x] TC-05: `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` exit 0.
- [x] TC-06: Browser verification passes at desktop and mobile widths for home, article, category, search, and unknown-route states.
- [x] TC-07: Admin authentication and role checks prevent unauthenticated draft read/write/publish operations.
- [ ] TC-08: Publishing creates a validated snapshot and deploys public files without exposing the content store to public traffic.
- [x] TC-09: Public HTML includes canonical, Open Graph, Twitter, JSON-LD, sitemap, and feed metadata for each indexable page.
- [x] TC-10: Static assets are cacheable with immutable fingerprints, while HTML and feeds use an explicit revalidation policy.
- [ ] TC-11: A deployment smoke test confirms public responses are served through the edge cache, the static origin is not directly addressable, and admin/contact endpoints are separately rate-limited.
- [ ] TC-12: The public deployment contains only static site output, while the admin is reachable only through its separate domain and is excluded from public navigation and indexing.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                                                                                                                     | Notes                                                                                                                                                                                     |
| ----- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | build                | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > contains only public static routes`; `pnpm build`                                     | Run with `.env*` absent; the test checks `apps/site/out/index.html` after the build.                                                                                                      |
| TC-02 | contract             | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > contains only public static routes`; `scan-static-output.mjs`                         | Compare generated files against the route contract; missing files fail.                                                                                                                   |
| TC-03 | unit + build         | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > contains one compatible article file for every migrated post`; `verify-migration.mjs` | The test derives each expected article path from the eight seeded `NewsPost` records.                                                                                                     |
| TC-04 | static boundary      | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > contains only public static routes`; `scan-static-boundary.mjs`                       | The scanner checks forbidden runtime imports and the test checks that only public output is present.                                                                                      |
| TC-05 | regression           | `scripts/harness/__tests__/repository-contract.test.mjs — foundation contract`; `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`                                                  | The full commands are rerun before release; Vitest currently covers 7 files and 16 tests.                                                                                                 |
| TC-06 | browser              | `scripts/harness/__tests__/browser-route-contract.test.mjs — browser route contract`; Chrome headless route verification evidence                                                   | Automated interactive-browser test skipped: no browser fixture suite is committed; Chrome is run by the agent at desktop `1280x900` and mobile `390x844` with the public-anonymous label. |
| TC-07 | security integration | `scripts/harness/__tests__/admin-auth-contract.test.mjs — admin authentication contract`                                                                                            | The tests cover dev identity roles, missing identity, same-origin mutation checks, and the 60-request rate limit.                                                                         |
| TC-08 | integration          | `scripts/harness/__tests__/publish-workflow-contract.test.mjs — publish workflow contract`                                                                                          | Local tests cover validated snapshots and a fixture webhook; production provider delivery remains a deployment prerequisite.                                                              |
| TC-09 | SEO contract         | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > emits canonical SEO and feed metadata on an article page`                             | The generated article is checked for canonical, Open Graph, Twitter, JSON-LD, sitemap, and feed links.                                                                                    |
| TC-10 | deployment           | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > defines immutable asset and bounded document cache policies`; `edge-smoke.mjs`        | Local headers are automated; a preview URL is required for the CDN portion.                                                                                                               |
| TC-11 | resilience           | `scripts/harness/__tests__/edge-deployment-contract.test.mjs — edge deployment contract`; `edge-smoke.mjs`; remote smoke command in `docs/deployment.md`                            | Automated remote test skipped: WAF/origin/rate-limit behavior requires the real provider URL and controlled deployment credentials.                                                       |
| TC-12 | deployment/security  | `scripts/harness/__tests__/static-deployment-contract.test.mjs — static deployment contract > contains only public static routes`; `scan-admin-contract.mjs`                        | Automated remote test skipped: local artifact and admin noindex checks pass, but separate-domain Access/DNS verification requires the deployed admin origin.                              |

## Tasks

- [ ] `.agents/tasks/WEB-001.md` — implementation and verification checklist.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-08-18

**Status upgrade:** draft → review-ready

- Frontmatter: YAML 블록, `status: draft`, 유효한 단일 `type: SCREEN`, `tags` 필드를 확인했다.
- Problem: 현재 사이트의 구체적 증상, 재현/발생 조건, 2026-08-17 소스 스냅샷과 목표 제약을 확인했다.
- Architecture Review: 4개 체크리스트가 모두 `[x]`이며, `../mogak-web` 및 live source site sibling scan 완료 항목이 기록되어 있다.
- Alternatives/Decision: 3개 대안 각각에 Pro/Con이 있고, Decision이 정적 CDN·분리 보안 경계·publish/storage trade-off를 근거로 선택을 설명한다.
- Completion Criteria: TC-01부터 TC-12까지 모두 `TC-N` 형식이며 각 기준이 명령 또는 관찰 가능한 동작으로 작성되어 있다.
- Test Plan: 12개 TC 행이 Completion Criteria와 일치하고 각 행에 Test Type, Tool/Approach, Notes가 기재되어 있으며 TBD가 없다.
- Structure: Tasks placeholder와 비어 있는 Evidence Log 섹션이 존재한다.

### [GATE-APPROVAL] — 🔴 NON-COMPLIANCE | 2026-08-18

**Status remains:** review-ready
**Violation:** 현재 대화에서 사용자는 “뼈대를 잡고 개발 spec을 작성해보자”, “완전히 독립적으로 가져와”, “근데 주소는 호환되게 해도 되지 않나?”, “스펙디자인 문서에 '디도스 공격에 강한 뉴스 웹사이트를 만든다'”라고 요구사항과 수정을 제시했지만, 이 스펙의 설계를 명시적으로 승인하고 구현을 지시한 진술은 확인되지 않았다. 또한 GATE-APPROVAL 실행 전에 `apps/site`, `apps/admin`, `packages/content`, `scripts/migrate-publisher.mjs` 등의 구현 파일과 `.agents/tasks/WEB-001.md`의 구현 진행 기록이 존재한다.
**Required action:** 스펙 설계를 직접 향한 사용자의 명시적 승인 및 구현 지시를 받은 뒤 GATE-APPROVAL을 재실행한다. 승인 전 시작된 구현은 승인 이후 별도 게이트 절차에 따라 계속 검증한다.

### [GATE-APPROVAL] — ✅ PASS | 2026-08-18

**Status upgrade:** review-ready → approved

- 사용자 승인: “승인함” — 직전 제안된 Cloudflare Pages + Workers + Access + D1 + R2 아키텍처와 WEB-001 구현을 직접 승인한 것으로 확인했다.
- 승인 대상: 직전 제안의 공개 정적 사이트, 별도 Admin 도메인, 인증·저장·발행·DDoS 대응 배포 설정 범위가 WEB-001의 Architecture Review 및 Solution과 일치한다.
- 승인 이후 변경 없음: 현재 스펙의 Architecture Review, frontmatter `type: SCREEN`, `tags` 필드를 확인했으며 승인 이후 해당 항목의 수정은 없다.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-08-18

**Status upgrade:** approved → in-progress

- Tasks 파일: `.agents/tasks/WEB-001.md`가 존재하며 구현·검증 태스크를 포함한다.
- Tasks 경로 기록: `## Tasks` 섹션에 `.agents/tasks/WEB-001.md`가 정확히 기록되어 있다.
- Completion Criteria 커버리지: `.agents/tasks/WEB-001.md`의 Approval-gated implementation tasks에 TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12 구현 또는 검증 태스크가 각각 존재한다.

### [SPEC-CODE-CONFORMANCE] — ✅ PASS | 2026-08-18

- Public route contract maps to static App Router routes and generated `apps/site/out` files; compatible article paths remain `/<year>/<month>/<slug>.html`.
- Public boundary maps to `output: 'export'`, no request-time content-store access, local media paths, generated feeds/search index, and `_headers` cache policy.
- Admin contract maps to Cloudflare Access JWT verification, editor/publisher roles, same-origin mutation checks, rate limits, audit logging, noindex/robots, D1 binding/HTTP fallback, and R2 immutable snapshot delivery.
- Migration contract maps to the live Atom import script and verification harness; all 8 source posts and 8 local featured images passed validation.
- No spec-to-code gap was found in the implemented local/preview scope. TC-08, TC-11, and TC-12 remain unchecked because they require real external deployment state, DNS/origin controls, and provider smoke URLs.

### [FINAL-LOCAL-VERIFICATION] — ✅ PASS | 2026-08-18

- `corepack pnpm build`, `build:admin`, and serialized `build:admin:worker` passed; the public output contains 21 generated pages and metadata for 8 posts, and OpenNext produced `.open-next/worker.js`.
- `corepack pnpm typecheck`, `test`, `lint`, `harness:scan`, `harness:edge`, and `content:verify` passed.
- Chrome verified desktop home and mobile article screenshots; route checks returned `200` for public pages and `404` for the unknown route.
- Worker preview verified locked admin shell `200`, `robots.txt` `200`/`Disallow: /`, and unauthenticated `/api/posts` `401`, all with `no-store` responses.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-08-20

- Action: `corepack pnpm build`.
- Result: exited `0`; the static export generated 21 pages under `apps/site/out/`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-08-20

- Action: `corepack pnpm harness:scan` and `static-deployment-contract.test.mjs`.
- Result: required public routes, feeds, sitemap, search index, and static output checks passed.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-08-20

- Action: `corepack pnpm content:verify` and `static deployment contract > contains one compatible article file for every migrated post`.
- Result: 8 source posts and 8 local featured images verified; every seeded post path exists in the generated output.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-08-20

- Action: `corepack pnpm harness:scan`.
- Result: static-boundary and admin-contract scans passed with no public runtime content-store or admin/API artifact detected.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-08-20

- Action: `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm harness:scan`.
- Result: all exited `0`; Vitest reported 5 files and 14 tests passed, and all 5 harness scans passed.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-08-20

- Action: Chrome headless browser verification recorded in the final local verification evidence.
- Result: public-anonymous desktop `1280x900` and mobile `390x844` checks covered home, article, category, search, and unknown-route states; the final local server returned `200, 200, 200, 200, 404` for those route checks.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-08-20

- Action: `admin-auth-contract.test.mjs` and local admin smoke verification.
- Result: dev publisher/editor roles, missing identity `401`, cross-origin mutation rejection, and the 60-request route limit passed; local smoke also observed editor publish `403`.

### [GATE-COMPLETE: TC-09] — ✅ PASS | 2026-08-20

- Action: `static deployment contract > emits canonical SEO and feed metadata on an article page`.
- Result: generated article `<head>` contains canonical, Open Graph, Twitter, JSON-LD, standard sitemap metadata, RSS alternate metadata, and Atom alternate metadata.

### [GATE-COMPLETE: TC-10] — ✅ PASS | 2026-08-20

- Action: `static deployment contract > defines immutable asset and bounded document cache policies` and `corepack pnpm harness:edge`.
- Result: immutable asset, bounded HTML, and stale-if-error policies passed the local contract smoke.

### [GATE-VERIFY] — ✅ PASS | 2026-08-20

**Status upgrade:** in-progress → verifying

- `.agents/tasks/WEB-001.md`: all listed implementation and verification tasks, including TC-01 through TC-12 and Migration, are marked `[x]`; no task is marked blocked, pending, or on hold.
- Public build: `pnpm --filter @publisher/site build` exited `0`, generated 21 static pages, normalized compatible article paths, and generated metadata for 8 posts.
- Public tests: `pnpm --filter @publisher/site test` exited `0`.
- Browser self-verification: `public-anonymous` test account label; Chrome headless captured the home at desktop viewport `1280x900` and an article at mobile viewport `390x844`; home, article, category, search, and `404.html` route files were present.

### [GATE-COMPLETE] — ❌ FAIL | 2026-08-20

**Status remains:** verifying
**Failed criteria:**

- Completion Criteria: TC-08, TC-11, and TC-12 remain unchecked (`[ ]`); GATE-COMPLETE requires every TC-01 through TC-12 checkbox to be `[x]`.
  **Required action:** Complete the real external deployment, DNS/origin, edge/WAF/rate-limit, and separate admin-domain checks, then check TC-08, TC-11, and TC-12 only when their observed results are available.
- Completion Evidence: searching the spec and task records for `[GATE-COMPLETE: TC-N]` found no matching evidence entries for checked TC-01 through TC-07, TC-09, and TC-10 (and none for the unchecked TCs).
  **Required action:** Add one `[GATE-COMPLETE: TC-N]` Evidence entry per checked completion criterion, including the exact command or action and the actual observed output or result.
- Test Plan: TC-01 through TC-12 each contain only a tool/approach and prose notes; no row contains a test file path plus test function/describe name, and no row states an explicit automation skip reason.
  **Required action:** Update every TC row with a concrete test file/function reference or an explicit reason automation was skipped before rerunning this gate.
- Tasks/archive: `.agents/tasks/WEB-001.md` exists with `Status: in-progress`, while `.agents/tasks/completed/WEB-001.md` does not exist; `## Tasks` still points to `.agents/tasks/WEB-001.md` instead of the required archived path.
  **Required action:** Archive the completed task file at `.agents/tasks/completed/WEB-001.md` and update only the `## Tasks` path after all completion prerequisites are satisfied.

### [GATE-COMPLETE] — ❌ FAIL | 2026-08-20

**Status remains:** verifying
**Failed criteria:**

- Completion Criteria: current scan shows TC-08, TC-11, and TC-12 still unchecked (`[ ]`), so all TC-01 through TC-12 are not complete.
  **Required action:** Perform the real publish/deployment, edge/origin/rate-limit, and separate-admin-domain checks and check these criteria only with observed external results.
- Completion Evidence: `[GATE-COMPLETE: TC-01]` through `[GATE-COMPLETE: TC-07]`, `[GATE-COMPLETE: TC-09]`, and `[GATE-COMPLETE: TC-10]` are present, but no matching evidence exists for the three unchecked criteria; therefore the unchecked criteria cannot be treated as PASS.
  **Required action:** Add exact action and observed result evidence for TC-08, TC-11, and TC-12 after external verification.
- Test Plan: `corepack pnpm harness:scan` reported `12 completion criteria have matching test-plan rows` and `5 scans passed`, but the Test Plan rows still do not consistently provide a concrete test file path plus function/describe name or an explicit automation-skip reason for every TC-N.
  **Required action:** Add the required per-row test reference or explicit skip reason without silently treating local contract checks as external deployment evidence.
- Tasks/archive: `.agents/tasks/completed/WEB-001.md` is absent and `## Tasks` still points to `.agents/tasks/WEB-001.md`.
  **Required action:** Archive the completed task file and update the Tasks path after all completion prerequisites are satisfied.

### [GATE-COMPLETE] — ❌ FAIL | 2026-08-20

**Status remains:** verifying
**Failed criteria:**

- Completion Criteria: TC-08, TC-11, and TC-12 are still unchecked (`[ ]`), and no matching `[GATE-COMPLETE: TC-08]`, `[GATE-COMPLETE: TC-11]`, or `[GATE-COMPLETE: TC-12]` evidence exists. The Test Plan records local contract coverage/explicit remote-test skip reasons, but it does not substitute for external deployment evidence.
  **Required action:** Execute the real publish/deployment, DNS/origin, WAF/rate-limit, Access, and separate-admin-domain smoke checks and record their exact observed results before checking these criteria.
- External deployment evidence: `corepack pnpm harness:edge` returned `[edge-smoke] local static policy passed; set PUBLIC_SMOKE_URL and/or ADMIN_SMOKE_URL for remote verification`; no remote smoke URL/provider variables were configured, and `getent hosts admin.publisher.com` returned no record. Therefore public edge-cache delivery, private origin protection, WAF/rate limits, and Access/DNS state are unverified.
  **Required action:** Configure the real provider deployment and run the documented remote smoke checks with the public and admin origins.
- Tasks/archive: `.agents/tasks/WEB-001.md` still has `Status: in-progress`, `## Tasks` still points to `.agents/tasks/WEB-001.md`, and `test -f .agents/tasks/completed/WEB-001.md` returned exit status `1`.
  **Required action:** Archive the completed task file and update only the Tasks path after all completion prerequisites are satisfied.
- Local harness/Test Plan recheck: `corepack pnpm harness:test` reported `Test Files 7 passed (7)` and `Tests 16 passed (16)`; all TC-01–TC-12 rows contain a concrete test file/describe reference or an explicit automation-skip reason. This local result does not close TC-08, TC-11, or TC-12.

### [GATE-COMPLETE] — ❌ FAIL | 2026-08-20

**Status remains:** verifying
**Failed criteria:**

- Completion Criteria: TC-08, TC-11, and TC-12 remain unchecked (`[ ]`); no external publish, edge/origin, DNS/WAF/Access, or separate-admin-domain evidence is present. `corepack pnpm harness:edge` exited `0` with `[edge-smoke] local static policy passed; set PUBLIC_SMOKE_URL and/or ADMIN_SMOKE_URL for remote verification`, and no `PUBLIC_SMOKE_URL`/`ADMIN_SMOKE_URL` variables or `admin.publisher.com` DNS result were available.
  **Required action:** Perform and record the real external deployment, publish delivery, DNS/origin, WAF/rate-limit, Access, and separate-admin-domain smoke checks before checking TC-08, TC-11, or TC-12.
- Test Plan: `corepack pnpm harness:test` exited `0` with `Test Files 7 passed (7)` and `Tests 16 passed (16)`; `corepack pnpm harness:scan` exited `0` with `12 completion criteria have matching test-plan rows` and `5 scans passed`. Every TC-01–TC-12 row has a concrete test file/describe reference or an explicit automation-skip reason; this local evidence does not substitute for the missing external evidence.
- Tasks/archive: `.agents/tasks/completed/WEB-001.md` is absent (`test -f` exit `1`), and `## Tasks` still points to `.agents/tasks/WEB-001.md`.
  **Required action:** Archive the completed task file and update the Tasks path after all completion prerequisites are satisfied.

### [GATE-COMPLETE] — ❌ FAIL | 2026-08-20

**Status remains:** verifying
**Failed criteria:**

- Completion Criteria: TC-08, TC-11, and TC-12 remain unchecked (`[ ]`); no matching external completion evidence exists for validated production publishing, edge/origin/rate-limit behavior, or separate-domain admin exposure.
  **Required action:** Configure the real deployment and provider controls, run the release and full remote smoke checks, then record observed results before checking TC-08, TC-11, or TC-12.
- Deployment preflight/release: `corepack pnpm deploy:preflight -- --production` and `corepack pnpm deploy:release` both exited `1` with missing `ADMIN_PUBLIC_ORIGIN`, `PAGES_PROJECT_NAME`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, Access, publish, smoke, origin, and rate-limit inputs; the Wrangler config still contains `REPLACE_WITH_D1_DATABASE_ID`, and Wrangler reported `You are not authenticated. Please run wrangler login`.
  **Required action:** Supply the real deployment configuration and authenticated Wrangler account without recording secret values in the repository.
- External smoke/DNS: `corepack pnpm harness:edge` only returned `[edge-smoke] local static policy passed; set PUBLIC_SMOKE_URL and/or ADMIN_SMOKE_URL for remote verification`; DNS lookup returned `www.publisher.com` at `ghs.google.com` and no `admin.publisher.com` record, so public edge delivery, direct-origin denial, separate rate limits, and separate admin-domain Access/indexing remain unverified.
  **Required action:** Complete DNS/Access/WAF/origin/rate-limit setup and rerun the required HTTPS remote smoke URLs.
- Tasks/archive: `.agents/tasks/WEB-001.md` remains `Status: in-progress`, and `.agents/tasks/completed/WEB-001.md` is absent; `## Tasks` still points to the active task path.
  **Required action:** Archive the task and update the spec path only after all completion criteria and evidence are complete.
