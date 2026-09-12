# Managed static-host activation evidence

- **Status**: completed
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: deployment preflight, contract tests, operator documentation

## Objective

Accept a managed static host only with portable, recent evidence of candidate
verification, activation, and rollback, while retaining the filesystem adapter.

## Plan

- [x] TC-01: Accept complete managed-host activation evidence.
- [x] TC-02: Reject unsupported, absent, stale, malformed, or mismatched evidence.
- [x] TC-03: Preserve filesystem adapter behavior.
- [x] TC-04: Document the portable evidence contract and Pages mapping.
- [x] TC-05: Run typecheck, tests, and repository scans.

## Progress

### 2026-09-13

- Owner approved INFRA-003; implementation gate pending.
- Implemented portable `managed-static-host` evidence validation, regression
  coverage, and deployment handoff documentation.

## Decisions

- Managed static hosts supply observed operational evidence; product code does
  not import a host SDK or retain host credentials.

## Blockers

- None.

## Result

- Managed static hosts now pass production preflight only with fresh observed
  candidate, activation, and rollback evidence. Filesystem deployments retain
  their absolute-root guard; no provider SDK or credential was introduced.
