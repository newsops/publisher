---
status: in-progress
type: INFRA
tags: [cli, async]
authority: delegated
---

# INFRA-008: Isolated clean-room fixture ports

## Problem

The pull-request clean-room job fails before its database and object-storage
tests start when another listener owns host port 55432. Docker reports that it
cannot bind `0.0.0.0:55432` because the address is already in use. The fixture
artifact downloads and checksum checks have succeeded; retrying downloads or
changing application recovery code does not address this failure.

`infra/local/compose.yml` also fixes the object-storage API and console host
ports to 59000 and 59001. The workflow repeats the database and API ports in its
consumer URLs. Changing only one binding would leave either another collision
or consumers pointing at the wrong service. A shared host listener must not be
stopped to make this disposable verification job pass.

## Architecture Review

### Affected Scope

Layer identifiers refer to `scripts/harness/layer-map.json`.

- **L5 fixture composition — `infra/local/compose.yml`:** parameterize the three
  published host ports, retaining local defaults and the existing PostgreSQL,
  MinIO server and MinIO initializer services. Bind published ports to loopback.
  This infrastructure file composes existing test adapters; it introduces no
  production layer or package import.
- **L5 verification orchestration — `.github/workflows/verify.yml`:** request
  Docker-assigned ports in the existing clean-room job, validate the actual
  mappings and pass derived endpoints to every existing regression and smoke
  consumer. Keep initialization on Compose service DNS and cleanup scoped to
  the job's Compose project.
- **L5 harness —
  `scripts/harness/__tests__/clean-room-fixture-contract.test.mjs`:** retain
  artifact provenance assertions; add deterministic configuration and executed
  workflow-shell regressions for endpoint discovery and failure handling.
- **L5 documentation and work records — `infra/local/README.md`,
  `docs/deployment.md`, `.agents/tasks/operating-installation-migration.md`
  and `.agents/tasks/INFRA-008.md`:** document default versus isolated fixture
  ports, endpoint discovery, evidence boundaries and the bounded CI repair.

Sibling scan: the fixed host-port consumers are the Compose file, the
clean-room workflow, the local deployment example and the fixture contract
test. `object-storage-init` uses `http://object-storage:9000` inside the Compose
network and must remain unchanged. `scripts/admin/clean-room.mts` consumes
environment URLs without assuming host ports. Dockerfile provenance, image
versions, database initialization and application contracts do not change.
There is no new HTTP route, API method, CLI command or public identifier to
register in `surface-map.json`, and no existing application surface is hidden.

### Alternatives Considered

1. **Keep fixed ports, retry or stop the conflicting listener.** Pro: minimal
   configuration changes. Con: retries cannot remove a persistent conflict;
   stopping an unrelated listener is unsafe and outside this fixture's
   authority. Three fixed bindings remain collision points.
2. **Scan for free ports before starting Compose.** Pro: permits endpoint
   construction before startup. Con: another process can claim a scanned port
   between the scan and Docker's bind, so the failure remains nondeterministic
   and a port-reservation mechanism would add unnecessary machinery.
3. **Ask Docker to allocate loopback host ports and read the actual mappings.**
   Pro: allocation and binding are owned by Docker, avoiding the scan-to-bind
   race while preserving the same services. Con: CI must discover and validate
   mappings after startup instead of hard-coding URLs.

### Decision

Choose Docker-assigned loopback host ports for CI. Keep convenient explicit
local defaults through Compose environment interpolation. Use a small shell
step in the existing workflow to query and validate actual mappings before
writing consumer URLs to `GITHUB_ENV`; do not add an application abstraction,
new helper framework, service or provider.

This is a delegated verification-infrastructure repair. It does not change
product direction, production data, DNS, hosting roles, billing or deployment.
It neither authorizes stopping host processes nor proves production migration.

### Architecture Review Checklist

- [x] Affected packages, layers and files are enumerated.
- [x] Sibling consumers and public-identifier collisions are checked.
- [x] At least two alternatives have explicit benefits and costs.
- [x] The selected design and its trade-off are recorded.

## Solution

1. Parameterize the PostgreSQL, object API and object console published ports
   using `PUBLISHER_FIXTURE_POSTGRES_PORT`,
   `PUBLISHER_FIXTURE_OBJECT_PORT` and
   `PUBLISHER_FIXTURE_CONSOLE_PORT`. Defaults remain 55432, 59000 and 59001.
   Bind each mapping to `127.0.0.1`; internal ports remain 5432, 9000 and 9001.
2. Set all three host-port variables to `0` for the clean-room CI job. Use one
   job-level `COMPOSE_PROJECT_NAME`, unique to the workflow run, attempt and
   job, consistently for startup, initialization, discovery and cleanup. Start
   the same services with the existing readiness requirement. Do not scan for
   available ports or alter unrelated listeners or containers.
3. After startup, query `docker compose ... port postgres 5432`,
   `docker compose ... port object-storage 9000` and
   `docker compose ... port object-storage 9001`. Require each command to
   succeed and return exactly one `127.0.0.1:<port>` mapping, with a decimal
   port from 1 through 65535. Reject empty, multiline, wildcard-host,
   malformed, zero or out-of-range output. Validate all required mappings
   before exporting any consumer URLs.
4. Build all existing fixture-only PostgreSQL URLs from the discovered
   database mapping, preserving database names, users and credentials. Derive
   `OBJECT_STORAGE_ENDPOINT` from the discovered API mapping. Export these
   values to `GITHUB_ENV` for the independent-connection regressions and
   clean-room smoke; remove their hard-coded workflow endpoint overrides.
   The console mapping is validated for complete fixture isolation but is not
   an application endpoint. Never evaluate discovery output as shell code.
5. Keep MinIO initialization on service DNS, the tested S3 API subset, image
   provenance checks and scoped `always()` cleanup unchanged. Document how
   local operators opt into port `0` and discover their mappings.
6. Extend the existing fixture contract test to run the actual endpoint
   discovery shell extracted from the workflow against a controlled fake
   Docker executable. Verify derived URLs and fail-closed output without
   requiring local Docker services. Exercise defaults already occupied by
   task-owned loopback listeners, or leave pre-existing listeners untouched.
   Separately require successful real-service CI startup and smoke evidence.

Non-goals: application APIs, schemas, recovery semantics, product cutover,
production actions, fixture image updates, a new port allocator, or claiming
that source and fake-Docker tests prove real database/S3 integration.

## Affected Files

- `infra/local/compose.yml`
- `.github/workflows/verify.yml`
- `scripts/harness/__tests__/clean-room-fixture-contract.test.mjs`
- `infra/local/README.md`
- `docs/deployment.md`
- `.agents/tasks/operating-installation-migration.md`
- `.agents/tasks/INFRA-008.md` after approval
- This specification and its gate evidence

## Completion Criteria

- [ ] TC-01: Fixture contract tests and `docker compose ... config` show
      loopback-only mappings with local defaults 55432/59000/59001 and CI
      overrides `0` for all three published ports; service names, internal
      ports and initialization contracts remain unchanged. All lifecycle
      commands use the same run/attempt/job-specific Compose project.
- [ ] TC-02: Executing the workflow's actual discovery shell with valid mocked
      mappings exports every regression and smoke URL using those mappings.
      A failed lookup or empty, multiline, non-loopback, malformed, zero or
      out-of-range mapping exits nonzero before exporting consumer endpoints.
- [ ] TC-03: Fixture regressions run while default host ports are occupied,
      confirm CI requests no fixed default binding and preserve the existing
      listeners; no free-port scan or unrelated process/container stop is used.
- [ ] TC-04: `pnpm build`, `pnpm typecheck`, `pnpm test` and
      `pnpm harness:scan` exit 0, and the actual clean-room CI job starts the
      isolated services, passes independent-connection regressions and
      `pnpm clean-room:smoke`, then performs project-scoped cleanup. Local
      source checks are not reported as local full-service smoke evidence.

## Test Plan

| TC-ID | Test Type                               | Tool / Approach                                                                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-01 | Configuration contract                  | `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/clean-room-fixture-contract.test.mjs`; `docker compose -f infra/local/compose.yml config` with default and zero-port environments | Preconditions: the existing fixture source and Docker Compose configuration parser are available; configuration rendering starts no services. Assert all three default and override bindings, loopback hosts, unchanged internal ports and service-DNS initialization.                                                            |
| TC-02 | Executed shell contract                 | The same Vitest file extracts and executes the workflow discovery shell with a fake Docker command and temporary `GITHUB_ENV`                                                                                       | Preconditions: fresh temporary paths and controlled mapping outputs, not production credentials. Assert every database/API consumer shares the discovered endpoints; malformed or failed discovery returns nonzero without partial endpoint exports or shell evaluation.                                                          |
| TC-03 | Collision regression                    | The same Vitest file reserves available default ports with task-owned loopback listeners and executes the real workflow shell against fake mappings                                                                 | Preconditions: task-owned listeners occupy available defaults; any pre-existing owner remains untouched. Assert zero-port CI configuration and listener continuity. This deterministic boundary proof is separate from the real-service CI acceptance in TC-04.                                                                   |
| TC-04 | Repository and real-service integration | Pinned-pnpm repository gates and the GitHub Actions clean-room job                                                                                                                                                  | Preconditions: disposable fixture credentials only, successful official artifact downloads and a Docker-capable CI runner. Read the actual job results for service startup, SQL concurrency/recovery tests, S3/database smoke and scoped cleanup; a local Docker disk limit is not reported as a passed local full-service smoke. |

## Tasks

- [ ] `.agents/tasks/INFRA-008.md` — implementation and verification record.

## Evidence Log

### [GATE-WRITE] — ✅ PASS | 2026-10-24

**Status upgrade:** draft → review-ready

- Frontmatter begins with a YAML block and declares `status: draft`, allowed
  `type: INFRA`, `tags: [cli, async]` and `authority: delegated`.
- Problem identifies the clean-room job's bind failure on
  `0.0.0.0:55432` when an existing listener occupies the port, and explains
  the two sibling fixed bindings and repeated consumer endpoints.
- Architecture Review marks all four checklist items complete, enumerates
  affected paths with L5 scope, records the sibling scan, compares three
  alternatives with benefits and costs, and connects the Docker-allocation
  decision to the scan-to-bind race and endpoint-discovery trade-off.
- Source inspection confirms the sibling scan: Compose fixes the three
  published ports; the workflow and local deployment example repeat fixture
  endpoints; the existing contract test asserts those bindings; the smoke
  script receives its database and object-storage endpoints from environment
  variables. The proposed change adds no application surface or service.
- Completion Criteria contains exactly four concrete identifiers,
  `TC-01` through `TC-04`, covering configuration, executed discovery failure
  handling, occupied-default-port isolation and repository/real-service CI
  acceptance. Each states a command result or observable behavior.
- Test Plan contains exactly four matching rows, one per TC identifier. Every
  row supplies a test type, tool/approach and nonempty notes with preconditions
  and assertions; no row relies on an unexplained manual-only check.
- Tasks contains the post-approval task-record placeholder. Evidence Log was
  empty before this first GATE-WRITE entry. This review used only program
  source and placeholder fixture contracts; no operated-instance identity or
  production evidence was added.

### [GATE-APPROVAL] — ✅ PASS | 2026-10-24

**Status upgrade:** review-ready → approved

- `authority: delegated` and `.agents/rules/authority-delegation.md` provide
  standing authority for this ordinary CI fixture repair; a second item-by-item
  owner confirmation is not required.
- The completed Architecture Review records affected scope, the sibling scan,
  three alternatives, the selected trade-off and the four-row verification
  plan. It preserves the existing services and application contracts and
  selects no new product direction, architecture boundary, cost model or
  provider role.
- The preceding GATE-WRITE PASS is present. Architecture Review and the
  `type`, `tags` and `authority` fields are unchanged since that review; the
  orchestrator changed only the lifecycle path and status to `review-ready`.
- `git status --short` shows only this untracked specification and no
  implementation edits before approval; no gate bypass was observed.
- Execution-time exceptions remain in force: this approval does not authorize
  billing or chargeable resources, production DNS, production data deletion
  or overwrite, external communications, account creation or closure, secret
  disclosure, or a new external runtime, proxy, queue, cache or managed
  service. Such actions require their own narrowly scoped confirmation.

### [GATE-IMPLEMENT] — ✅ PASS | 2026-10-24

**Status upgrade:** approved → in-progress

- Frontmatter is `status: approved`; the preceding GATE-WRITE and
  GATE-APPROVAL PASS entries are present.
- `.agents/tasks/INFRA-008.md` exists and is linked from this specification's
  Tasks section. It records the objective, branch, specification, plan and
  current evidence.
- The task plan contains one unchecked implementation/verification task for
  each completion criterion: TC-01 covers default/internal contracts and CI
  isolation; TC-02 covers executed discovery and failure handling; TC-03
  covers occupied listeners; TC-04 covers repository gates and actual SQL/S3
  CI smoke with scoped cleanup.
- `git status --short` shows only the specification and its task record; no
  implementation change preceded task creation.
