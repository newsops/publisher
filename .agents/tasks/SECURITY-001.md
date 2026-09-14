# Additive Automation Keyrings

- **Status**: in-progress
- **Created**: 2026-09-15
- **Branch**: feat/infra-005-complete-multisite-management
- **Scope**: apps/admin, docs, automation contract tests

## Objective

Preserve production automation access while allowing an independently scoped
keyring to be added for a publication's CLI/API agent.

## Plan

- [x] TC-01: Merge valid primary and additional scoped keyrings without leaks.
- [x] TC-02: Fail closed for missing, malformed, invalid, or duplicate keyrings.
- [x] TC-03: Document rotation and run focused regression checks.

## Progress

### 2026-09-15

- GATE-WRITE and delegated GATE-APPROVAL passed; implementation record created.
- Added the additive keyring parser, documentation, and focused regression
  coverage; admin typecheck, harness scan, and workspace lint passed.

## Decisions

- Add an optional validated keyring rather than replacing an encrypted primary
  secret that the provider cannot reveal.

## Blockers

- Production verification and deployment remain pending.

## Result

Pending implementation.
