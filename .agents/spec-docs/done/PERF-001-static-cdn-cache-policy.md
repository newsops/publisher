---
status: done
type: PERF
tags: [web, performance, deployment]
authority: delegated
---

# PERF-001: Static CDN cache policy

## Problem

The publication release already gives media and most generated artifacts
content-addressed names, but it does not materialize a hosting cache policy.
Cloudflare Pages therefore applies its safe default browser revalidation to all
files, including immutable media, themes, and projection data. Repeat visitors
cannot retain those unchanged bytes for their full content-addressed lifetime.

Applying one long cache rule to the whole site would be incorrect: HTML,
`/theme-runtime/current.css`, runtime manifests, search data, and comment
pointers use stable URLs and must observe the next atomic deployment. Cloudflare
also recommends leaving Pages' optimized deployment-aware cache behavior intact
except for clearly fingerprinted assets.

## Architecture Review

### Affected Scope

- `packages/publication/src/static-core-recipes.ts` owns immutable baseline-theme paths.
- `packages/publication/src/static-runtime-recipes.ts` owns selected-theme, stable-theme, runtime-manifest, and projection runtime artifacts.
- `packages/publication/src/static-indexes.ts` owns hashed recent and popular projections.
- `packages/publication/src/static-article-recipes.ts` owns stable and immutable comment projections.
- `packages/publication/src/static-builder.ts` and `verification.ts` own required release-artifact validation.
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs` owns cache-boundary regression coverage.
- `docs/deployment.md` documents the portable host contract and Cloudflare Pages behavior.

### Alternatives Considered

1. Generate a static-host `_headers` artifact and place every fingerprinted
   theme/data asset in an explicit immutable namespace. Pro: Cloudflare Pages
   and other compatible static hosts can apply the policy directly, while an
   unsupported host safely ignores the file. Con: internal generated asset URLs
   change once.
2. Configure Cloudflare zone Cache Rules manually. Pro: no generated artifact
   changes. Con: the application contract becomes account-specific, setup is
   not reproducible for other operators, and a broad rule can retain stale HTML
   or stable pointers after deployment.
3. Add a long `Cache-Control` header to all static paths. Pro: the smallest
   header file. Con: stable HTML, theme, runtime, and comment URLs can remain
   stale and combine incompatible release generations.

### Decision

Choose alternative 1. Keep HTML and every stable pointer on revalidation, and
give only `/media/*`, `/theme-runtime/immutable/*`, and `/data/immutable/*` a
one-year immutable browser lifetime. Materialize the cache policy as a release
artifact so direct uploads are reproducible. Do not add a Worker, Pages
Function, cache service, dashboard Cache Rule, or paid Cloudflare feature.
Cloudflare Pages continues to provide its built-in deployment-aware Tiered
Cache; `_headers` only improves repeat-browser caching for fingerprinted paths.

Official references:

- <https://developers.cloudflare.com/pages/configuration/serving-pages/#caching-and-performance>
- <https://developers.cloudflare.com/pages/configuration/headers/#configure-custom-browser-cache-behavior>

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 - theme, media, recent/popular, comments, search, runtime, HTML, verification, and Pages deployment paths were classified by mutability.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Move content-addressed theme assets beneath `/theme-runtime/immutable/` and
content-addressed projection payloads beneath `/data/immutable/`. Retain
`/theme-runtime/current.css`, `/.well-known/publisher/runtime.json`, stable
comment pointers, search data, and HTML at stable routes. Generate `/_headers`
with immutable caching only for the three immutable namespaces, explicit
revalidation for stable runtime pointers, and the existing security boundary.

The cache policy is a deployable static artifact rather than an application
dependency. Hosts that support the convention apply it; other static hosts can
map the same documented cache classes in their adapter without changing the
publication graph.

## Affected Files

- `packages/publication/src/static-core-recipes.ts`
- `packages/publication/src/static-runtime-recipes.ts`
- `packages/publication/src/static-indexes.ts`
- `packages/publication/src/static-article-recipes.ts`
- `packages/publication/src/static-builder.ts`
- `packages/publication/src/static-host-policy.ts`
- `packages/publication/src/verification.ts`
- `apps/site/public/_headers`
- `apps/site/app/layout.tsx`
- `apps/site/app/components/ProgressivePostFeed.tsx`
- `scripts/generate-theme-runtime.mjs`
- `scripts/generate-public-metadata.mjs`
- `scripts/harness/__tests__/incremental-publication-contract.test.mjs`
- `docs/deployment.md`
- `.agents/tasks/completed/PERF-001.md`

## Completion Criteria

- [x] TC-01: A generated release contains `/_headers` with one-year immutable caching only for `/media/*`, `/theme-runtime/immutable/*`, and `/data/immutable/*`, plus revalidation and security rules for stable routes.
- [x] TC-02: Every selected-theme, baseline-theme, recent/popular, and approved-comment immutable payload uses a content hash in its path and the matching immutable namespace; stable pointers retain stable paths.
- [x] TC-03: A theme-only release regenerates the stable and immutable theme CSS artifacts while reusing every article HTML artifact, and verification rejects a release missing `/_headers` or its stable theme CSS.
- [x] TC-04: On the activated Cloudflare Pages release, repeated requests show the documented cache headers for an immutable media file, immutable theme CSS, `current.css`, and HTML without a stale cross-release response.
- [x] TC-05: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` all exit 0 after the cache-path change.

## Test Plan

| TC-ID | Test Type            | Tool / Approach                                                                                                                                                                                                                                                                                                                                           | Notes                                                                                                                                                                                                                                                                       |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | contract             | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `WEB-008 incremental publication contract > emits a portable cache policy without broad immutable rules`                                                                                                                                                                          | Parse the emitted file and reject a broad immutable rule that can match HTML or stable runtime pointers.                                                                                                                                                                    |
| TC-02 | contract             | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `uses hash-shaped immutable namespaces behind stable runtime pointers`, `publishes short-lived comment pointers to immutable approved data`, and `requires article images to be materialized with alternative text`                                                               | Exercise selected theme, baseline, recent/popular projections, approved comments, and SHA-named media; assert namespace and hash shape.                                                                                                                                     |
| TC-03 | regression           | `scripts/harness/__tests__/incremental-publication-contract.test.mjs` — `updates synchronous theme CSS without rebuilding article HTML` and `rejects semantic policy, runtime, and internal-link corruption`; `scripts/harness/__tests__/incremental-publication-scale.test.mjs` — `keeps no-op and visual theme changes at zero article renders/uploads` | Change only theme CSS, assert article reuse at 1,000-article scale, and remove required policy artifacts to prove fail-closed verification.                                                                                                                                 |
| TC-04 | deployment           | Two sequential `HEAD` requests for `/`, `/theme-runtime/current.css`, the active immutable theme CSS, and one immutable media URL on `https://news.example.com`                                                                                                                                                                                           | A deterministic repository test is skipped because production CDN POP state, propagation, and `CF-Cache-Status` depend on the external network and active deployment. The agent records `Cache-Control`, `ETag`, and `CF-Cache-Status`; no dashboard cache rule is created. |
| TC-05 | build and regression | Exact aggregate commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`                                                                                                                                                                                                                                                            | No separate test file is used because the criterion is the successful execution of the repository's aggregate build and regression commands themselves.                                                                                                                     |

## Tasks

- [x] `.agents/tasks/completed/PERF-001.md` - completed implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-14

**Status upgrade:** draft → review-ready

- Frontmatter: the document begins with valid YAML and declares `status: draft`, the allowed `type: PERF`, non-empty `tags`, and `authority: delegated`.
- Problem: identifies the observable repeat-browser revalidation/cache-retention symptom, its Cloudflare Pages deployment context, and the stale-release failure mode of an overbroad immutable rule; no placeholder language remains.
- Architecture Review: all four checklist items are checked; the sibling scan explicitly covers theme, media, projections, comments, search, runtime, HTML, verification, and deployment paths.
- Alternatives and decision: three options include explicit pros and cons, and the decision cites portability, reproducibility, stale-content risk, and avoidance of new runtime or paid infrastructure.
- Completion Criteria: five criteria (`TC-01` through `TC-05`) use observable artifact, path, verification, deployment-header, and command-exit outcomes without vague completion wording.
- Test Plan: five non-empty rows map one-to-one to the five Completion Criteria; every row names a test type, tool or approach, and concrete verification strategy, with no manual-only or TBD entry.
- Structure: the Tasks placeholder is present and defers task-file creation until approval; the Evidence Log was empty before this gate entry.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-14

**Status upgrade:** review-ready → approved

- Delegated authority: frontmatter declares `authority: delegated`, and `.agents/rules/authority-delegation.md` provides standing delegation for ordinary implementation decisions backed by a complete recommendation.
- Architecture Review: affected scope, three alternatives with pros and cons, the portability-focused decision, all four checked review items, five observable completion criteria, and a one-to-one test plan were complete before this approval check.
- Owner direction: the current request explicitly requires fixing the delayed-style behavior, maximizing ordinary CDN use, deploying the result, and avoiding Cloudflare-specific features; the selected static `_headers` artifact and immutable-path design stays within that scope.
- Post-basis integrity: no Architecture Review or `type`/`tags`/`authority` change followed the approval basis; the only status transition before this gate was the recorded GATE-WRITE upgrade to `review-ready`.
- Execution-time exceptions remain in force under `.agents/rules/authority-delegation.md`; this design adds no paid resource, DNS change, data overwrite, secret disclosure, external communication, or new runtime/proxy/queue/cache/managed service, and any later exceptional final action still requires narrow confirmation.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-14

**Status upgrade:** approved → in-progress

- Task record: `.agents/tasks/PERF-001.md` exists, and the spec's `## Tasks` section records that exact path.
- TC-01 is covered by the task to generate a portable `/_headers` artifact with immutable and revalidation boundaries.
- TC-02 is covered by the task to move immutable theme, projection, and approved-comment payloads into explicit hashed namespaces while retaining stable pointers.
- TC-03 is covered by the task to verify theme-only article-HTML reuse and reject incomplete cache-policy releases.
- TC-04 is covered by the live deployment verification portion of the focused, full, and live verification task.
- TC-05 is covered by the focused and full verification portion of the same task, including the repository hard-gate commands; documentation of the provider-neutral mapping is tracked as an additional implementation task.

### [GATE-VERIFY] — ✅ PASS | 2026-09-14

**Status upgrade:** in-progress → verifying

- Task completion: every plan item in `.agents/tasks/PERF-001.md` is checked, the `Blockers` section says `None`, and the result is recorded as ready for lifecycle verification.
- Affected-package build: `pnpm --filter @publisher/site build` exited 0; Next.js compiled, type-checked, generated all 22 static routes, normalized 21 HTML files, and emitted the immutable editorial theme path plus static metadata and headers.
- Affected-package test: `pnpm --filter @publisher/site test` exited 0.
- Focused regression: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs` exited 0 with 1 test file and all 27 tests passing, covering the generated cache policy, hashed immutable namespaces, stable pointers, theme-only reuse, and fail-closed release verification.
- Live Pages evidence: two `curl -sSI` requests each to the active custom-domain immutable theme and media URLs returned HTTP 200, `Cache-Control: public, max-age=31536000, immutable`, matching ETags, and `CF-Cache-Status: HIT`; two requests to `/theme-runtime/current.css` returned HTTP 200, `Cache-Control: public, max-age=0, must-revalidate`, a matching ETag, and `CF-Cache-Status: REVALIDATED`; two requests to `/` returned HTTP 200 and `Cache-Control: public, max-age=0, must-revalidate`, so stable HTML was not retained as an immutable cross-release response.
- User-facing browser criterion: N/A for `type: PERF`; nevertheless `.agents/tasks/PERF-001.md` records agent-run production-snapshot checks at 1440px and 390px, including JavaScript-disabled home and article loads with synchronous `current.css`.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-14

**Status remains:** verifying
**Failed criteria:**

- Per-criterion completion evidence: TC-01 through TC-05 are checked, but no matching `[GATE-COMPLETE: TC-N]` Evidence Log entries exist with each criterion's exact verification command or action and observed result.
  **Required action:** Add one `[GATE-COMPLETE: TC-N]` entry for every TC-01 through TC-05, recording the exact command or action, the observed output or result, and the corresponding test reference or explicit skip reason.
- Test Plan completion references: the five rows describe approaches, but they do not all identify a test file path plus exact test/describe name or an explicit reason that an automated test was not written; TC-04 records a deployment `curl` approach without the required automation-skip reason.
  **Required action:** Update every Test Plan row with its concrete test file and test/describe name, or state a specific reason for skipping automated coverage; for TC-04, explain why the production CDN observation cannot be represented as a deterministic automated repository test.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs -t "emits a portable cache policy without broad immutable rules"`.
- Observed: the named test passed and verified the three immutable namespaces, all stable revalidation routes, and rejection of broad `/theme-runtime/*`, `/data/*`, or catch-all immutable rules.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs -t "uses hash-shaped immutable namespaces behind stable runtime pointers|publishes short-lived comment pointers to immutable approved data|requires article images to be materialized with alternative text"`.
- Observed: all 3 named tests passed with 24 unrelated tests skipped; themes, list projections, approved-comment payloads, and media use immutable hash/release paths while stable pointers retain stable routes.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-14

- Command: `pnpm exec vitest run scripts/harness/__tests__/incremental-publication-contract.test.mjs scripts/harness/__tests__/incremental-publication-scale.test.mjs -t "updates synchronous theme CSS without rebuilding article HTML|rejects semantic policy, runtime, and internal-link corruption|keeps no-op and visual theme changes at zero article renders/uploads"`.
- Observed: all named tests passed; theme-only changes replaced both theme CSS artifacts, reused all 1,000 article HTML artifacts, and candidate verification rejected missing `/_headers` and `current.css`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-14

- Action: two sequential `HEAD` requests each were made to `/`, `/theme-runtime/current.css`, `/theme-runtime/immutable/editorial.<sha256>.css`, and `/media/<sha256>.webp` on the public origin of an operated instance after a Pages deployment (URLs and deployment ID kept privately by the operator).
- Observed: immutable theme and media changed from `MISS` to `HIT` with `public, max-age=31536000, immutable` and stable ETags; `current.css` changed from `MISS` to `REVALIDATED` with `public, max-age=0, must-revalidate`; HTML returned the same revalidation directive and was never immutable. A deterministic repository test is intentionally omitted because POP cache state, propagation, and the public network belong to the external active deployment.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-14

- Commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`.
- Observed: all exited 0; the full suite reported 37 files and 175 tests passed and all six scans passed. A separate test file is not applicable because these aggregate commands are the criterion itself.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-14

**Status upgrade:** verifying → done

- Completion Criteria: TC-01 through TC-05 are all checked and each has a matching `[GATE-COMPLETE: TC-N]` entry with its exact verification command or production action and observed result.
- Test Plan: all five rows identify concrete test files and named tests, an external-deployment automation-skip reason for TC-04, or the aggregate-command rationale for TC-05; no row is silently unhandled.
- Focused revalidation: the exact TC-01 command passed 1 named test, the exact TC-02 command passed 3 named tests, and the exact TC-03 command passed 3 named tests across 2 files.
- Task archive: `.agents/tasks/completed/PERF-001.md` exists, contains no unchecked plan item or blocker, and the spec's `## Tasks` section points to that archived path.
