---
status: done
type: AGREEMENT
tags: [cli, rest, typescript, auth]
authority: delegated
---

# CLI-005: Agent plugin lifecycle operations

## Problem

The authenticated Admin API and human admin surface expose site-scoped reviewed
plugin installation, configuration, validation, enablement, and disablement.
However, running `node packages/ops-cli/bin/publisher.mjs plugin --json
--non-interactive` returns `USAGE`; the provider-neutral agent CLI has no
plugin command. An agent therefore cannot operate an approved adapter without
falling back to the human web UI, despite the platform's independent,
agent-complete control-plane requirement. This occurs for every site and every
reviewed plugin, including a site-specific Google Analytics configuration.

## Architecture Review

### Affected Scope

- `packages/ops-cli/bin/publisher.mjs`: parse plugin commands, require the
  existing environment-only Admin API credentials, read JSON-file configuration,
  and emit redacted versioned envelopes.
- `packages/admin-client/src/index.js` and `packages/admin-client/src/index.d.ts`:
  use the existing site-scoped plugin methods or add their typed counterparts
  only if the client boundary lacks a required API operation.
- `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`: prove
  exact scoped request methods, revisions, non-interactive mutation guards,
  and token redaction through an in-process Admin API fixture.
- `docs/agent-operations.md` and `docs/plugins.md`: document the agent-first
  lifecycle and the separate consent and static-release boundaries.

### Alternatives Considered

1. Continue using the human admin UI for plugin management.
   - Pro: no CLI implementation work.
   - Con: makes autonomous operations depend on a browser and contradicts the
     independent CLI/API control plane.
2. Let the CLI write PostgreSQL, object storage, or hosting-provider settings
   directly.
   - Pro: fewer HTTP calls during one operation.
   - Con: bypasses authorization, audit, validation, revision checks, and the
     replaceable-provider boundary.
3. Add a `plugin` command group that delegates only to the authenticated,
   site-scoped Admin API.
   - Pro: shares the existing authorization, audit, validation, and optimistic
     concurrency contract with the human surface.
   - Con: requires a reachable Admin API and a scoped API token.

### Decision

Choose alternative 3. The CLI will expose `plugin list`, `plugin get`,
`plugin configure`, `plugin validate`, `plugin enable`, and `plugin disable`.
Read commands require `--site`; mutations additionally require
`--non-interactive` and an observed positive `--revision`. `configure` reads
public-safe configuration from `--input <json-file>` rather than command-line
JSON, avoiding shell escaping and keeping the command contract compatible with
future configuration that must not appear in process listings. The CLI makes
no direct provider, database, or static-artifact call.

For `google.analytics`, a measurement ID can be configured for each site with
`consent: "denied"`; validation proves the reviewed configuration is accepted.
Enabling and publishing remain separate operations: they must not occur until
an approved consent UI/CMP emits the documented analytics-consent signal and
the operator performs the separately authorized public release. This preserves
the static-only public-site boundary and avoids inferring reader consent.

### Architecture Review Checklist

- [x] 영향 패키지/레이어/파일 목록 작성 완료
- [x] Sibling scan 완료 — existing `site`, `taxonomy`, `author`, `post`, and
      `content` CLI namespaces do not use the top-level `plugin` segment; the
      Admin API already reserves `/api/v2/sites/{siteId}/plugins`.
- [x] 대안 최소 2개 검토 완료
- [x] 결정 근거 문서화 완료

## Solution

ARCH-007 supersedes the original domain spelling below: the current command
group and API paths use Adapter, with no aliases for the original names.

Implement the following provider-neutral commands over
`@publisher/admin-client`:

```text
publisher adapter list --site <site-id> --json
publisher adapter get --site <site-id> --id <adapter-id> --json
publisher adapter configure --site <site-id> --id <adapter-id> --input <json-file> --revision <n> --non-interactive --json
publisher adapter validate --site <site-id> --id <adapter-id> --revision <n> --non-interactive --json
publisher adapter enable --site <site-id> --id <adapter-id> --revision <n> --non-interactive --json
publisher adapter disable --site <site-id> --id <adapter-id> --revision <n> --non-interactive --json
```

Every output remains a schema-versioned safe envelope. Responses may expose
only the public configuration and `hasSecretReferences` state supplied by the
Admin API; they never expose bearer tokens, secret references, values, or a
provider credential. The command applies no publish action implicitly.

## Affected Files

- `.agents/spec-docs/draft/CLI-005-agent-plugin-lifecycle.md`
- `.agents/tasks/CLI-005.md` (created by GATE-IMPLEMENT)
- `packages/ops-cli/bin/publisher.mjs`
- `packages/admin-client/src/index.js` (only if required)
- `packages/admin-client/src/index.d.ts` (only if required)
- `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`
- `docs/agent-operations.md`
- `docs/adapters.md`

## Completion Criteria

- [x] TC-01: `adapter list --site a --json` and `adapter get --site a --id google.analytics --json` issue only authenticated `GET /api/v2/sites/a/adapters` and `GET /api/v2/sites/a/adapters/google.analytics` requests and return their site-qualified API state.
- [x] TC-02: `adapter configure --site a --id google.analytics --input <file> --revision 3 --non-interactive --json` sends only the parsed public-safe file payload with `If-Match: 3`; a missing input, revision, or `--non-interactive` returns a nonzero envelope before any mutation request.
- [x] TC-03: `adapter validate|enable|disable` with a positive observed revision issue the respective explicit action through the scoped Admin API; unknown verbs return `USAGE` without a request.
- [x] TC-04: CLI adapter results and error envelopes never contain `PUBLISHER_API_TOKEN`, and the documented GA4 example configures each site with consent denied without an implicit enable or publish.
- [x] TC-05: `pnpm exec vitest run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/google-analytics-adapter.test.mjs`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` complete successfully.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | integration | `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs` and `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs` | Written tests: `CLI-005 adapter lifecycle` → `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`; `agent operations CLI contract` → `covers every automation capability with a command that maps to one v2 operation (ARCH-006)`. Actual CLI subprocesses assert exact scoped GET paths, authenticated client use and site-qualified results.                                                                                                                        |
| TC-02 | integration | `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs` with temporary JSON input and local HTTP fixture                       | Written tests in `CLI-005 adapter lifecycle`: `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication` and parameterized `rejects %s before any request`. Assert parsed public JSON, quoted `If-Match` and zero requests for missing input/revision/non-interactive guard.                                                                                                                                                                                                |
| TC-03 | integration | `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs` actual API-handler bridge and local HTTP fixture                       | Written tests in `CLI-005 adapter lifecycle`: `validates the installed configuration without an input file against the real API handlers`, `blocks validation after a %s read instead of issuing POST`, `does not POST validation when reading the installation fails`, `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication` and `rejects %s before any request`. Cover selected installation revision/configuration, explicit action bodies and pre-request refusal. |
| TC-04 | contract    | `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs` and `scripts/harness/__tests__/google-analytics-adapter.test.mjs`      | Written tests: `CLI-005 adapter lifecycle` → `redacts a token echoed by a failing remote service` and `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`; `Google Analytics static adapter contract` → `accepts only a GA4 ID and declared consent without credentials` and `keeps denied consent byte-inert and does not declare Google origins`. Sentinel credentials never escape; denied configuration causes no implicit enable/release.                       |
| TC-05 | regression  | Focused Vitest suites, `pnpm typecheck`, `pnpm test`, `pnpm harness:scan`                                                         | Written regression references are the suites and named tests in TC-01–TC-04; `scripts/harness/__tests__/package-test-runner-contract.test.mjs` → `real package test entry points` also proves package commands execute assertions. Full workspace checks execute those suites and the harness. Live production configuration and release are outside this program-only completion; no production test is substituted with local evidence.                                                                           |

## Tasks

- [x] `.agents/tasks/completed/CLI-005.md` — active implementation record

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-09-17

**Status upgrade:** draft → review-ready

- Frontmatter begins with YAML and declares `status: draft`, valid `type: AGREEMENT`, non-empty `tags`, and `authority: delegated`.
- Problem names the reproducible `node packages/ops-cli/bin/publisher.mjs plugin --json --non-interactive` → `USAGE` failure and its every-site/reviewed-plugin context.
- Architecture Review lists affected boundaries, records completed sibling-scan evidence, evaluates three alternatives with pro/con pairs, and chooses the API-mediated CLI based on explicit trade-offs.
- Completion Criteria contains five observable, command- or request-level `TC-N` criteria with no prohibited vague success wording.
- Test Plan contains one non-empty, automated strategy row for each of TC-01 through TC-05; no manual-only row or TBD remains.
- Tasks contains the required GATE-IMPLEMENT placeholder, and Evidence Log was empty before this GATE-WRITE record.

### [GATE-APPROVAL] — ✅ PASS | 2026-09-17

**Status upgrade:** review-ready → approved

- Frontmatter declares `authority: delegated`; `.agents/rules/authority-delegation.md` grants standing delegation for ordinary implementation once the Architecture Review, alternatives, decision, affected scope, and test plan are complete.
- The completed Architecture Review documents all required scope, sibling-scan, alternatives, decision, and verification planning evidence; GATE-WRITE recorded that review as PASS before this approval gate.
- Inspection found no implementation edit or implementation commit for `packages/ops-cli/bin/publisher.mjs`, `packages/admin-client/src/index.js`, or `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`; the only pending change is this spec lifecycle transition.
- After the delegated authority evidence, the Architecture Review and frontmatter `type`, `tags`, and `authority` remain unchanged; only `status` advanced from `draft` to `review-ready` for GATE-WRITE.
- Execution-time exceptions remain in force: this approval does not authorize any chargeable or billing action, production DNS change, overwrite/deletion of existing production data, external communication, account change, secret disclosure, or new managed runtime/proxy/queue/cache final action without a narrowly scoped confirmation immediately beforehand.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-09-17

**Status upgrade:** approved → in-progress

- Created `.agents/tasks/CLI-005.md` as the active implementation record.
- The task record maps TC-01 through TC-05 one-for-one to scoped read operations, revision-guarded configuration, lifecycle actions, secret-safe GA guidance, and the required regression suite.
- Inspection of the implementation history found no plugin-lifecycle implementation commit preceding this task record.

### [GATE-VERIFY] — ✅ PASS | 2026-10-24

**Status upgrade:** in-progress → verifying

- Prerequisite GATE-WRITE, delegated GATE-APPROVAL and GATE-IMPLEMENT PASS records remain present. ARCH-007's later, explicit owner approval supersedes only the current domain spelling; the implementation uses `adapter`, `/adapters` and `--id` without compatibility aliases, while historical gate evidence remains unchanged.
- `.agents/tasks/CLI-005.md` contains completed `[x]` tasks for all five criteria, TC-01 through TC-05. No implementation or verification task is blocked or deferred. Separately authorized live configuration, consent and release actions are not prerequisites of this program-only CLI implementation and are not claimed here.
- Independent replay under Node 22.23.4: `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs scripts/harness/__tests__/google-analytics-adapter.test.mjs` exited 0: **3 test files, 33 tests passed**. The earlier verifier invocation named a nonexistent config and ran no tests; the command above uses the checked-in config and is the successful evidence.
- The replay includes real CLI subprocesses and an actual API-handler bridge: validate without an input file reads the selected installation, checks its site, adapter ID and positive observed revision, then sends its explicit public configuration and matching `If-Match`. Stale, malformed and denied reads issue no validation POST; missing mutation guards, revisions and canonical IDs, and unknown verbs make no request. Scoped lifecycle calls, token-echo redaction, denied-consent configuration and absence of implicit publication are asserted.
- Independent affected bundle build under Node 22.23.4: `node scripts/build.mjs` from `packages/claude-plugin` exited 0 and reported `[plugin-build] bin/publisher 55774 bytes; unchanged`. The coordinating task additionally records passing `pnpm build`, `pnpm build:admin`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (all packages plus **70 harness suites / 418 tests**) and `pnpm harness:scan` (**13 scans**); those workspace results are coordinated execution evidence, not an additional replay by this guard.
- `.agents/tasks/CLI-005.md` records agent-run Chrome checks with the **synthetic-owner** local fixture at **1440x1200** and **390x844**, observing the selected-site Adapter management surface; actual local authenticated HTTP requests returned 200 on the current Adapter lists and 404 on removed paths. This spec is `type: AGREEMENT`, so the SCREEN/FLOW/BEHAVIOR/API browser condition is not mandatory; nevertheless agent-run evidence is present, not delegated to the user or treated as manual-only authentication. No checked-in test-account file is claimed: the account is an isolated synthetic fixture.
- Documentation distinguishes prospective validation from persisted installation revision and keeps configuration, validation, enablement, visitor consent and release separate. No operated-instance identifiers, production mutation or production success evidence were added.

### [GATE-COMPLETE: TC-01] — ✅ PASS | 2026-10-24

- Verification action: ran `node node_modules/vitest/vitest.mjs run --config vitest.harness.config.ts scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs scripts/harness/__tests__/google-analytics-adapter.test.mjs` under Node 22.23.4; **3 files / 33 tests passed**. Actual subprocess calls for `adapter list` and `adapter get` returned site-qualified fixture state and only the expected scoped GET requests, using the authenticated client.
- Written tests: `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs`, describe `CLI-005 adapter lifecycle`, test `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`; `scripts/harness/__tests__/agent-operations-cli-contract.test.mjs`, describe `agent operations CLI contract`, test `covers every automation capability with a command that maps to one v2 operation (ARCH-006)`.

### [GATE-COMPLETE: TC-02] — ✅ PASS | 2026-10-24

- Verification action: the same successful **3 files / 33 tests** run executed actual configure subprocesses with a temporary JSON file. The observed PATCH contained only `{ configuration }` and `If-Match: "3"`; missing input, missing/nonpositive revision and missing mutation guard produced nonzero safe envelopes with **zero HTTP requests**.
- Written tests: `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs`, describe `CLI-005 adapter lifecycle`, test `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication` and parameterized `rejects %s before any request`.

### [GATE-COMPLETE: TC-03] — ✅ PASS | 2026-10-24

- Verification action: the same successful **3 files / 33 tests** run observed separate scoped POST actions `validate`, `enable` and `disable`, each carrying the supplied revision. The default validate flow bridged to actual GET/POST API handlers, captured the installed public configuration and matching revision, reported valid, and left the stored installation unchanged. Stale, malformed and denied reads stopped before POST; an unknown verb returned USAGE without any request.
- Written tests: `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs`, describe `CLI-005 adapter lifecycle`, tests `validates the installed configuration without an input file against the real API handlers`, `blocks validation after a %s read instead of issuing POST`, `does not POST validation when reading the installation fails`, `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication` and `rejects %s before any request`.

### [GATE-COMPLETE: TC-04] — ✅ PASS | 2026-10-24

- Verification action: the same successful **3 files / 33 tests** run asserted no sentinel bearer token in stdout/stderr, including a remote error echo, and only the explicitly requested lifecycle endpoints. The denied-consent GA fixture emitted no contributions or Google script/connect origins. Inspection of `docs/adapters.md` confirmed the public-safe denied-consent JSON example, separate configure/validate/enable/disable commands, observed revisions and explicit no-implicit-publication boundary.
- Written tests: `scripts/harness/__tests__/adapter-lifecycle-cli.test.mjs`, describe `CLI-005 adapter lifecycle`, tests `redacts a token echoed by a failing remote service` and `uses canonical IDs and separate scoped read/configuration/lifecycle requests without publication`; `scripts/harness/__tests__/google-analytics-adapter.test.mjs`, describe `Google Analytics static adapter contract`, tests `accepts only a GA4 ID and declared consent without credentials` and `keeps denied consent byte-inert and does not declare Google origins`.

### [GATE-COMPLETE: TC-05] — ✅ PASS | 2026-10-24

- Independent verification action under Node 22.23.4: `node node_modules/vitest/vitest.mjs run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/google-analytics-adapter.test.mjs` exited 0: **2 files / 14 tests passed**, matching the criterion's focused Vitest selection without a custom config. The additional configured lifecycle run passed **3 files / 33 tests**. `node scripts/build.mjs` from `packages/claude-plugin` exited 0 with the current bundle unchanged.
- Coordinated workspace evidence in `.agents/tasks/completed/CLI-005.md`: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm build:admin`, `pnpm test` and `pnpm harness:scan` passed under Node 22.23.4. The full test run passed every package and **70 harness suites / 418 tests**; the scan run passed **13 scans**. These are the root's observed workspace runs, not claimed as separate replays by this guard.
- Written regression references: the precise suite/test mappings in TC-01–TC-04 above and in every Test Plan row; `scripts/harness/__tests__/package-test-runner-contract.test.mjs`, describe `real package test entry points`, verifies nonempty package test execution and registered owned suites. No TC row silently omits a test reference.

### [GATE-COMPLETE] — ✅ PASS | 2026-10-24

**Status upgrade:** verifying → done

- Frontmatter is `status: verifying` and prior required gate PASS records remain present. All five Completion Criteria are checked; each now has its own exact verification/result and written-test evidence above. The existing Test Plan rows were aligned to actual files and test/describe names without changing the approved behavior.
- All five task items are complete in `.agents/tasks/completed/CLI-005.md`; the former active task path is absent and the spec's Tasks section references the archived path. There are no unresolved program-implementation tasks for this specification.
- Completion covers the provider-neutral authenticated Adapter lifecycle CLI and its current Desk Plugin bundle. It does not claim the separate local-first architecture cutover, production configuration, consent approval or public release. No operated publication identifiers or private production evidence were added.
