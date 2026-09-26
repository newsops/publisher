---
status: done
type: RULE
tags: [cli]
authority: delegated
---

# RULE-003: Recurrence guards for operator privacy

## Problem

RULE-002 added `scan-repository-privacy.mjs`, but a review of how the leak
happened shows paths it does not cover:

1. Commit messages, pull-request titles and bodies are never scanned; an
   operated site's name reached a commit message after RULE-002's scrub had
   started.
2. CI runs only the generic patterns because the exact private terms live in
   a file on the operator's machine; a push from another machine or with
   `--no-verify` bypasses them.
3. Nothing detects GitHub Deployments, Environments, hosting commit statuses,
   or a hosting URL in the repository homepage — the records the operator's
   hosting integration created.
4. The spec skills ask for "Command / Observed result" evidence without
   telling agents to keep production evidence out of the repository, which is
   how release, operation, and post IDs entered specs.
5. Binary files are skipped by the scan, so a production screenshot could be
   committed.
6. The private denylist is maintained by hand; a new operated site is
   unprotected until someone remembers to add its terms.

## Architecture Review

### Affected Scope

- L5 `scripts/harness/scan-repository-privacy.mjs` — new text modes
  (`--message-file`, `--commit-range`, `--text-env`) and a tracked-image
  allowlist; `scripts/harness/__tests__/repository-privacy-contract.test.mjs`.
- L5 `scripts/harness/check-github-records.mjs` (new) +
  `scripts/harness/__tests__/github-records-contract.test.mjs` (new).
- L5 `scripts/privacy-denylist.mjs` (new) + root `package.json` script
  `privacy:denylist`.
- L5 `.husky/commit-msg` (new), `.husky/pre-push` (commit-range check).
- L5 `.github/workflows/verify.yml` — full-history checkout, optional
  denylist secret, PR title/body and commit-range checks, a `github-records`
  job (push, pull request, daily schedule).
- Docs/skills: `.agents/rules/repository-scope.md`,
  `.agents/skills/backlog-writer/SKILL.md`,
  `.agents/skills/backlog-gate-guard/SKILL.md`,
  `.agents/skills/spec-writing-standard/SKILL.md`, `docs/agent-operations.md`,
  `packages/claude-plugin/README.md` (new-site step).

Sibling scan: all harness scripts are plain Node ESM with `[name]` prefixed
output and exit codes; the new checker follows `scan-plugin-contract.mjs`
(`--root`-style overrides for tests). No runtime package, route, or public
output changes.

### Alternatives Considered

1. Document the procedures only. Con: the leak happened while rules existed
   in spirit; recurrence needs mechanical checks.
2. Commit the denylist in hashed form. Pro: CI coverage without a secret.
   Con: substring matching over hashes needs n-gram hashing and still reveals
   term counts; brittle.
3. Keep the denylist private everywhere: local file for hooks, an Actions
   secret for CI, redacted output; add message, PR, image, and GitHub-record
   checks. Chosen.

### Decision

Alternative 3. The Actions secret is optional: without it CI still runs the
generic checks and prints the existing "generic checks only" note. The
GitHub-records job fails when the repository has any Deployment or
Environment, when the default branch head carries a commit status or check
run from a hosting integration (Vercel, Cloudflare Pages, Netlify, Render),
or when the homepage field is a hosting default host or an operated domain
from the denylist.

Owner authority: "A~E 다 진행해줘" (2026-09-25), selecting the five code-side
guards proposed after the RULE-002 audit.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

Implement guards A–E: message and PR text scanning (hooks + CI), CI denylist
from a secret, a GitHub-records checker, spec-skill wording plus an image
allowlist, and a denylist management command with a new-site step in the
operator docs.

## Affected Files

See Affected Scope.

## Completion Criteria

- [x] TC-01: The scan's text modes reject a denylist term or generic pattern in a message file, a commit range, and an environment variable, with the term redacted; clean text passes.
- [x] TC-02: `.husky/commit-msg` blocks a commit whose message contains a denylist term; `.husky/pre-push` checks the messages of the commits being pushed.
- [x] TC-03: `check-github-records.mjs` against a recording HTTP server fails on a Deployment, an Environment, a hosting commit status, a hosting check run, and a hosting homepage, and passes on an empty record set; it exits 2 without a token instead of passing silently.
- [x] TC-04: The scan rejects a tracked raster image or PDF outside the allowlist and accepts one inside it.
- [x] TC-05: `pnpm privacy:denylist add <term>` creates or updates the private file with mode 600, never prints terms, and `count` reports the number of terms.
- [x] TC-06: `verify.yml` loads as YAML, runs the scan with the optional secret, checks PR title/body and the PR commit range, and has a `github-records` job with read-only permissions and a daily schedule.
- [x] TC-07: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan` → exit 0.

## Test Plan

| TC-ID | Test Type | Tool / Approach                             | Notes                                               |
| ----- | --------- | ------------------------------------------- | --------------------------------------------------- |
| TC-01 | contract  | vitest over temp files and a temp Git repo  | Synthetic term `zz-private-site`; never real names. |
| TC-02 | contract  | vitest: temp repo with the hooks installed  | Hooks call the same scan; no network.               |
| TC-03 | contract  | vitest with a local recording server        | `GITHUB_API_URL` override; no call to github.com.   |
| TC-04 | contract  | vitest over a temp tree                     | Allowlist is a constant in the scan.                |
| TC-05 | unit      | vitest with a temp `HOME`                   | File mode asserted with `fs.stat`.                  |
| TC-06 | gate      | structural assertions in a test + YAML load | Real CI run happens on the new repository.          |
| TC-07 | gate      | workspace gates                             | Full run, including inside the pre-push hook.       |

## Tasks

- [x] Guards A–E, tests, docs, gates.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-25

**Status upgrade:** draft → review-ready

### [GATE-APPROVAL] — ✅ PASS | 2026-09-25

**Status upgrade:** review-ready → approved
`authority: delegated`; owner selection quoted in Decision.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-25

**Status upgrade:** approved → in-progress

### [GATE-VERIFY] — ✅ PASS | 2026-09-25

**Status upgrade:** in-progress → verifying
Implementer subagent built guards A–E; the coordinator re-ran the gates, the message scan against the real private denylist, and committed through the real hooks.

### [GATE-COMPLETE: TC-01] — ✅ | 2026-09-25

Command: `repository-privacy-contract.test.mjs` (14 tests) and a manual `--message-file` run with a real denylist term and a hosting host.
Observed result: message file, commit range, unpushed commits, and `--text-env` all reject violations; the denylist term is reported only as `denylist term`; clean text and the agent/noreply trailers pass.

### [GATE-COMPLETE: TC-02] — ✅ | 2026-09-25

Command: hook cases in `repository-privacy-contract.test.mjs` (temp repo with a bare remote); this change was committed without bypassing hooks.
Observed result: `commit-msg` rejects a message with the synthetic term and accepts a clean one; `pre-push` scans `<remote>..<local>` or `--unpushed` for new branches before the existing gates.

### [GATE-COMPLETE: TC-03] — ✅ | 2026-09-25

Command: `github-records-contract.test.mjs` (8 tests, local recording server).
Observed result: Deployment, Environment, hosting status, hosting check run, hosting homepage, and a 403 on environments each exit 1; a clean set exits 0; missing token or repository exits 2 with no request made; every request hit the local server.

### [GATE-COMPLETE: TC-04] — ✅ | 2026-09-25

Command: image-allowlist case in `repository-privacy-contract.test.mjs`.
Observed result: a PNG outside `ALLOWED_BINARY_PATHS` fails with `binary outside allowlist`; one inside passes. The repository tracks no raster images today.

### [GATE-COMPLETE: TC-05] — ✅ | 2026-09-25

Command: `privacy-denylist-contract.test.mjs` (temp `HOME`).
Observed result: `add` creates the directory (700) and file (600), de-duplicates, prints only counts; `count` and `path` never print terms; `add -` reads terms from stdin to keep them out of shell history.

### [GATE-COMPLETE: TC-06] — ✅ | 2026-09-25

Command: `privacy-guards-workflow.test.mjs` (5 structural tests; the root has no YAML dependency) plus a one-off YAML load of `verify.yml`.
Observed result: triggers `pull_request`, `push`, `schedule` (`17 3 * * *`); `repository` checks out with `fetch-depth: 0`, writes the optional secret to `$RUNNER_TEMP` without echoing it, scans PR title/body and the PR commit range; `github-records` has read-only permissions. The real CI run happens on the recreated repository; the environments permission is verified there.

### [GATE-COMPLETE: TC-07] — ✅ | 2026-09-25

Command: `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`.
Observed result: 0 type errors; 49 harness files / 259 tests, plugin 11; `[harness] 12 scans passed`; privacy scan `484 tracked files clean` with the private denylist.

### [GATE-COMPLETE] — ✅ PASS | 2026-09-25

**Status upgrade:** verifying → done
