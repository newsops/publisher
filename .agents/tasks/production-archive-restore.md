# Production Archive Restore

- **Status**: in-progress
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: production operations

## Objective

Restore the owner-provided historical publication archive to the production
PostgreSQL, object storage, and static public site using the documented agent
CLI/API path. Verify the released site and preserve a recovery point.

## Plan

- [x] Record a provider recovery point and validate deployed application code.
- [ ] Validate and retain a private operational archive outside the public repository.
- [ ] Apply the archive-operation schema, restore data and media through the API, and publish a snapshot.
- [ ] Deploy the generated static publication and verify the public, admin, and comment surfaces.

## Progress

### 2026-09-13

- Production restoration and public release were explicitly approved by the owner.
- Started an on-provider Neon snapshot before any production mutation.

## Decisions

- The historical archive stays outside the public repository and is restored only via the CLI/API contract.

## Blockers

- None.

## Result

(Pending.)
