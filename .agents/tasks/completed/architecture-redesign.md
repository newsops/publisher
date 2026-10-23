# Local-first architecture design

- **Status**: completed
- **Created**: 2026-10-23
- **Branch**: docs/local-first-architecture
- **Scope**: design documents and architecture review only

## Objective

Redesign Publisher's product boundaries before implementation. Compare storage
models for local management with a private object store, preserve full web and
CLI capability parity, and specify encryption, synchronization, publication,
and visitor-interaction ownership.

## Plan

- [x] Ground. Trace the current editorial, publication, and interaction flows.
- [x] Ground. Separate documented rationale from inferred intent.
- [x] Sketch. Frame an arena with independent candidate designs.
- [x] Sketch. Cross-judge the candidates and select a base.
- [x] Sketch. Synthesize the product boundaries and contract sketches.
- [x] Agree checkpoint. Prepare the proposal for owner review; implementation approval remains outstanding.
- [x] Verify. Review failure cases, source citations, and document consistency.
- Implement: not entered. The owner requested design before development.
- Scrap: not needed. Final review found no blocking design contradiction after corrections.

## Progress

### 2026-10-23

- The owner requested pstack-assisted redesign before development.
- The owner selected a PC-hosted administration application used in a browser.
- The owner required protection for private data uploaded to object storage.
- Existing unrelated work remains outside this design task.
- Three independent source investigations and a synthesis distinguish current
  implementation from the proposed local-first target.
- Arena compares a transactional SQLite snapshot source against document
  objects with a disposable local index. A cross-review follows both drafts.
- The local browser choice removes any need for a hosted management product.
  Online comment acceptance still requires the existing interaction role.

### 2026-10-24

- Selected local per-publication SQLite authority and encrypted consistent
  snapshots after comparing document-manifest authority. Both frozen
  candidates scored 20/24; the transaction/recovery burden broke the tie.
- Adopted designated-writer handoff, current-moderation-safe rollback,
  bounded intake admission and encrypted pending receipts.
- A separate reader found four design gaps: theme fragment/shell counting,
  accumulated inbox capacity, atomic retry receipts, and identity parity.
  All four were corrected and re-read; no new blocking contradiction was found.
- Security-audit guidance added explicit trust boundaries and safe imported
  content rendering. This was not a full security audit or runtime validation.
- Parent-authored read-only document checks passed seven files for whitespace,
  privacy and 21 local links, plus 12 TC/plan pairs and 24 future LF scenarios.
- The source-only spec-contract scan reported 225 criteria across 39 specs with
  matching test-plan rows and layer tags. This is document/schema evidence only.
- GATE-WRITE passed; ARCH-008 moved to backlog with status review-ready.
  No approval/implementation gate was entered.
- Final parent-authored document inspection passed seven files, 23 local links,
  whitespace, private-denylist checks, 12 TC/plan pairs, 24 LF scenarios and
  writing-only gate state. `git diff --check` passed. No application tests ran.

## Decisions

- Use pstack architect and arena for design comparisons and cross-review.
- Keep current executable contracts unchanged while the proposal is reviewed.
- Encrypt private remote bytes using the published age format; authenticate
  authorship separately and retain independent recovery keys/checkpoints.
- Use one designated writer and direct shared-core CLI execution. No new
  daemon, sync service, database server, KMS or provider is selected.
- Keep public output separate; preserve current moderation during rollback.

## Blockers

None for design. Runtime correctness and provider behavior require later
implementation experiments and contract tests.

## Result

The proposal, contracts, comparative review and ARCH-008 future specification
are ready for owner review. Only the document-writing gate has passed.
Application code, dependencies, production data, deployment and canonical
runtime contracts are unchanged. Future implementation, browser/security
acceptance, migration and deployment are intentionally unstarted. Existing
unrelated ARCH-007 work is preserved outside this task.
The documentation remains local on the topic branch, without commit, push or
merge. This task creates no implementation approval or release claim.
