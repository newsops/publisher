# DATA-002 Structured Editorial Documents and Figure Attribution

- **Status**: in-progress
- **Created**: 2026-09-15
- **Branch**: main
- **Scope**: packages/content, apps/admin, packages/ops-cli, packages/publication, scripts/deploy, docs, scripts/harness

## Objective

Replace canonical editable post HTML with validated versioned Markdown,
including accessible figure attribution, while preserving static publication
boundaries and providing identical API and CLI document contracts.

## Plan

- [ ] TC-01: Define the versioned structured-Markdown document contract, AST,
      parser validation, safe URL rules, directive allowlist, and required figure
      alternative text in `@publisher/content`.
- [ ] TC-02: Implement figure persistence and safe semantic HTML rendering for
      image source, alternative text, optional caption, and optional named HTTPS
      source credit.
- [ ] TC-03: Document the directive grammar and implement deterministic
      supported-node Markdown parse/serialize round trips with structured errors
      for unsupported directives.
- [ ] TC-04: Replace the admin raw-HTML editing path with Markdown and figure
      controls; align authenticated admin API and `packages/ops-cli` reads/writes
      on normalized revision-controlled Markdown.
- [ ] TC-05: Add one-time pre-release HTML-to-Markdown migration behavior and
      named editorial migration errors for unsupported legacy source, removing
      HTML canonical-write compatibility.
- [ ] TC-06: Update static article, RSS, and public snapshot generation to use
      derived sanitized figure attribution without adding site database or editor
      runtime dependencies.
- [ ] TC-07: Add contract, integration, migration, static-boundary, and
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

## Decisions

- Canonical operator and LLM content is versioned structured Markdown;
  publication HTML and AST are derived representations.
- Figure source credit is visible prose and its URL is accepted only over HTTPS.

## Blockers

- None.

## Result

(Complete when every TC task and its verification evidence are recorded.)
