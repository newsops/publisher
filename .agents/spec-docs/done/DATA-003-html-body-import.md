---
status: done
type: DATA
tags: [web, cli, rest, typescript, a11y]
authority: delegated
---

# DATA-003: Platform-owned HTML body import

## Problem

DATA-002 made `bodyMarkdown` the canonical editorial source and required a
one-time conversion of stored HTML. That conversion never became a platform
behaviour: the `importPreReleaseHtmlToMarkdown` helper only understood
`figure`, heading, and paragraph tags and stripped every inline element, so
real CMS exports (Blogger `<br><br>` paragraphs, `<a><img>` images, `<b>`,
lists, links, X-post embeds) failed with `unsupported markup`. Nothing applied
it to existing PostgreSQL site states either. The publication worker therefore
rejected every pre-release site with an opaque `bodyMarkdown is required` job
failure, and each release of the two production sites needed an operator to
convert bodies by hand outside the repository.

A second defect surfaced while reproducing this: `parseEditorialMarkdown`
re-serializes the document with `remark-stringify`, and the renderer rendered
that serialization. Text such as `5:00` re-parsed as a `:00` inline directive
and was published as `</p><div></div>`, which is visible on the live site.

## Architecture Review

### Affected Scope

- `packages/content` owns a general pre-release HTML importer, the
  `resolveEditorialBody` boundary helper, directive attribute encoding, and
  the serializer/renderer fix.
- `apps/admin` upgrades stored posts and article variants when a site state
  is read (PostgreSQL and file repositories) and reports unpublishable posts
  by slug at publish time.
- `scripts/deploy/publication-worker-core.ts` resolves every snapshot post
  through the same helper so older snapshots still build.
- `scripts/harness/__tests__` gains a pre-release-body contract test; two source
  string assertions become behavioural assertions.

### Alternatives Considered

1. Keep the narrow importer and document a manual conversion runbook. Pro: no
   parser dependency. Con: every operator repeats an error-prone manual step
   and the platform still fails closed at the last possible moment.
2. Accept `bodyHtml` in the worker and sanitize it directly. Pro: no
   conversion. Con: violates the DATA-002 contract that public HTML is always
   derived from canonical Markdown and reintroduces an HTML write path.
3. Make the import a platform behaviour: a tolerant, deterministic HTML to
   structured-Markdown importer applied at every trusted boundary, lenient on
   admin reads so editors can still open a site, strict at publication with a
   per-post error. Pro: no manual step, one contract, migration persisted on
   the next state write. Con: a small HTML parser dependency.

### Decision

Choose alternative 3. `importHtmlBodyToMarkdown` (the retained
`importPreReleaseHtmlToMarkdown` name now aliases it) parses HTML with
`htmlparser2`, unwraps presentational wrappers, maps paragraphs, `<br>`
breaks, headings, lists, blockquotes, code, rules, links, emphasis, tables
(row per paragraph), `figure`/`img` (alt, then title, then caption, then the
record title as the accessible name), published or third-party X posts to
`embed` directives, and iframes/objects to a visible link. Executable and
form markup is dropped; text is never dropped. Any remaining failure is a
named `EditorialMigrationError` that names the post. `resolveEditorialBody`
is the single boundary helper; admin reads use `withCanonicalBody` in lenient
mode and `makeSnapshot` re-validates strictly.

Directive attribute values use character references (`&quot;`, `&amp;`)
because the directive grammar has no backslash escape. The serializer escapes
`:` before alphanumerics in phrasing and the renderer processes the validated
source rather than its re-serialization.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — seed parsers, archive restore, admin repositories,
      article adapter, and the worker were the only body boundaries; all now
      route through `resolveEditorialBody`.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

### Addendum — imported taxonomy references (2026-09-19)

The same imported records reference taxonomy terms by their original
spelling (`Hardware`), while the platform normalizes new term slugs to lower
case. Post validation therefore rejected every edit on an imported site, and
a removed term could not be recreated. Post category and tag references are
now matched case-insensitively while the stored spelling (and its public
path) is kept; creating a term whose slug matches a deactivated term
reactivates it; an explicit `slug` in the create request is honoured. Covered
by `admin-taxonomy-contract.test.mjs`,
`matches imported category spellings case-insensitively and honours an explicit slug`.

## Solution

Add `packages/content/src/html-body-import.ts` with the importer,
`resolveEditorialBody`, `withCanonicalBody`, and `withCanonicalVariants`.
Use the helper in seed parsing, archive restore, PostgreSQL and file site
state loading, article repositories, snapshot creation, and the publication
worker. Fix directive attribute encoding, colon escaping, and rendering of
the validated source. Cover the contract with harness tests and verify the
two production snapshots build through the standard worker path.

## Affected Files

- `packages/content/package.json`
- `packages/content/src/html-body-import.ts`
- `packages/content/src/editorial-markdown.ts`
- `packages/content/src/seed-parsers.ts`
- `packages/content/src/archive.ts`
- `packages/content/src/index.ts`
- `apps/admin/app/lib/postgres-publication.ts`
- `apps/admin/app/lib/file-content-repository.ts`
- `apps/admin/app/lib/postgres-article-repository.ts`
- `apps/admin/app/lib/article-repository-adapter.ts`
- `apps/admin/app/lib/repository-validation.ts`
- `scripts/deploy/publication-worker-core.ts`
- `scripts/harness/__tests__/html-body-import-contract.test.mjs`
- `scripts/harness/__tests__/content-contract.test.mjs`
- `scripts/harness/__tests__/editorial-static-projection-contract.test.mjs`

## Completion Criteria

- [x] TC-01: Common CMS export HTML (Blogger breaks, linked images, lists,
      links, emphasis, tables, code, embeds, dropped scripts) imports into
      canonical Markdown that parses, renders, and loses no text.
- [x] TC-02: Published and third-party X post markup becomes `embed`
      directives, and images without alt text take the caption or record
      title as their accessible name.
- [x] TC-03: A snapshot whose posts carry only `bodyHtml` builds through
      `publicationInputs`, and a post that still cannot be imported fails with
      an error that names the post.
- [x] TC-04: Admin site state with pre-release posts loads, exposes upgraded
      Markdown, and publish reports the unpublishable post by slug.
- [x] TC-05: `5:00`-style text survives the serialize/render round trip
      without producing `<div></div>` artifacts.
- [x] TC-06: `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` pass,
      and both production snapshots build through the standard worker path.

## Test Plan

| TC-ID | Test Type | Tool / Approach                                                                  | Notes                                                                                                                   |
| ----- | --------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TC-01 | unit      | `html-body-import-contract.test.mjs`                                             | `imports common CMS export HTML into canonical Markdown without losing text`                                            |
| TC-02 | unit      | `html-body-import-contract.test.mjs`                                             | `converts published and third-party X post markup...`, `keeps figure captions and derives alternative text...`          |
| TC-03 | contract  | `html-body-import-contract.test.mjs`                                             | `publishes a snapshot whose posts predate the Markdown contract` exercises `publicationInputs` from the worker          |
| TC-04 | contract  | `html-body-import-contract.test.mjs`                                             | `upgrades pre-release admin content on load and reports unpublishable posts by slug` uses `FileContentRepository`       |
| TC-05 | unit      | `content-contract.test.mjs`, `html-body-import-contract.test.mjs`                | Colon escaping is asserted on the Blogger fixture render; the renderer processes validated source                       |
| TC-06 | gate      | `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`, worker run on real snapshots | The two production snapshots (15 posts, all `bodyHtml`-only) converted with zero failures and zero `<div></div>` output |

## Tasks

- [x] `.agents/tasks/completed/DATA-003.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-19

**Status upgrade:** draft → review-ready
Problem names the narrow importer, the missing migration, the opaque worker failure, and the renderer colon defect with its visible production symptom. Architecture Review lists scope, three alternatives, a decision, and a sibling scan. TC-01 through TC-06 each have a Test Plan row.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-19

**Status upgrade:** review-ready → approved
`authority: delegated`; the owner asked for a universal, provider-neutral platform fix so other operators never hit the manual conversion. No billing, DNS, data deletion, or new external service is involved.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-19

**Status upgrade:** approved → in-progress
Task record `.agents/tasks/completed/DATA-003.md` lists one task per criterion.

### [GATE-VERIFY] — ✅ PASS | 2026-09-19

**Status upgrade:** in-progress → verifying
`pnpm typecheck` (8 packages), `pnpm test` (201 harness tests including 7 new), and `pnpm harness:scan` (6/6) exited 0. Both production snapshots (`default` 11 posts, `aitrendtimes` 4 posts, all without `bodyMarkdown`) resolved through `publicationInputs` with 0 failures and 0 empty-div artifacts.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-09-19

The Blogger fixture imports to 13 top-level nodes (paragraph, figure, list, blockquote, heading, code, thematic break) and the rendered HTML keeps emphasis, links, nested lists, and the embed link while dropping script and style content.
Test reference: `html-body-import-contract.test.mjs`, `imports common CMS export HTML into canonical Markdown without losing text`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-09-19

Both X post shapes parse to `embed` directives with quote and author; a caption-only image takes the caption as alt and a nameless image takes the post title in the worker test.
Test reference: `html-body-import-contract.test.mjs`, `converts published and third-party X post markup into embed directives`, `keeps figure captions and derives alternative text from a caption when the image has none`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-09-19

`publicationInputs` renders a `bodyHtml`-only post from Markdown and rejects an insecure image with `posts.pre-release.bodyMarkdown: imported image requires a relative or HTTPS src`.
Test reference: `html-body-import-contract.test.mjs`, `publishes a snapshot whose posts predate the Markdown contract`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-09-19

A file site state with two pre-release posts loads; the convertible post exposes `Imported **text**.` and publish rejects with `post <slug> cannot be published`.
Test reference: `html-body-import-contract.test.mjs`, `upgrades pre-release admin content on load and reports unpublishable posts by slug`.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-09-19

`from 5\:00 to 7\:00 pm` serializes stably and renders as `<p>from 5:00 to 7:00 pm</p>`; the production `meta-horizon-worlds-v123-unveils` body renders with 16 paragraphs and no `<div></div>`.
Test reference: `content-contract.test.mjs` figure conversion test plus the Blogger fixture assertions in `html-body-import-contract.test.mjs`.

### [GATE-COMPLETE: TC-06] — ✅ PASS | 2026-09-19

Gates exited 0 as recorded under GATE-VERIFY; the real-snapshot worker run printed `total 15 empty div artifacts 0`.
Test reference: Test Plan TC-06.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-19

**Status upgrade:** verifying → done
All criteria are checked with matching `GATE-COMPLETE` entries and the task record is archived.
