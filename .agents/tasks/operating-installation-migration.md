# Operating-installation migration safety audit

- **Status**: in-progress
- **Created**: 2026-10-24
- **Branch**: fix/operating-installation-migration-safety
- **Scope**: recovery, archive import, static publication, migration readiness and neutral operator guidance

## Objective

Audit the merged program against existing multi-publication operation, repair
reproduced preservation/publication defects and make incomplete local-first
cutover explicit. Keep operated identities, data and evidence outside the repo.

## Plan

- [x] Ground: compare persistence/archive and publication/caller contracts independently.
- [x] Sketch: compare two structurally distinct continuity designs against preservation, security and small-interface criteria.
- [x] Agree: synthesize the design and advance its delegated implementation gates.
- [x] Implement: repair the approved bounded scope with failing-before regressions.
- [x] Verify: real SQL, generated artifacts, strict-header browser checks and whole-workspace gates.
- [ ] Deliver: commit all work, pass CI and integrate the verified update; retain uncompleted cutover criteria.

## Grounding

- Current admin/CLI still use PostgreSQL/hosted API. The operator package is a
  partial local SQLite/private-sync core, not a working replacement installation.
- Logical admin backup lists initial tables only, omitting later site registry,
  account/ACL, guidance and restore-operation data. Table reads do not share a
  repeatable-read capture. Complete backup/restore needs explicit session policy.
- EditorialArchive is a narrow content interchange format, not a private full
  installation backup. It deliberately omits private guidance/personas and also
  loses revisions, review records, taxonomy distinctions and multilingual state.
  API normalization defaults posts to published; restore then rejects their
  missing desk approval. Do not fabricate editorial approvals to bypass this.
- Breaking Adapter migration changes current tables/JSON but does not rewrite
  historical immutable snapshots or drain pending old-contract publication jobs.
  Version-aligned runtime replacement needs an explicit writer/queue boundary.
- Generated HTML lacks adapter/comment-runtime dependencies, feeds omit rendered
  body dependencies and lead indexes omit rendered author dependencies. Actual
  incremental fixtures reuse stale HTML/feed/byline outputs after those changes.
- Dynamic consent styles conflict with strict style-src self. Generated CSP also
  omits configured comment/verification origins. Header-enforced browser proof
  is required; a DOM stub or unprotected preview cannot establish this behavior.
- CLI doctor/status do not establish semantic API/site readiness. The capability
  registry still contains UI-only accounts/moderation and CLI-only recovery.
  Full local UI/CLI/media/intake/auth/publication parity remains ARCH-008 work.

## Decisions

- No live data overwrite, production DNS change, service cancellation, credential
  transfer, new provider/runtime layer or automatic cutover from this audit.
- Fix current operation safety without shipping a compatibility/dual-write mode.
- Use generic two-site fixtures. Public program records never identify an
  operated publication or retain its content, endpoints or screenshots.
- Current provider choices are not reopened; current official billing facts are
  rechecked only if a separately authorized deployment needs them.
- Independent comparison selected installation-level recovery as the smallest
  existing boundary and grafted per-site semantic preservation assertions.
  A proposed migration diagnostic API/panel/ledger is not included: without
  complete observation and target capability it would add a second framework
  while proving less than an isolated restore and explicit blocked checklist.
- INFRA-007 will repair current recovery, narrow draft interchange and generated
  publication behavior. It does not complete ARCH-008 or replace live authority.
- Read-only public baseline: verified on an operated instance; evidence kept
  privately by the operator. Real browser dimensions must be measured after
  applying a viewport, not inferred from a successful override call.
- Public home and article baseline was observed in desktop and measured
  390x844 Chrome views. Existing content/images remained available. An empty
  comment section without a submission form is not accepted as working intake.
  No reader comments or production settings were submitted or changed.

## Blockers

No blocker to program inspection and isolated implementation. Production
cutover requires complete readiness and narrowly scoped execution authority.

## Delivery

- [x] Independent completed-area reviews; all reported code findings resolved.
- [ ] Commit all intended changes and push without bypassing hooks.
- [ ] Create and attach PR; all required CI checks pass before integration.
- [ ] Integrate verified program update and recheck exact main status.
- [ ] Stop only owned loopback fixtures and disposable verification containers.

The implementation/gate evidence is in `completed/INFRA-007.md`. Remaining local product
and site-membership authorization gaps stay explicit in ARCH-008 and the
continuity runbook, not unchecked tasks hidden inside completed repair scope.

## Result

In progress; neither migration nor deployment is claimed.
