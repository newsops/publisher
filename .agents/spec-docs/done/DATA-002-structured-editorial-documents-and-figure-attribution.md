---
status: done
type: DATA
tags: [web, cli, rest, typescript, a11y]
---

# DATA-002: Structured Editorial Documents and Figure Attribution

## Problem

Posts currently store one sanitized `bodyHtml` string. While the sanitizer
allows `figure`, `figcaption`, and safe image attributes, the human editor is
a raw HTML textarea and there is no durable model for an image caption,
alternative text, source name, or source URL. Agents must likewise construct
HTML by hand. The result is inconsistent attribution, weak accessibility, and
no safe extension point for Markdown-oriented editorial tooling.

This is reproduced by opening `PostEditor.tsx`: the body field accepts only a
single HTML string. `sanitizeBodyHtml` preserves a generic figure but does not
model a source credit, and the stored `NewsPost.bodyHtml` cannot distinguish a
caption from a free-form paragraph after arbitrary editing.

## Architecture Review

### Affected Scope

- `packages/content` owns a versioned, provider-neutral structured Markdown
  contract, its validation, AST parsing, HTML rendering, and public content
  projection.
- `apps/admin` owns browser editing forms, authenticated API parsing, storage
  migrations, and media selection only; it does not become the document type
  owner.
- `packages/ops-cli` owns document import/export and Markdown request support
  through the authenticated admin API.
- Static publication, feed, search, and SEO renderers consume generated safe
  HTML and preserve figure semantics without a public runtime dependency.
- A documented adapter/plugin boundary owns Markdown parsing/serialization;
  arbitrary executable MDX, raw HTML injection, and editor-specific storage
  formats are outside the contract.

### Alternatives Considered

1. Retain sanitized HTML as the permanent source of truth. Pro: no migration
   or rendering pipeline. Con: captions and credits are not structured,
   validation is weak, and plugins operate on ambiguous markup.
2. Store CommonMark/Markdown strings as the permanent source of truth. Pro:
   convenient for people and agents with a broad plugin ecosystem. Con:
   standard Markdown cannot faithfully encode all news figures, embeds, and
   editorial metadata without custom syntax and lossy round-tripping.
3. Store versioned structured Markdown as the editorial source and parse it to
   a minimal AST for validation and rendering. Pro: an LLM always reads and
   writes a familiar, portable `.md` representation while the platform still
   has structured validation and deterministic rendering. Con: parser/
   serializer maintenance and a one-time source conversion are required.

### Decision

Choose alternative 3. The PostgreSQL canonical source is a versioned
`bodyMarkdown` document, using CommonMark plus a small, documented,
non-executable directive grammar for news-specific blocks. It is the exact
form supplied to and returned from LLM/agent operations. At each trusted
boundary, the platform parses it to a minimal AST (paragraph, heading, list,
quote, code, link, embed, and figure) for validation and rendering; the AST is
derived data, not an editor-specific database identity. A figure directive has
required image source and alternative text, optional caption, and optional
structured credit `{ name, url }`. A credit URL must be HTTPS; a
caption/source credit is rendered as visible prose, never hidden metadata.

`bodyHtml` becomes a generated, sanitized publication representation rather
than the editable canonical field. Existing stored HTML is converted once to
the supported Markdown during the schema migration; unsupported markup causes
a visible migration error requiring editorial resolution, never silent loss or
an indefinite compatibility mode. This is a pre-release product, so after the
controlled migration the old canonical HTML write path is removed.

Markdown is the LLM and operator-facing database identity. The built-in parser
accepts CommonMark plus documented non-executable directives for figures and
credits, then normalizes it to a transient AST. A plugin can add parser or
serializer support only through validated AST transforms and must produce
canonical Markdown on persistence. It cannot execute MDX/JavaScript, access
deployment secrets, or bypass media/source URL rules.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — current `bodyHtml`, sanitizer, raw HTML editor,
      media service, article adapter, static site renderers, and automation API
      inputs were inspected; no canonical document namespace currently exists
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Define `bodyMarkdown`, its directive grammar, and AST validation in
`@publisher/content`. Provide pure renderers for safe static HTML and a
non-executable structured-Markdown parser and serializer. Document a stable
directive grammar such as a `figure` directive with `src`, `alt`, optional
caption, and optional credit name/URL. The HTML renderer emits a semantic
`figure`, `img`, and `figcaption`; generated output includes source credit
links only when a validated source URL exists.

Replace the raw body HTML admin input with a Markdown editor plus structured
figure controls. Its first implementation must make adding and editing a
figure possible using explicit image, alt text, caption, source name, and
source URL fields, which update the canonical Markdown. The API and CLI accept
and return Markdown only, returning validated structured errors for invalid
nodes, unsupported directives, unsafe URLs, or missing figure alt text.

Migrate storage to carry Markdown source; internal rendering uses its derived
AST. Public static snapshots retain only derived safe article HTML and public
metadata necessary to build static pages. Tests prove attribution rendering,
source sanitization, deterministic Markdown round-trip for supported nodes,
and no executable/raw HTML escape path.

## Affected Files

- `packages/content/src/types.ts`
- `packages/content/src/editor.ts`
- `packages/content/src/post-validation.ts`
- `packages/content/src/article-adapter.ts`
- `packages/content/src/document/`
- `apps/admin/app/PostEditor.tsx`
- `apps/admin/app/admin-model.ts`
- `apps/admin/app/lib/api-input.ts`
- `apps/admin/app/lib/file-content-repository.ts`
- `apps/admin/app/lib/postgres-content-repository.ts`
- `apps/admin/app/api/v2/sites/[siteId]/posts/route.ts`
- `packages/ops-cli/`
- `scripts/deploy/publication-worker-core.ts`
- `docs/admin-api.md`
- `docs/admin-api.openapi.yaml`
- `docs/agent-operations.md`
- `scripts/harness/__tests__/editorial-document-contract.test.mjs`
- `.agents/tasks/DATA-002.md`

## Completion Criteria

- [x] TC-01: `@publisher/content` validates versioned `bodyMarkdown` using
      supported CommonMark and directives, derives semantic block/inline nodes,
      and rejects unknown directives, unsafe links, executable fields, and figures
      without non-empty alternative text.
- [x] TC-02: A figure persists `src`, `alt`, optional caption, and optional
      `{ name, url }` credit; its generated article HTML uses semantic `figure`,
      `img`, and visible `figcaption` attribution without unsafe markup.
- [x] TC-03: The documented CommonMark-plus-directive adapter converts each
      supported AST fixture to and from Markdown deterministically; unsupported
      directives return structured validation errors rather than silently losing
      content.
- [x] TC-04: Browser UI, authenticated API, and CLI can create and revise a
      Markdown figure with caption and source credit; their reads return the same
      normalized Markdown content under revision control.
- [x] TC-05: Existing pre-release HTML posts migrate once to supported
      documents, and unsupported source content stops with a named editorial
      migration error; there is no ongoing HTML write compatibility mode.
- [x] TC-06: Static article HTML, RSS, and public snapshot data render
      sanitized figure attribution while keeping the public site static-only and
      free of editor/database runtime dependencies.
- [x] TC-07: At desktop and 390px viewports the figure form has labels, keyboard focus,
      no console errors, and no horizontal overflow; `pnpm build`,
      `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` exit `0`.

## Test Plan

| TC-ID | Test Type                  | Tool / Approach                                          | Notes                                                                                                                                                                                                                                                                       |
| ----- | -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | data validation            | focused Vitest structured-Markdown contract              | `content-contract.test.mjs` test `renders credited figures and static X embeds from non-executable Markdown`; covers supported nodes and named rejection paths.                                                                                                             |
| TC-02 | renderer contract          | focused Vitest document/static contract                  | `content-contract.test.mjs` same renderer test asserts semantic figure HTML and visible credit; `editorial-static-projection-contract.test.mjs` asserts RSS output.                                                                                                         |
| TC-03 | parser/serializer contract | focused Vitest Markdown adapter tests                    | `content-contract.test.mjs` same test asserts `serializeEditorialMarkdown(document) === document.markdown` and explicit unsupported-node/directive errors.                                                                                                                  |
| TC-04 | API/CLI integration        | authenticated isolated repository and CLI contract       | `admin-automation-contract.test.mjs` test `creates and updates validated content with revision protection`; `agent-operations-cli-contract.test.mjs` test `retrieves the selected author persona before planning a Markdown post` proves the portable CLI context contract. |
| TC-05 | migration integration      | isolated file/PostgreSQL migration fixture               | `content-contract.test.mjs` test `performs a one-time pre-release HTML figure conversion or stops with a named migration error`.                                                                                                                                            |
| TC-06 | static boundary            | focused static publication/feed contract and site build  | `editorial-static-projection-contract.test.mjs` test `keeps derived figure and source-card HTML in RSS content`; `pnpm --filter @publisher/site build` exits 0.                                                                                                             |
| TC-07 | browser and regression     | authenticated browser smoke plus root workspace commands | No repository browser-test runner exists because the required interactive CUA Chrome surface performs UI verification; the recorded agent-run desktop/390px action and root commands exit 0.                                                                                |

## Tasks

- [x] `.agents/tasks/completed/DATA-002.md` — completed implementation record; one planned
      task covers each of TC-01 through TC-07.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-15

**Status upgrade:** draft → review-ready
Frontmatter begins with YAML and declares `status: draft`, the single valid `DATA` type, and non-empty tags.
Problem documents the current raw-HTML editor/bodyHtml behavior and a reproducible inspection path without TBD/TODO placeholders.
Architecture Review contains four checked checklist items, sibling-scan evidence, three alternatives with pro/con trade-offs, and a Decision grounded in those trade-offs.
Completion Criteria contains seven TC-N observable criteria, each covering a defined functional area and avoiding prohibited vague phrasing.
Test Plan has one fully populated, non-manual row for each of TC-01 through TC-07 (7/7), with concrete validation approaches and notes.
Tasks placeholder and an otherwise empty Evidence Log were present before this gate record.

### [GATE-APPROVAL] — ❌ FAIL | 2026-09-15

**Status remains:** review-ready
**Failed criteria:**

- Direct implementation approval: the user stated, “llm이 md에 익숙하니까 llm이 읽어야 하는 것들은 다 md형태로 넣는게 맞다,” which confirms the Markdown-oriented design direction but does not explicitly approve implementing DATA-002.
  **Required action:** Obtain an unambiguous user approval to implement this specific DATA-002 structured-document and figure-attribution scope, then rerun GATE-APPROVAL.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-15

**Status upgrade:** review-ready → approved
Explicit user approval: “승인함” in direct response to the immediately preceding request for “DATA-001 및 DATA-002 승인”; this unambiguously includes DATA-002.
The approval directly authorizes this spec’s structured editorial-document and figure-attribution implementation scope.
No Architecture Review or frontmatter `type`/`tags` modification occurred after that approval before this gate verification.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-15

**Status upgrade:** approved → in-progress
`.agents/tasks/DATA-002.md` exists and `## Tasks` records it as the active implementation record.
Its Plan maps TC-01 through TC-07 respectively to document validation/AST, figure persistence/rendering, directive round trips, admin/API/CLI editing, legacy migration, static publication, and regression/browser verification work.

### [GATE-VERIFY] — ❌ FAIL | 2026-09-15

**Status remains:** in-progress
**Failed criteria:**

- Task completion: `.agents/tasks/DATA-002.md` still marks every planned task for TC-01 through TC-07 as incomplete (`[ ]`), so the required completed-task evidence is absent.
  **Required action:** Complete and mark every DATA-002 task with concrete verification evidence before rerunning this gate.
- Browser/self-verification evidence: neither the DATA-002 task record nor this spec records an agent-run authenticated browser verification with a test-account label and 1440px/390px viewports for the user-facing figure form.
  **Required action:** Perform and record the required agent-run browser verification, including the account label, viewport evidence, focus/overflow/console checks, before rerunning this gate.

### [GATE-VERIFY] — ✅ PASS | 2026-09-15

**Status upgrade:** in-progress → verifying
`.agents/tasks/DATA-002.md` now marks every planned task for TC-01 through TC-07 complete and declares no blockers.
The task record identifies the agent-run isolated local PostgreSQL/PGlite browser fixture and `data002-browser@example.test` owner account; it records the authenticated Markdown/figure form, keyboard-operable insertion, desktop no-console-error result, and 390x844 mobile no-overflow/zero-console-message result.
`pnpm --filter @publisher/site build` exited 0 on 2026-09-15 and generated 22 static routes plus public metadata without a database runtime dependency.
`pnpm --filter @publisher/site test` exited 0 on 2026-09-15.

### [GATE-COMPLETE: TC-01] | 2026-09-15

`pnpm vitest run scripts/harness/__tests__/content-contract.test.mjs` passed. The `renders credited figures and static X embeds from non-executable Markdown` test observed parsed figure/embed nodes and rejected raw HTML, unsafe URLs, uncredited image syntax, and nested directives.

### [GATE-COMPLETE: TC-02] | 2026-09-15

The same focused content contract passed and observed `<figure>`, the visible `Source:` credit, and a non-executable X figure. `editorial-static-projection-contract.test.mjs` passed its RSS figure/source-card projection assertion.

### [GATE-COMPLETE: TC-03] | 2026-09-15

`content-contract.test.mjs` observed deterministic `serializeEditorialMarkdown(document) === document.markdown`; unsupported raw HTML, unsafe links, Markdown images, and invalid top-level directives raised named validation errors.

### [GATE-COMPLETE: TC-04] | 2026-09-15

`admin-automation-contract.test.mjs` passed `creates and updates validated content with revision protection`, observing canonical `bodyMarkdown`, generated HTML, and revision `1`; `agent-operations-cli-contract.test.mjs` passed `retrieves the selected author persona before planning a Markdown post` with the returned machine-readable context.

### [GATE-COMPLETE: TC-05] | 2026-09-15

`content-contract.test.mjs` passed `performs a one-time pre-release HTML figure conversion or stops with a named migration error`, observing a supported HTML figure converted to Markdown and unsupported markup stopped by named errors.

### [GATE-COMPLETE: TC-06] | 2026-09-15

`pnpm vitest run scripts/harness/__tests__/editorial-static-projection-contract.test.mjs` passed, observing derived figure/source-card content in RSS and static Markdown rendering references. `pnpm --filter @publisher/site build` exited 0 with 22 static routes.

### [GATE-COMPLETE: TC-07] | 2026-09-15

Local authenticated Chrome showed the labelled Markdown and image-attribution fields at desktop and iPhone 12 Pro 390x844. The mobile action observed `scrollWidth=390`, `clientWidth=390`, `overflow=false`; after clearing and reloading the console showed zero messages. `pnpm typecheck`, `pnpm test` (40 files / 191 tests), `pnpm build`, and `pnpm harness:scan` (six scans) exited 0.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-15

**Status upgrade:** verifying → done
All seven Completion Criteria are checked and each has a dedicated `[GATE-COMPLETE: TC-N]` record with an executed command or browser action and its observed result.
Every TC-01 through TC-07 Test Plan row now names its test file/function coverage or, for the interactive browser check, the explicit unavailable repository-runner reason and recorded agent-run Chrome evidence.
The focused completion regression command `pnpm exec vitest run scripts/harness/__tests__/content-contract.test.mjs scripts/harness/__tests__/editorial-static-projection-contract.test.mjs scripts/harness/__tests__/admin-automation-contract.test.mjs scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` exited 0 with 4 files and 27 tests passed, including the CLI author-persona planning contract.
`.agents/tasks/DATA-002.md` is absent and the completed record is archived at `.agents/tasks/completed/DATA-002.md`; the Tasks section reflects that archive path.
