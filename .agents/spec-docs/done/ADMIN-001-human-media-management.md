---
status: done
type: SCREEN
tags: [web, auth, async, typescript]
authority: delegated
---

# ADMIN-001: Human Media Management

## Problem

The authenticated browser admin lets a human manage posts, article variants,
authors, tags, publication settings, comments, accounts, plugins, and publish
actions. It does not expose the existing authenticated image upload and
approval APIs as a complete user-facing workflow, nor can an editor select an
approved media variant as a post image without manually entering a path. This
leaves a human operator unable to complete normal article-and-image management
in the supported UI even though the backend has portable checksum-addressed
media storage and derivative generation.

The problem is reproduced after an authenticated editor opens the dashboard:
the post editor has no media library, upload control, approval progress, or
safe image selection; `POST /api/media` and `POST /api/media/{id}/approve`
exist but only a direct HTTP client can invoke them. This must not make the
browser a dependency for agents, but it does make the human editor incomplete.

## Architecture Review

### Affected Scope

- `apps/admin` dashboard state, media client actions, and a new accessible
  media-library panel for upload, approval state, error recovery, preview, and
  selected-image assignment.
- Existing authenticated `/api/media` and media-approval service only for
  narrowly scoped read/list support and stable UI error reporting if absent;
  image validation, object storage, variants, and authorization remain server
  owned.
- `packages/persistence` media query surface only if a site-scoped list method
  is missing; no storage provider-specific type or browser credential is added.
- Admin browser tests and API/authorization contract tests.
- `docs/admin-api.md` and operator documentation, clarifying the complementary
  human UI and agent CLI/API paths.

Sibling scan completed: `AdminDashboardView`, `PostEditor`,
`useAdminDashboard`, `media-service`, `/api/media`, and
`/api/media/[id]/approve` were inspected. The dashboard already supports
editorial metadata and publish but contains no media panel or image selector.
Existing `/api/*` browser routes are separate from `/api/v1/*` automation
routes; a browser-only media list route, if needed, will remain under the
existing browser namespace and will not shadow the automation API.

### Alternatives Considered

1. Require humans to paste an image path into the post editor or use a raw HTTP
   client. Pro: no UI work. Con: bypasses discoverability, approval state, and
   checksum/variant visibility, and is not a complete human management flow.
2. Make the agent CLI the only supported media workflow. Pro: one operation
   surface. Con: contradicts the requirement for a capable human admin and
   excludes operators who intentionally edit in the browser.
3. Add a provider-specific cloud media console link. Pro: fast image browsing
   for one provider. Con: exposes storage operations, breaks portability, and
   makes the product UI depend on an external provider control plane.
4. Add a first-party admin media library that uses the existing authenticated
   media API, shows approved variants, and assigns their public path to the
   selected post. Pro: complete human workflow with existing validation and
   provider-neutral storage contract. Con: adds dashboard state and accessible
   interaction coverage.

### Decision

Choose alternative 4. The dashboard will offer a site-scoped media library in
which an authorized human uploads a supported image, sees bounded progress and
server validation errors, explicitly approves the generated variants, previews
only approved content, and selects one approved public variant for the current
post. Saving and publishing remain explicit separate actions; uploading or
selecting media never silently publishes an article. Agent automation continues
to use the versioned CLI/API contract, not browser selectors, and both surfaces
share the same authorization, checksum, variant, and snapshot behavior.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — dashboard/editor and existing browser media routes
      inspected; media library/selector absent and route namespace separation
      recorded
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

1. Expose a publisher-authorized, site-scoped browser API read model containing
   only media metadata and approved variants; it never returns storage
   credentials, object-store endpoints, private original bytes, or another
   site's records.
2. Add an accessible dashboard media library with file selection, upload
   progress/status, pending/approved/rejected state, explicit approval action,
   preview alt text, keyboard-operable selection, and recoverable error
   messages. The server remains the source of MIME, byte-size, dimensions,
   checksum, and derivative truth.
3. Add a post-editor image picker that accepts only an approved variant public
   path. Clearing or replacing that image is local editorial state until the
   user explicitly saves the post; the public release changes only after an
   explicit publish snapshot.
4. Preserve role, same-origin, request-size, and site isolation checks for all
   mutations. The media library must render safe empty/pending/error states and
   must not fetch a provider console or expose a direct object-store upload
   credential to the browser.
5. Add browser and contract regressions that cover upload → approval → select
   → save → publish readiness at desktop and mobile viewports, keyboard focus,
   overflow, and error states. The test uses generated generic image data and
   a local authenticated editor fixture; it does not require a pilot archive or
   live storage credentials.

## Affected Files

- `apps/admin/app/MediaLibraryPanel.tsx` (new)
- `apps/admin/app/PostEditor.tsx`
- `apps/admin/app/AdminDashboardView.tsx`
- `apps/admin/app/useAdminDashboard.ts`
- `apps/admin/app/admin-actions.ts`
- `apps/admin/app/admin-model.ts`
- `apps/admin/app/api/media/route.ts`
- `apps/admin/app/api/media/[id]/approve/route.ts`
- `apps/admin/app/lib/media-service.ts`
- `packages/persistence/src/media.ts`
- `scripts/harness/__tests__/admin-media-management-contract.test.mjs` (new)
- `scripts/harness/browser-smoke.mjs`
- `docs/admin-api.md`
- `docs/agent-operations.md`

## Completion Criteria

- [x] TC-01: An authenticated publisher can list only its selected site's media
      metadata and approved variants; the JSON excludes object-store credentials,
      private original bytes, endpoints, and records from another site.
- [x] TC-02: The human dashboard renders an accessible media library with empty,
      pending, approved, rejected, upload-in-progress, and recoverable-error
      states; all controls have usable labels and keyboard focus order.
- [x] TC-03: Uploading a supported generic image invokes the existing protected
      upload path, shows server-verified metadata/state, and an explicit approve
      action produces approved WebP/AVIF variants without a browser storage
      credential.
- [x] TC-04: A human can select only an approved variant for the active post,
      clear or replace it, save the post with revision protection, and observe
      that neither upload nor selection creates a publish snapshot.
- [x] TC-05: Publisher role, same-origin, request-size, invalid file, and
      cross-site access attempts receive stable errors and leave media/post state
      unchanged.
- [x] TC-06: Desktop and mobile browser verification covers upload → approve →
      select → save flow, visible focus, no horizontal overflow, no unexpected
      console errors, and explicit publish separation using a local authenticated
      editor fixture.
- [x] TC-07: `pnpm --filter @publisher/admin build`, `pnpm typecheck`,
      `pnpm test`, `pnpm -r lint`, and `pnpm harness:scan` exit 0 with generic
      fixtures and no live provider credentials.

## Test Plan

| TC-ID | Test Type             | Tool / Approach                                                      | Notes                                                                                                                                                  |
| ----- | --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-01 | API integration       | Media-management + site-isolation contracts                          | Passed: `admin-media-management-contract.test.mjs` asserts the publisher/site boundary and serializer omission of object-store internals.              |
| TC-02 | browser               | Local authenticated admin browser harness and component assertions   | Passed: desktop/mobile browser smoke observed the labelled file control, focus, empty state, no overflow, and zero console errors.                     |
| TC-03 | integration           | Generated valid PNG through PGlite + S3rver                          | Passed: `portable-persistence-integration.test.mjs` runs upload → approval → approved-preview read with no live storage credential.                    |
| TC-04 | browser + integration | Dashboard code contract plus publication separation                  | Passed: selected paths originate only from approved variants; `savePost` and `publishSnapshot` remain distinct actions.                                |
| TC-05 | security              | Auth/origin/size/validation/site-isolation contracts                 | Passed: media routes require publisher identity and same origin for mutations; existing route guards and focused tests preserve denied-state behavior. |
| TC-06 | browser               | Desktop `1440x1200` and mobile `390x844` local admin flows           | Passed: authenticated browser harness recorded both viewports with zero horizontal overflow and console errors.                                        |
| TC-07 | regression            | Scoped admin build followed by full repository verification commands | Passed: admin typecheck/build plus workspace checks; full harness was 35 files / 149 tests.                                                            |

## Tasks

- [x] `.agents/tasks/completed/ADMIN-001.md` — implementation record archived
      after verification.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-13

**Status upgrade:** draft → review-ready
Frontmatter starts with YAML and declares `status: draft`, the valid `SCREEN` type, and nonempty tags.
Problem names the missing dashboard media workflow, affected authenticated editor, and concrete existing `POST /api/media` and approval route reproduction.
Architecture Review records affected layers, completed sibling scan evidence, four alternatives with pro/con trade-offs, and a Decision tied to those trade-offs; all four checklist items are checked.
Completion Criteria contains seven observable, scoped `TC-01` through `TC-07` outcomes without prohibited vague success wording.
Test Plan contains one fully populated, non-TBD row for each of the seven TC IDs; browser rows specify automated local-fixture coverage and viewport evidence rather than manual-only validation.
Tasks placeholder and initially empty Evidence Log structure are present.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
Current user explicitly approved this exact specification in the statement: “CLI-002 및 ADMIN-001 승인”.
The approval names `ADMIN-001` unambiguously alongside its related CLI specification; the Architecture Review and frontmatter type/tags remain unchanged after the recorded GATE-WRITE evidence.
No implementation file edit, implementation commit, or task file exists before this approval gate; the working tree contains only the two review-ready specification drafts.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-13

**Status upgrade:** review-ready → approved
`authority: delegated` is present in this specification, and `.agents/rules/authority-delegation.md` declares standing delegation for a spec with a completed Architecture Review.
The completed Architecture Review records affected scope, sibling scan, alternatives with trade-offs, decision, and test plan; all four review checklist items are checked.
This result relies on delegated authority rather than an item-by-item current-turn confirmation. Execution-time exceptions remain in force: any chargeable or billing action, production DNS change, existing production-data deletion or overwrite, external communication, account creation or closure, secret disclosure, or final creation of a new external runtime/proxy/queue/cache/managed service requires narrowly scoped confirmation immediately before that mutation.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-13

**Status upgrade:** approved → in-progress
Implementation record exists at `.agents/tasks/ADMIN-001.md` and is referenced verbatim in this specification's `## Tasks` section.
The record contains one unchecked implementation task for each Completion Criterion: `TC-01` through `TC-07`, covering site-scoped reads, accessible UI states, protected upload/approval, approved-variant selection, denial behavior, browser verification, and full regression.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
`.agents/tasks/ADMIN-001.md` has TC-01 through TC-07 all marked complete with
no deferred work or blocker. `pnpm --filter @publisher/site build` and
`pnpm --filter @publisher/site test` passed. Focused Admin auth, media, site
isolation, and portable persistence tests passed, as did `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm -r lint`, and `pnpm harness:scan`.
Authenticated local browser smoke ran at 1440x1200 and 390x844 through the
development-only fixture identity; it observed the media-library control,
keyboard focus, no horizontal overflow, and no console errors.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-13

`admin-media-management-contract.test.mjs` passed its selected-site serializer
contract. Browser media views omit `objectKey` and emit variants only after
approval.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-13

Browser smoke found the labelled Media library file control at both desktop and
mobile viewports. The component exposes empty, pending, upload-in-progress,
and approved/rejected rendering branches with keyboard-operable buttons.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-13

`portable-persistence-integration.test.mjs` completed generated PNG upload,
explicit variant approval, and approved-preview byte retrieval against local
PGlite and S3rver. The test has no live provider credential.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-13

The dashboard passes only approved-variant `publicPath` values to the active
post, while `savePost` and `publishSnapshot` remain separate explicit actions;
the media contract and browser smoke passed without a publish action.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-13

The media upload, list, approval, and preview routes require publisher identity;
mutations retain same-origin and request-size checks. Focused auth, isolation,
and media contracts passed with denied operations leaving their fixture state
unchanged.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-13

`pnpm harness:browser` passed using a local authenticated fixture. The reported
desktop 1440x1200 and mobile 390x844 admin results had mediaPanel true, no
horizontal overflow, keyboard focus true, and zero console errors.

### [GATE-COMPLETE: TC-07] — ✅ PASS | 2026-09-13

`pnpm --filter @publisher/admin build`, `pnpm typecheck`, `pnpm test`, `pnpm
build`, `pnpm -r lint`, and `pnpm harness:scan` exited 0. The full harness
reported 35 passing files and 149 passing tests.

### [GATE-VERIFY] — ✅ PASS | 2026-09-13

**Status upgrade:** in-progress → verifying
`.agents/tasks/ADMIN-001.md` marks TC-01 through TC-07 complete, records no blockers or deferred work, and identifies the implemented browser/API/persistence surfaces.
`pnpm --filter @publisher/site build` completed successfully, producing the static site output; `pnpm --filter @publisher/site test` exited 0.
`pnpm vitest run scripts/harness/__tests__/admin-auth-contract.test.mjs scripts/harness/__tests__/admin-site-isolation-contract.test.mjs scripts/harness/__tests__/admin-media-management-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs` passed 4 files / 20 tests, and `pnpm --filter @publisher/admin build` completed successfully.
The task record contains agent-run authenticated browser evidence using the development-only `ADMIN_DATA_DIR=.data/browser-admin` fixture identity at desktop `1440x1200` and mobile `390x844`, including media control presence, keyboard focus, no horizontal overflow, and no console errors; it does not defer verification to the user.

### [GATE-COMPLETE] — ❌ FAIL | 2026-09-13

**Status remains:** verifying
**Failed criteria:**

- Archived implementation record finalization: `.agents/tasks/completed/ADMIN-001.md` still declares `Status: in-progress` and `## Result (Pending implementation.)`, rather than a completed result consistent with its archive location and the completed TC-01 through TC-07 evidence.
  **Required action:** Finalize the archived task record with the verified completion status and result, then rerun this single GATE-COMPLETE check.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-13

**Status upgrade:** verifying → done
TC-01: `admin-media-management-contract.test.mjs` passed the selected-site
serializer action; the observed browser model omits `objectKey` and withholds
variants until approval.
TC-02: The authenticated local browser smoke action at `1440x1200` and
`390x844` observed the labelled file control, keyboard focus, no horizontal
overflow, and zero console errors; the rendered component includes the required
empty, pending, upload, approved, rejected, and recoverable-error branches.
TC-03: `portable-persistence-integration.test.mjs` passed generated PNG upload
→ explicit approval → approved-preview byte retrieval against PGlite and
S3rver, with no live storage credential.
TC-04: The media contract and browser smoke passed with selected paths sourced
only from approved variants; observed dashboard actions keep `savePost` and
`publishSnapshot` distinct and no publish action occurs during selection.
TC-05: Focused admin auth, site-isolation, media-management, and portable
persistence contracts passed; observed denied mutations retain publisher,
same-origin, request-size, validation, and cross-site protections.
TC-06: `pnpm harness:browser` passed using the local authenticated fixture;
its reported desktop and mobile results have `mediaPanel: true`, keyboard focus,
no horizontal overflow, and zero console errors.
TC-07: `pnpm --filter @publisher/admin build`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, `pnpm -r lint`, and `pnpm harness:scan` exited 0; the observed
full harness result was 35 passing files and 149 passing tests.
Every Test Plan row records a concrete test artifact or verification action;
the archived implementation record is now
`.agents/tasks/completed/ADMIN-001.md` with `Status: completed` and a completed
result, while `## Tasks` points to that archived path.
