# Platform-owned HTML body import

- **Status**: completed
- **Created**: 2026-09-19
- **Branch**: claude/frontend-news-design-96ff02
- **Scope**: packages/content, apps/admin, scripts/deploy, scripts/harness

## Objective

Make pre-release `bodyHtml` records publishable through the standard pipeline on
every installation, without an operator converting content by hand, while
keeping public HTML derived from canonical Markdown.

## Plan

- [x] TC-01: General HTML to structured-Markdown importer with text-preserving fallbacks.
- [x] TC-02: X post embeds and accessible-name fallbacks for images.
- [x] TC-03: Worker resolves pre-release snapshot posts and names unpublishable posts.
- [x] TC-04: Admin reads upgrade pre-release posts leniently; publish re-validates strictly by slug.
- [x] TC-05: Serializer colon escaping and rendering of validated source.
- [x] TC-06: Full gates plus a real-snapshot worker run for both production sites.

## Progress

### 2026-09-19

- Reproduced the `bodyMarkdown is required` job failure on both production
  sites; every stored post carried only `bodyHtml`.
- Found the `5:00` → `<div></div>` renderer defect while diffing the new import
  against the live release.
- Implemented the importer, boundary helper, admin/worker wiring, encoding and
  serializer fixes; added seven contract tests and updated two assertions.
- `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` passed; both production
  snapshots (15 posts) resolved with zero failures.

## Decisions

- Admin reads are lenient so a site stays editable; publication is strict and
  names the post, keeping DATA-002's "no silent loss" rule.
- Nameless images take the record title, the same rule the worker already
  applies to hero images.

## Blockers

- None.

## Result

Imported sites publish through `publication:next` without manual conversion.
