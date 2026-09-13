# INFRA-004 — Native image runtime tracing

**Spec:** `.agents/spec-docs/todo/INFRA-004-native-image-runtime-tracing.md`
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

- 2026-09-13 — Corrected monorepo-relative native runtime tracing; focused
  regression test and the admin production build pass locally. The first Linux
  deployment still missed `libvips`; corrected the includes to the documented
  direct dependency paths. Linux runtime validation remains pending the next
  production deployment.
