# Honest R2 included-usage billing attestation

- **Status**: completed
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: deployment preflight, contract tests, operator documentation

## Objective

Replace the fictitious R2 hard-$0 requirement with a truthful, fail-closed
included-usage billing attestation without adding a paid runtime dependency.

## Plan

- [x] TC-01: Accept a complete acknowledged R2 included-usage attestation.
- [x] TC-02: Reject malformed, stale, false, or unacknowledged included-usage evidence.
- [x] TC-03: Preserve hard-zero and chargeable-record rejection coverage.
- [x] TC-04: Document R2 cost boundaries and required evidence without secrets.
- [x] TC-05: Run typecheck, tests, and repository scans.

## Progress

### 2026-09-13

- Received explicit user approval and started implementation.
- Added the fail-closed included-usage contract, R2 documentation, and
  regression tests. Full verification passed; exact evidence is in the spec.

## Decisions

- Keep S3 compatibility as the application contract; R2 is only an operator
  adapter with included usage and potential usage-based overage.

## Blockers

- None.

## Result

- Implemented and verified truthful included-usage preflight evidence for R2
  without adding a paid runtime or provider-specific application dependency.
