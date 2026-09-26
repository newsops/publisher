# INFRA-004 — Native image runtime tracing

**Spec:** `.agents/spec-docs/active/INFRA-004-native-image-runtime-tracing.md`
**Status:** completed

## Gate Record

- 2026-09-13 — GATE-IMPLEMENT: PASS. This task record is linked by the spec
  and maps TC-01 through TC-04 one-to-one; the verified worktree history has no
  INFRA-004 implementation commit.

## Tasks

- [x] TC-01 — Verify the admin production build and Linux artifact include the
      `sharp` binding and `libvips` payload.
- [x] TC-02 — Run the native-runtime tracing regression test and confirm it
      rejects an omitted Linux payload tracing path.
- [x] TC-03 — Perform an authenticated archive-media upload against the new
      production admin deployment and record the HTTP result.
- [x] TC-04 — Run `pnpm typecheck && pnpm test && pnpm harness:scan` and record
      the results.

## Progress

- 2026-09-13 — The deployment correction initially covered only the interactive
  media route. Runtime diagnosis established that archive restore imports the
  same image processor from `/api/v2/sites/[siteId]/content-restore`; both
  routes now explicitly include the direct `sharp` and Linux payloads. The
  dynamic route segments are escaped for picomatch. Physical pnpm workspace
  package paths are included alongside direct dependency paths so the runtime
  artifact does not depend on a symbolic-link layout.
- 2026-09-13 — The Vercel production deployment accepted the archive's 17
  image uploads, generated and approved their variants, and the subsequent
  restore API returned HTTP 202. This is Linux runtime evidence that both the
  `sharp` binding and `libvips` payload are available in the deployed function.
- 2026-09-13 — `pnpm typecheck`, `pnpm test` (167 tests), and
  `pnpm harness:scan` passed after the tracing correction.

## Result

Vercel's Linux runtime now includes the native image binding and `libvips`
payload for both archive restore and interactive media processing routes.
