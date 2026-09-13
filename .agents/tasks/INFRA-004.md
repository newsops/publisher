# INFRA-004 — Native image runtime tracing

**Spec:** `.agents/spec-docs/active/INFRA-004-native-image-runtime-tracing.md`
**Status:** in-progress

## Gate Record

- 2026-09-13 — GATE-IMPLEMENT: PASS. This task record is linked by the spec
  and maps TC-01 through TC-04 one-to-one; the verified worktree history has no
  INFRA-004 implementation commit.

## Tasks

- [ ] TC-01 — Verify the admin production build and Linux artifact include the
      `sharp` binding and `libvips` payload.
- [x] TC-02 — Run the native-runtime tracing regression test and confirm it
      rejects an omitted Linux payload tracing path.
- [ ] TC-03 — Perform an authenticated archive-media upload against the new
      production admin deployment and record the HTTP result.
- [ ] TC-04 — Run `pnpm typecheck && pnpm test && pnpm harness:scan` and record
      the results.

## Progress

- 2026-09-13 — The deployment correction initially covered only the interactive
  media route. Runtime diagnosis established that archive restore imports the
  same image processor from `/api/v2/sites/[siteId]/content-restore`; both
  routes now explicitly include the direct `sharp` and Linux payloads. The
  dynamic route segments are escaped for picomatch. Physical pnpm workspace
  package paths are included alongside direct dependency paths so the runtime
  artifact does not depend on a symbolic-link layout. Linux runtime validation
  remains pending the resulting production deployment.
