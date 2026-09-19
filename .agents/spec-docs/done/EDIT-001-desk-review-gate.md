---
status: done
type: FLOW
tags: [web, cli, rest, typescript, a11y]
authority: confirmation-required
---

# EDIT-001: Desk review gate before publication

## Problem

An agent or editor with an editor/publisher key can set a post to `published`
and call `publish` in one pass. Nothing evaluates the story or its image
before it reaches readers: the operator observed a replaced thumbnail that
was meaningless yet was published without any assessment. ADMIN-002 stores
per-site editorial guidance, but by its own decision it is advisory context
and "durable server policy validation remains a future explicit rule".

The owner decided the platform must own a desk (senior editor) checkpoint:
before a story can be published it is reviewed against an exposed check
guide; a human ticks the items in the admin, an agent ticks them through the
CLI/API, and the server refuses publication without a valid approval.
Automated checks that fail are not overridable — the story is improved until
they pass. Existing published stories return to `review` for a fresh desk
pass.

## Architecture Review

### Affected Scope

- `packages/content`: the desk contract — content fingerprint, automated
  check catalogue, default self-check list, approval validity, and the public
  projection that strips review data from snapshots.
- `apps/admin`: desk report service (media dimensions and near-blank/duplicate
  image analysis with sharp), repository `reviewPost`, save-time and
  publish-time gates, read-time upgrade that returns unreviewed published
  posts to `review`, automation and browser routes, and a Desk panel.
- `packages/admin-client` and `packages/ops-cli`: typed methods and
  `publisher post submit` / `publisher desk list|report|approve|request-changes`.
- `docs/agent-operations.md`, `docs/admin-api.md`, harness contract tests,
  and the checked-in fixture (seeded posts carry a fixture approval so
  clean-room publication still works).

Sibling scan: post status already has a `review` value but no server rule
uses it; ADMIN-002 guidance is read-only context; media records already hold
width/height; `makeSnapshot` is the single publication boundary; the public
snapshot is produced by `asPublishedPost`, which is where review data must be
stripped. No existing `desk` route, field, or CLI command exists.

### Alternatives Considered

1. Advisory checklist only (extend ADMIN-002 text). Pro: no server change.
   Con: an agent can still publish without looking; the observed failure
   repeats.
2. Human-only approval in the admin UI. Pro: simplest trust model. Con: the
   owner wants agent pipelines (author agent → desk agent) to remain possible
   without browser automation.
3. Server-enforced approval bound to a content fingerprint, reachable from
   UI, API, and CLI, with deterministic automated checks that must pass and a
   self-check list that must be attested item by item. Pro: one rule for
   every caller, auditable, provider-neutral, invalidated automatically by
   later edits. Con: adds a review record, routes, commands, and a panel.

### Decision

Choose alternative 3 as the owner decided. A post carries a private
`deskReview` record (`status`, `contentFingerprint`, attested `checklist`,
`reviewer`, `note`, `reviewedAt`). The fingerprint hashes the publish-relevant
fields (title, excerpt, body, image, author, taxonomy, SEO), so editing any
of them returns the post to `pending`; changing only status or ranking does
not. Saving a post as `published`/`scheduled` and creating a snapshot both
require a valid approval and fail closed naming the post. Approval requires
every automated check to pass (no override) and every checklist item to be
ticked; the server recomputes checks at approval time. Any authenticated
`publisher`/`owner` account or `publisher` automation key may approve from
the UI, API, or CLI. On upgrade, published or scheduled posts without an
approval are moved to `review` and reported; the checked-in fixture is seeded
approved so a fresh installation publishes.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료 — owner confirmed approver scope, no-override
      improvement loop, and re-review of existing posts on 2026-09-19

## Solution

Automated checks (all must pass): representative image present, resolvable
in the media library, at least 1200×630 and 1.4–2.0 aspect, not near-blank
(low channel deviation), not repeated as the first body figure (pixel
similarity); title 20–110 characters; excerpt 40–200; SEO title ≤ 70; SEO
description 50–160; body ≥ 150 words; at least one HTTPS source link or X
embed; body parses under the Markdown contract; author active; categories
valid. Warnings (do not block): analysis unavailable, missing site guidance.

Self-check list (attested per item): facts and sources verified; headline
matches the story; image represents the story and rights are cleared;
excerpt and SEO fields read correctly; taxonomy and author are right; site
guidance followed. The report exposes the site's ADMIN-002 guidance text.

Flow: `post submit` moves a draft to `review` and returns the report;
`desk report` returns checks, checklist, guidance, and current review state;
`desk approve --check <id>...` (or all) attests and approves; `desk
request-changes --note` records feedback; `post update ... status=published`
and `publish` succeed only with a valid approval.

## Affected Files

- `packages/content/src/desk-review.ts` (new), `editor.ts`, `index.ts`,
  `seed.ts`/fixture data
- `apps/admin/app/lib/desk-review.ts` (new), `repository-contract.ts`,
  `repository-validation.ts`, `postgres-content-repository.ts`,
  `file-content-repository.ts`, `postgres-publication.ts`
- `apps/admin/app/api/v2/sites/[siteId]/posts/[id]/desk/route.ts` (new),
  `apps/admin/app/api/desk/route.ts` (new), `DeskReviewPanel.tsx` (new),
  dashboard wiring
- `packages/admin-client/src/client.js`, `index.d.ts`
- `packages/ops-cli/bin/publisher.mjs`
- `docs/agent-operations.md`, `docs/admin-api.md`
- `scripts/harness/__tests__/desk-review-contract.test.mjs` (new) and
  affected contract tests

## Completion Criteria

- [x] TC-01: `runDeskChecks` fails on a missing/small/near-blank/duplicated
      image, short body, missing sources, and bad lengths, and passes on a
      compliant post; the fingerprint changes only for publish-relevant edits.
- [x] TC-02: Saving a post as `published` or `scheduled` without a valid
      approval is rejected; after approval it succeeds; a later content edit
      invalidates the approval and the next publish attempt names the post.
- [x] TC-03: `GET`/`POST …/posts/{id}/desk` return the report and accept
      approve/request-changes only with all checks passing and all items
      attested; failures return `desk_checks_failed` /
      `desk_checklist_incomplete` with the report; writes are audited.
- [x] TC-04: `publisher post submit`, `desk list|report|approve|request-changes`
      work non-interactively through `@publisher/admin-client` with documented
      JSON envelopes.
- [x] TC-05: The admin Desk panel lists posts in review, shows checks,
      guidance, and checklist controls, and can approve or request changes.
- [ ] TC-06: On upgrade, published posts without approval move to `review`;
      the checked-in fixture publishes unchanged; `pnpm typecheck`, `pnpm
test`, `pnpm harness:scan` pass.

## Test Plan

| TC-ID | Test Type | Tool / Approach                                    | Notes                                                           |
| ----- | --------- | -------------------------------------------------- | --------------------------------------------------------------- |
| TC-01 | unit      | `desk-review-contract.test.mjs`                    | Check catalogue and fingerprint tests on synthetic posts        |
| TC-02 | contract  | `desk-review-contract.test.mjs`                    | `FileContentRepository` save/publish gate round trip            |
| TC-03 | contract  | `desk-review-contract.test.mjs`                    | Route handlers invoked directly with automation headers         |
| TC-04 | contract  | `agent-operations-cli-contract.test.mjs`           | CLI command surface and envelopes                               |
| TC-05 | browser   | Playwright against the admin dev server            | Desk panel list, report, checklist, approve                     |
| TC-06 | gate      | `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` | Upgrade path covered by the contract test; fixture publish test |

## Tasks

- [x] `.agents/tasks/completed/EDIT-001.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Problem names the unguarded publish path and the observed failure; three alternatives; decision records the owner's three confirmed choices; TC-01 to TC-06 each have a Test Plan row.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: confirmation-required`; the owner confirmed approver scope (UI/API/CLI with attested checklist), the no-override improvement loop, and returning existing posts to review.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-19

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/desk-review-contract.test.mjs`.
Observed result: 6 tests passed; the check catalogue fails missing/small/near-blank/duplicated images, short bodies, missing sources, and bad lengths, passes a compliant post, and the fingerprint changes only for publish-relevant edits.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-19

Command: same suite, "gates publication on a valid approval and invalidates it after edits".
Observed result: saving as `published` without approval is rejected with `requires a desk approval`; after `decideDesk` approval it succeeds; a content edit while published is refused and, once back in review, the next publish attempt names the post.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-19

Command: same suite, "serves the report and records decisions through the automation route".
Observed result: `GET` returns checks, checklist, and guidance; `POST approve` with a failing check returns 409 `desk_checks_failed` with the report; `request-changes` records the reviewer and note; a stale `If-Match` returns 409.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-19

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`.
Observed result: 9 tests passed, including the `post submit` → `desk report` → `desk approve` loop against a fake admin with `DESK_REJECTED` on a failing check and `POST_SUBMITTED`/approval envelopes.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-19

Command: Playwright against `next dev` on port 3377 with the file repository and an `ADMIN_OWNERS` fixture identity.
Observed result: the Desk panel listed the story in review, rendered 13 automated checks and 6 checklist items with the approve button disabled, enabled it after every item was ticked, and showed "Approved. The story can now be scheduled or published." with the recorded decision.

### [GATE-COMPLETE: TC-06] — ✅ | 2026-09-19

Command: `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.
Observed result: all workspace typechecks passed, 42 files / 209 tests passed (including the upgrade-to-review and fixture publish cases), 6 harness scans passed.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → done
Every criterion has observed evidence above; the task record is archived at `.agents/tasks/completed/EDIT-001.md`.
