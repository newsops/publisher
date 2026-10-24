# INFRA-008: Isolated clean-room ports

- **Status**: in-progress
- **Created**: 2026-10-24
- **Branch**: fix/operating-installation-migration-safety
- **Spec**: ../spec-docs/active/INFRA-008-isolated-clean-room-ports.md

## Objective

Remove fixed-port collisions from the existing disposable CI fixture without
changing application services or stopping unrelated listeners.

## Plan

- [x] TC-01: Preserve local defaults and internal contracts; isolate CI ports and Compose project.
- [x] TC-02: Execute actual discovery shell and verify all endpoints and fail-closed lookup handling.
- [x] TC-03: Keep occupied default listeners alive during deterministic collision regression.
- [ ] TC-04: Pass repository gates and actual CI SQL/S3 smoke with scoped cleanup.

## Evidence

The first integration run failed before tests when Docker could not bind host
port 55432. Artifact downloads and checksums passed. No unrelated process was
stopped. Local source tests cannot establish real-service integration.

### Executed regression and review

- Node 22.23.4, pinned pnpm 9.0.0. The actual discovery-shell case failed
  before implementation because the workflow had no discovery step. Final
  fixture suite passes 41 tests, including all service lookup failures,
  malformed/multiline/unsafe outputs, occupied-default listeners, no partial
  exports, no command evaluation, and valid port boundaries 1 and 65535.
- Both default and zero-port `docker compose ... config --format json` runs
  exit 0. All three bindings are loopback-only with unchanged internal ports.
- Independent infrastructure review reports no remaining source findings and
  independently reruns all 41 tests and both configuration renders.
- Root primary-document review found `github.job` is not available outside
  execution steps. A second RED assertion then replaced that expression with
  the actual literal job ID in the job-level project name; run and attempt
  remain interpolated. Final 41 tests and formatting pass again.
- No Docker services were started for this port repair on the local machine,
  no unrelated listener was stopped, and no full local SQL/S3 smoke is claimed.
  Repository gates and real-service CI acceptance remain pending.

## Result

In progress; no production configuration or data changes are included.
