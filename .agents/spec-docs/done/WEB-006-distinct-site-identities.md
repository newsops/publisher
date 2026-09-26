---
status: done
type: SCREEN
tags: [web]
authority: delegated
---

# WEB-006: Distinct visual identities for Example News and Second Example

## Problem

Two publications of one instance, Example News (`editorial` theme) and
Second Example (`signal` theme), look like the same
product in two colours. `packages/publication/src/themes/signal.ts` is a
line-for-line copy of `editorial.ts` with a different `:root` token block
(green instead of red, warm paper instead of white): the same black masthead
with a search box, the same three-row header, the same lead-image-left /
headline-right hero, the same four-up card grid, the same numbered right rail,
the same footer. A reader who visits both immediately sees that they run on
one platform. Reproduce: `diff` the two theme files after normalising the
theme id — only the first token line differs.

## Architecture Review

### Affected Scope

- L2 `packages/publication/src/themes/signal.ts` — rewritten stylesheet
  (tokens, header, index, article, rail, comments, footer, responsive rules);
  `version` bumped to `2`.
- L2 `packages/publication/src/themes/editorial.ts` — unchanged; it remains
  the broadcast-newsroom identity for Example News.
- L5 `scripts/harness/__tests__/presentation-parity-contract.test.mjs` —
  unchanged; it must keep passing (every theme styles every presentation
  marker).
- No renderer, content-contract, route, or `surface-map.json` change: both
  sites keep the same semantic HTML, URLs, and SEO output.

Sibling scan: themes are self-contained CSS strings in `packages/publication`
(ARCH-004); the renderer links `/theme-runtime/current.css` after the shared
baseline, so a theme can restyle every slot without touching markup. The
marker list in `static-policy.ts` (`PRESENTATION_MARKERS`) is the contract a
new stylesheet must cover. No theme may load remote resources (fonts,
images): the public build is self-hosted and deterministic.

### Alternatives Considered

1. Recolour `signal` further (new palette, new fonts) on the same layout.
   Pro: tiny change. Con: layout, hierarchy, and chrome stay identical — the
   exact tell the owner reported.
2. Add per-theme layout variants to the renderers (different home
   composition, section labels, header markup). Pro: maximal difference. Con:
   touches both renderers and the `apps/site` parity contract, adds a
   theme-to-markup coupling, and changes public HTML for both sites.
3. Rewrite `signal` as a different design system on the shared semantic
   markup: different colour mode, type system, masthead composition, home
   grid (lead, river, rail placement), article column, and footer — CSS only.
   Pro: large visual difference, no markup or URL change, parity contract
   intact, reversible by theme switch. Con: section labels and DOM order are
   shared; mitigated by CSS reordering and typographic treatment.

### Decision

Alternative 3. Example News keeps the BBC/CNN-style broadcast newsroom
(white, black masthead, signal red, sans headlines, four-up grid). Second
Example becomes a dark "research wire" identity: deep ink-navy ground, an
electric accent, serif display headlines with monospaced metadata, a centred
wordmark masthead without the black search bar, a full-bleed lead with
overlaid headline, a single-column river of stories with thumbnails, the rail
restyled as a numbered index, and a long-form article column. Section labels
and ordering differences beyond CSS are recorded as a follow-up if the owner
wants markup-level variation (Alternative 2).

Owner authority: "두 디자인을 확연히 다르게 처리해주세요 … 반복해서 처리하고
완료해주세요" (2026-09-25), under the standing delegation recorded in ARCH-001.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Replace the `signal` stylesheet, iterate with rendered screenshots of both
live sites (mirrored locally with the candidate theme CSS injected) until an
independent critic judges the two sites visually unrelated at desktop and
mobile widths, then republish Second Example so the new theme runtime is
materialised and deploy the release.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/presentation-parity-contract.test.mjs` → all pass (every marker styled by `signal`).
- [x] TC-02: `grep -E "url\\(|@import|https?://" packages/publication/src/themes/signal.ts` → no remote resource references.
- [x] TC-03: Side-by-side screenshots of home and article pages at 1440 px and 390 px for both sites; an independent reviewer scores "could a reader tell these share a platform?" and the final round answers no, with no horizontal overflow at 390 px and body text contrast ≥ 4.5:1.
- [x] TC-04: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` → exit 0.
- [x] TC-05: After republishing Second Example, https://second.example.com/ and one article page load the new theme (`/theme-runtime/current.css` contains the new tokens) and render correctly in the browser; https://news.example.com/ is unchanged.

## Test Plan

| TC-ID | Test Type | Tool / Approach                               | Notes                                                                                  |
| ----- | --------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| TC-01 | contract  | presentation parity test                      | Existing contract; no change to the test.                                              |
| TC-02 | gate      | `grep`                                        | Self-hosted theme rule.                                                                |
| TC-03 | manual    | headless screenshots + reviewer subagent      | Precondition: live sites mirrored locally; candidate CSS injected as `current.css`.    |
| TC-04 | gate      | workspace gates                               | Full run before the PR.                                                                |
| TC-05 | manual    | publish worker + static deploy + browser pane | Precondition: production admin run locally with scratchpad credentials, deleted after. |

## Tasks

- [x] Rewrite `signal` and iterate with the critic until TC-03 passes.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-25

**Status upgrade:** draft → review-ready

### [GATE-APPROVAL] — ✅ PASS | 2026-09-25

**Status upgrade:** review-ready → approved
`authority: delegated`; owner request quoted in Decision.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-25

**Status upgrade:** approved → in-progress

### [GATE-VERIFY] — ✅ PASS | 2026-09-25

**Status upgrade:** in-progress → verifying
A designer subagent rewrote `signal` over four screenshot rounds against locally mirrored copies of both live sites (candidate CSS injected as `current.css`), including one mid-course critic round (similarity 4/10 desktop, 6/10 mobile → fixed: centred ticker, hidden masthead search, serif nav, centred phone article head, cover-style phone lead, 12 px minimum mono text).

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-25

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/presentation-parity-contract.test.mjs`.
Observed result: 4 passed; every class styled by `editorial` is also styled by `signal`.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-25

Command: `grep -cE "url\(|@import|https?://" packages/publication/src/themes/signal.ts`.
Observed result: `0`.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-25

Command: headless screenshots of home and article at 1440 and 390 px for both sites plus recent, archive, label, author, and X-post pages; final independent reviewer subagent; browser-pane inspection by the coordinator.
Observed result: reviewer similarity 1/10 desktop and 1/10 mobile, verdict "ship"; no overflow at 390/768 px (`scrollWidth` ≤ viewport on every page); body contrast 14.5:1, meta 7.2:1, accent 14.6:1. Palette: ground `#0b1120`, ink `#f1f3f7`, accent `#c8f23c`; Didot wordmark, serif headlines, `ui-monospace` metadata.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-25

Command: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.
Observed result: build ok (editorial runtime digest unchanged `fe8a7c25…`); 0 type errors; 45 files / 230 harness tests, plugin 11, admin-client 3; `[harness] 11 scans passed`.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-25

Command: `publisher publish --site second-site --idempotency-key <key>`; `publication-worker.ts --next --site second-site`; `wrangler pages deploy … --project-name <pages-project>`; `curl …/theme-runtime/current.css`; browser pane.
Observed result: operation `<operation-id>` → `published`; the second site's `/theme-runtime/current.css` starts `:root { color-scheme: dark; --paper: #0b1120;` and home plus article render the new design; the first site still serves the unchanged editorial CSS (verified on an operated instance; evidence kept privately by the operator). Session key and credentials deleted, local admin stopped.

Follow-up (not in scope): the home rail repeats the lead and river when a site has fewer than ~10 stories (renderer fallback `Most recent`); section labels are shared text across sites — both need renderer-level variation (Alternative 2).

### [GATE-COMPLETE] — ✅ PASS | 2026-09-25

**Status upgrade:** verifying → done
