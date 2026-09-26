# DATA-002 Structured Editorial Documents and Figure Attribution

- **Status**: completed
- **Created**: 2026-09-15
- **Branch**: main
- **Scope**: packages/content, apps/admin, packages/ops-cli, packages/publication, scripts/deploy, docs, scripts/harness

## Objective

Replace canonical editable post HTML with validated versioned Markdown,
including accessible figure attribution, while preserving static publication
boundaries and providing identical API and CLI document contracts.

## Plan

- [x] TC-01: Define the versioned structured-Markdown document contract, AST,
      parser validation, safe URL rules, directive allowlist, and required figure
      alternative text in `@publisher/content`.
- [x] TC-02: Implement figure persistence and safe semantic HTML rendering for
      image source, alternative text, optional caption, and optional named HTTPS
      source credit.
- [x] TC-03: Document the directive grammar and implement deterministic
      supported-node Markdown parse/serialize round trips with structured errors
      for unsupported directives.
- [x] TC-04: Replace the admin raw-HTML editing path with Markdown and figure
      controls; align authenticated admin API and `packages/ops-cli` reads/writes
      on normalized revision-controlled Markdown.
- [x] TC-05: Add one-time pre-release HTML-to-Markdown migration behavior and
      named editorial migration errors for unsupported legacy source, removing
      HTML canonical-write compatibility.
- [x] TC-06: Update static article, RSS, and public snapshot generation to use
      derived sanitized figure attribution without adding site database or editor
      runtime dependencies.
- [x] TC-07: Add contract, integration, migration, static-boundary, and
      browser coverage; verify desktop/mobile figure form accessibility and run
      `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan`.

## Progress

### 2026-09-15

- Created after DATA-002 received explicit implementation approval and passed
  GATE-IMPLEMENT.
- Added the CommonMark parser/serializer and directive plugin dependencies;
  implementation next replaces the raw HTML edit contract with validated
  Markdown and a safe figure directive.
- Added `bodyMarkdown` API and admin-editor input, safe derived HTML rendering,
  credited figure output, and regression coverage for safe/unsafe figure
  inputs. Workspace typecheck and focused contracts pass.
- Rebased active DATA-002 work onto the recreated repository's `origin/main`.
  The content contract now carries canonical Markdown with generated static
  HTML, rejects raw HTML on editor/API writes, and retains a named one-time
  pre-release HTML migration path for checked-in seed/archive imports.
- Added the admin's labelled figure insertion form for image source,
  alternative text, caption, source name, and source URL. The admin production
  build succeeds after the Markdown contract change.
- Removed the remaining editable HTML path from language variants. The figure
  form now selects approved media-library variants as well as permitted external
  image sources, and static site RSS/Atom feeds derive their content from
  Markdown instead of a checked-in HTML field.
- Added deterministic AST serialization, URL/node rejection coverage, semantic
  figure/source-card RSS coverage, and a one-time supported HTML figure import.
  Full typecheck, build, test, and harness scan pass; authenticated browser
  evidence remains the only open verification work.
- In an isolated local PostgreSQL/PGlite fixture, authenticated as
  `data002-browser@example.test` (owner), Chrome showed a `Body Markdown`
  textarea explicitly stating that raw HTML is not accepted. Its labelled
  `Insert attributed image` controls include approved/external image source,
  alternative text, caption, source name, and source URL, followed by a
  keyboard-operable `Insert image` action. The UI also exposes the canonical X
  source-card field, author context, category/tag controls, and language
  variant `bodyMarkdown` rather than an editable HTML field.
- At the 390x844 iPhone 12 Pro emulation,
  `innerWidth === document.documentElement.scrollWidth ===
document.documentElement.clientWidth === 390` and `overflow === false`;
  after reload Chrome reported zero console messages. Desktop Chrome rendered
  the same form without console errors. The local test fixture is isolated and
  no production data or credentials were used.
- Focused evidence: `scripts/harness/__tests__/content-contract.test.mjs`
  covers canonical Markdown parse/serialize, credited figures, raw-HTML/URL
  rejection, and named pre-release migration errors;
  `scripts/harness/__tests__/admin-automation-contract.test.mjs` verifies
  revision-protected API Markdown writes; and
  `scripts/harness/__tests__/editorial-static-projection-contract.test.mjs`
  verifies derived figure/source-card RSS and static projection.
  Full evidence on 2026-09-15: `pnpm typecheck`, `pnpm test` (40 files / 191
  tests), `pnpm build`, and `pnpm harness:scan` (all six scans) exited 0.

## Decisions

- Canonical operator and LLM content is versioned structured Markdown;
  publication HTML and AST are derived representations.
- Figure source credit is visible prose and its URL is accepted only over HTTPS.

## Blockers

- None.

## Result

Completed after all completion criteria and verification evidence were recorded.
