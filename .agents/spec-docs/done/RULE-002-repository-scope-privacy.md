---
status: done
type: RULE
tags: [cli]
authority: delegated
---

# RULE-002: The repository holds the program, never an operation

## Problem

The public repository mixes the Publisher program with the owner's operated
publications. A read-only audit on 2026-09-25 found that anyone who opens the
repository can link it to both operated sites, reach their admin, and learn
about the operator:

- Tracked specs, task records, READMEs, docs, a test, an admin placeholder,
  and a content seed name the operated publications, their site IDs, and
  their author slugs (120 matches across 27 files).
- Spec evidence logs record production release, operation, and post IDs,
  hosting project names, and the admin deployment host.
- A done spec contains the operator's local home path (OS user name).
- `packages/content/src/managed-seed.ts` hard-codes a category set for one
  operated site ID.
- The hosting provider's Git integration writes GitHub Deployments and
  Environments for the operator's admin (over 100 records), and the
  repository homepage points at the admin.

Reproduce: `git grep -ciE "<operated site names>|/Users/" -- .` and
`gh api repos/<owner>/<repo>/deployments`.

## Architecture Review

### Affected Scope

- L5 `.agents/rules/repository-scope.md` (new rule), `.agents/rules/index.md`,
  `.agents/rules/repo-single-source.md` (scope note), `CLAUDE.md` (hard gate).
- L5 `scripts/harness/scan-repository-privacy.mjs` (new, twelfth scan),
  `scripts/harness/run-all-scans.mjs`,
  `scripts/harness/__tests__/repository-privacy-contract.test.mjs` (new).
- L0 `packages/content/src/managed-seed.ts` — operated-site category set
  removed; the default seed becomes generic.
- L4 `apps/admin/app/PublicationManagementPanel.tsx` — placeholders use
  example values.
- L5 `scripts/harness/__tests__/editorial-persona-contract.test.mjs` —
  placeholder site ID.
- Documentation: every tracked spec, task record, README, and doc that names
  an operated publication or records production evidence is rewritten with
  placeholders; the one spec file whose name contained an operated site is
  renamed.
- `surface-map.json`, routes, public output: unchanged.

Sibling scan: `scan-spec-contract.mjs` and the other harness scans already
read every tracked Markdown file, so the new scan follows the same walk and
reporting shape. The program's own GitHub identity (the organisation that
hosts this repository, used in `SECURITY.md`, the plugin manifest, and the
marketplace manifest) is the program's home and remains.

### Alternatives Considered

1. Rule text only. Pro: minimal. Con: the existing leaks stay, and nothing
   stops the next session from recording production evidence again.
2. Rule, scrub, and a harness scan with a committed denylist. Con: a
   committed denylist would itself name the operated sites.
3. Rule, scrub, and a scan with generic patterns in the repository plus an
   operator-private denylist file outside it. Pro: CI blocks the generic
   classes (home paths, personal mail, hosting default hosts); the operator's
   local pre-push run also blocks the exact names; nothing private is
   committed. Con: CI cannot know the private names — accepted, the pre-push
   hook runs the same scan with the denylist.

### Decision

Alternative 3. Git history and GitHub-side records (Deployments,
Environments, homepage, the hosting provider's Git integration) are outside
what a commit can change; they are listed as operator actions in the
Solution and require the owner's explicit confirmation because they delete
records or change account settings.

Follow-up owner decision (2026-09-25): the repository was switched to
private immediately, and once this change is complete the owner will delete
it and publish the scrubbed tree as a new repository with fresh history. That
retires the old history, commit messages, Deployments, Environments, and the
homepage field together; the new repository must not be connected to any
operated instance's hosting Git integration.

Owner authority: "나는 웹사이트 배포를 github에 기록으로 남기지 않기를 바란다.
이 레포는 이 publisher라는 프로그램에 대한 레포이며, 내가 생성한 두 사이트는
이 레포와는 전혀 상관없는 창작물이다. 규칙에 추가하라" (2026-09-25).

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Add the rule and its enforcement scan, scrub the working tree, and hand the
owner the GitHub-side actions: remove the hosting project's Git connection,
delete the repository's Deployments and Environments, clear the repository
homepage, and decide whether to rewrite history or recreate the repository.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: `PUBLISHER_PRIVATE_DENYLIST=<operator file> node scripts/harness/scan-repository-privacy.mjs` → exit 0 on the scrubbed tree; the same scan with no denylist → exit 0.
- [x] TC-02: The contract test proves the scan fails on a home path, a personal mail address, a `*.vercel.app` host, and a denylist term, and passes on placeholders and on the program's own organisation name.
- [x] TC-03: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` → exit 0 with twelve scans.
- [x] TC-04: `git grep -ciE` for the operator's denylist terms and `/Users/` over tracked files → no matches.

## Test Plan

| TC-ID | Test Type | Tool / Approach                            | Notes                                                                             |
| ----- | --------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| TC-01 | gate      | scan with and without the private denylist | Precondition: operator denylist file exists outside the repository.               |
| TC-02 | contract  | vitest on temp files                       | Fixtures use synthetic terms (`zz-private-site`), never the real names.           |
| TC-03 | gate      | workspace gates                            | Full run before the PR.                                                           |
| TC-04 | gate      | `git grep`                                 | Run locally with the denylist; the command itself is not recorded with the terms. |

## Tasks

- [x] Rule, scan, scrub, and gates.

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
Implementer subagent built the scan and scrubbed the tree; the coordinator re-ran every check independently.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-25

Command: the scan with the operator's private denylist, and again with no denylist available.
Observed result: `[repository-privacy] 472 tracked files clean` in both runs; the second prints the "no private denylist; generic checks only" note.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-25

Command: `pnpm vitest run --config vitest.harness.config.ts scripts/harness/__tests__/repository-privacy-contract.test.mjs`.
Observed result: 8 passed — home path, personal mail, hosting default host, denylist term (content, file path, and a term wrapped across lines) fail with the term redacted from output; placeholders, the program's own organisation, and skipped generated paths pass; a missing default denylist keeps the generic checks.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-25

Command: `pnpm build`, `pnpm build:admin`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.
Observed result: builds succeed; 0 type errors; 46 harness files / 238 tests, plugin 11, admin-client 3; `[harness] 12 scans passed`. The built admin bundle carries the new `news.example.com` placeholder and no denylist term. The placeholder text is only visible behind an authenticated database session, so the check was made on the built bundle rather than an interactive login.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-25

Command: `git grep -ciE --untracked -f <private denylist>` and `git grep -nE "/Users/|vercel\.app|pages\.dev|gmail\.com"` over the working tree.
Observed result: no denylist match; the only generic matches are the rule, this spec, and the scan test describing the patterns themselves.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-25

**Status upgrade:** verifying → done
