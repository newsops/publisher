---
status: in-progress
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

Implement the following provider-neutral commands over
`@publisher/admin-client`:

```text
publisher plugin list --site <site-id> --json
publisher plugin get --site <site-id> --id <plugin-id> --json
publisher plugin configure --site <site-id> --id <plugin-id> --input <json-file> --revision <n> --non-interactive --json
publisher plugin validate --site <site-id> --id <plugin-id> --revision <n> --non-interactive --json
publisher plugin enable --site <site-id> --id <plugin-id> --revision <n> --non-interactive --json
publisher plugin disable --site <site-id> --id <plugin-id> --revision <n> --non-interactive --json
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
- `docs/plugins.md`

## Completion Criteria

- [ ] TC-01: `plugin list --site a --json` and `plugin get --site a --id google.analytics --json` issue only authenticated `GET /api/v2/sites/a/plugins` and `GET /api/v2/sites/a/plugins/google.analytics` requests and return their site-qualified API state.
- [ ] TC-02: `plugin configure --site a --id google.analytics --input <file> --revision 3 --non-interactive --json` sends only the parsed public-safe file payload with `If-Match: 3`; a missing input, revision, or `--non-interactive` returns a nonzero envelope before any mutation request.
- [ ] TC-03: `plugin validate|enable|disable` with a positive observed revision issue the respective explicit action through the scoped Admin API; unknown verbs return `USAGE` without a request.
- [ ] TC-04: CLI plugin results and error envelopes never contain `PUBLISHER_API_TOKEN`, and the documented GA4 example configures each site with consent denied without an implicit enable or publish.
- [ ] TC-05: `pnpm exec vitest run scripts/harness/__tests__/agent-operations-cli-contract.test.mjs scripts/harness/__tests__/google-analytics-plugin.test.mjs`, `pnpm typecheck`, `pnpm test`, and `pnpm harness:scan` complete successfully.

## Test Plan

| TC-ID | Test Type   | Tool / Approach                                                       | Notes                                                                                                                                                 |
| ----- | ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | integration | Vitest local HTTP fixture in `agent-operations-cli-contract.test.mjs` | Fixture asserts exact methods, site-qualified paths, bearer header, and returned safe response state for a representative reviewed adapter.           |
| TC-02 | integration | Vitest local HTTP fixture plus temporary JSON input                   | Fixture asserts `If-Match`, parsed public JSON payload, and zero mutation requests for each local CLI precondition failure.                           |
| TC-03 | integration | Vitest local HTTP fixture                                             | Fixture asserts action bodies and revision handling for validate, enable, disable, and rejects an unsupported action without contacting the fixture.  |
| TC-04 | contract    | CLI fixture and `google-analytics-plugin.test.mjs`                    | Uses a sentinel token and denied GA configuration to prove redaction, no implicit lifecycle transition, and static GA safety.                         |
| TC-05 | regression  | pnpm Vitest, typecheck, test, harness scan                            | Credential-free repository checks; live production configuration is separately observed only after an authorized CLI device/API-token session exists. |

## Tasks

- [ ] `.agents/tasks/CLI-005.md` — active implementation record

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
