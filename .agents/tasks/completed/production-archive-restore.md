# Production Archive Restore

- **Status**: completed
- **Created**: 2026-09-13
- **Branch**: main
- **Scope**: production operations

## Objective

Restore the owner-provided historical publication archive to the production
PostgreSQL, object storage, and static public site using the documented agent
CLI/API path. Verify the released site and preserve a recovery point.

## Plan

- [x] Record a provider recovery point and validate deployed application code.
- [x] Validate and retain a private operational archive outside the public repository.
- [x] Apply the archive-operation schema, restore data and media through the API, and publish a snapshot.
- [x] Deploy the generated static publication and verify the public, admin, and comment surfaces.

## Progress

### 2026-09-13

- Production restoration and public release were explicitly approved by the owner.
- Started an on-provider Neon snapshot before any production mutation.
- Restored 8 posts and 17 approved media records through the authenticated
  archive-restore API; the archive remains in a private operator workspace.
- Published an immutable snapshot, materialized a 63-file static candidate,
  deployed it to the production Pages branch, and observed HTTP 200 on the
  custom domain and an article route with its comment runtime.

## Decisions

- The historical archive stays outside the public repository and is restored only via the CLI/API contract.

## Blockers

- None.

## Result

The production public release is live. The original private archive was not
committed to the repository; only numeric restoration evidence is retained.
