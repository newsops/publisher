# Desk Review Gate Before Publication

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: packages/content, apps/admin, packages/admin-client, packages/ops-cli, docs, harness tests

## Objective

Make a desk (senior editor) checkpoint a platform rule: a story can be
published only with an approval bound to its current content, reached from
the admin UI, the automation API, or the CLI. Automated checks must pass
(no override) and every self-check item must be attested; existing published
stories return to `review` for a fresh desk pass.

## Plan

- [x] TC-01: Check catalogue and content fingerprint (`desk-review-contract`).
- [x] TC-02: Save-time and snapshot-time gate round trip; edits invalidate approval.
- [x] TC-03: `GET`/`POST …/posts/{id}/desk` report and audited decisions.
- [x] TC-04: `publisher post submit`, `desk list|report|approve|request-changes`.
- [x] TC-05: Admin Desk panel verified in a browser.
- [x] TC-06: Upgrade rule, fixture publish, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.

## Progress

### 2026-09-19

- Spec approved with the owner's three decisions (approver scope, no-override
  improvement loop, re-review of existing posts).
- Implemented the content contract (`packages/content/src/desk-review.ts`),
  repository gate and `reviewPost`, read-time upgrade to `review`, admin
  service with sharp pixel analysis, automation and browser routes, Desk
  panel, client methods, and CLI commands.
- Existing contract tests that saved published fixtures with content edits
  were updated to the gate: edits go through `review`, and publication uses
  `deskFixtureApproval` where a snapshot is required.
- The browser desk route uses `repositoryForRequest` like every other
  browser route; `ADMIN_OWNERS` lets the file-backed local admin exercise the
  panel, and an unavailable media library is reported as a warning rather
  than a pass.

## Decisions

- The fingerprint hashes only publish-relevant fields so status and ranking
  changes keep an approval; any content edit revokes it.
- The checked-in fixture is desk-approved as shipped so a clean-room install
  publishes unchanged; the upgrade rule is exercised by the contract test.
- Without a media library configured, image facts are reported as unverified
  (warning), never as a pass.

## Blockers

- None.

## Result

All six criteria verified on 2026-09-19; evidence recorded in the spec's
GATE-COMPLETE entries. The production re-review of existing stories is an
operational follow-up performed after this change is deployed.
