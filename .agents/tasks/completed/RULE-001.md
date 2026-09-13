# RULE-001 — Archive SEO metadata normalization

**Spec:** `.agents/spec-docs/active/RULE-001-archive-seo-metadata-normalization.md`
**Status:** completed

## Gate Record

- 2026-09-13 — GATE-WRITE and GATE-APPROVAL passed. The completed
  architecture review uses delegated authority and keeps normal editorial SEO
  validation strict.

## Tasks

- [x] TC-01 — Add archive-only bounded SEO-title projection and generic
      regression coverage for source immutability and persisted metadata.
- [x] TC-02 — Verify normal editor/API post validation still rejects an
      over-limit non-empty SEO title.
- [x] TC-03 — Restore the approved private archive through the authenticated
      CLI/API and record only operation and numeric outcomes.
- [x] TC-04 — Run repository typecheck, tests, and harness scans.

## Progress

- 2026-09-13 — Production diagnostic confirmed that historical long SEO
  metadata is the sole blocker after all archive media became approved; no
  editorial state replacement occurred.
- 2026-09-13 — Added archive-only title normalization and generic regression
  coverage. Focused content and portable persistence tests pass; production
  CLI/API verification remains pending the Git deployment.
- 2026-09-13 — Production API restore accepted once with the pre-approved
  archive and existing approved media bindings. The published static release
  was deployed to the production Pages branch and verified by HTTP status and
  article-runtime checks; only numeric restore counts are retained outside the
  private archive workspace.

## Result

Archive-only SEO metadata normalization preserves the private archive and
normal human/API validation boundary, while allowing the operational restore to
complete and publish through the supported authenticated API path.
