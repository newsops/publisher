# ARCH-008: Local-first implementation

- **Status**: in-progress
- **Created**: 2026-10-24
- **Branch**: docs/local-first-architecture
- **Scope**: local management, encrypted synchronization, static delivery, intake and full surface parity

## Objective

Implement the approved local-first agreement with real behavior regression
tests. Prove the local durability, encryption, conditional writes and recovery
slice before replacing current product composition or operating live data.

## Plan

- [ ] TC-01: Shared core and complete independent UI/CLI capabilities, two-site isolation and authorization.
- [ ] TC-02: Real SQLite transactions, durable media/capture, restart safety and captured-versus-current revision tests.
- [ ] TC-03: Designated writer, OS-backed locking and interruption-safe verified credential handoff.
- [ ] TC-04: Exact-byte/idempotent encrypted remote commits, CAS history, dirty pull and unknown outcome reconciliation.
- [ ] TC-05: Maintained age encryption, independent signing, hostile-object and private-output tests.
- [ ] TC-06: Independent-key recovery, checkpoint replay defense, historical key access and non-restored sessions.
- [ ] TC-07: Loopback authentication, scoped principals, Host/Origin/CSRF denial, safe previews and secret redaction.
- [ ] TC-08: Cold-cache static reads without PC/private storage and 1,000-article fragment/shell invalidation tests.
- [ ] TC-09: Non-expiring publication reservation, inspectable host activation and actual canonical-origin observations.
- [ ] TC-10: Encrypted comment receipts, durable bounded admission and outstanding capacity across windows.
- [ ] TC-11: Current-policy moderation/rollback, CSP/dependency propagation, no draft leakage and required-intake gates.
- [ ] TC-12: Isolated complete import/cutover rehearsal, old-path removal, real package tests and workspace verification.

## Progress

### 2026-10-24

- The owner instructed all remaining issues to be handled after reviewing the
  proposed architecture and test obligations. GATE-APPROVAL passed.
- Existing code/test seams and runtime/dependency constraints were inspected.
  Proof slice implementation starts only after GATE-IMPLEMENT.
- GATE-IMPLEMENT passed before source work. Added the registered operator
  package, real per-site SQLite authority, narrow public facade and internal
  consistent-backup/sync ports. Editorial mutations reuse content validators.
- Added real age recipient encryption, separate Ed25519/JCS authentication,
  durable exact-byte spool, immutable source history, provider-neutral byte
  CAS adapter and confirmed per-namespace checkpoint reconciliation.
- Independent review found and reproduced orphan-spool adoption, unrelated
  baseline overwrite and stale-prepared ABA retransmission defects. Regression
  tests failed before fixes and now pass. Parent-directory fsync, private DB
  permissions/symlink rejection, shared error class and facade isolation were
  also checked. Final read-only re-review found no additional MUST in this slice.
- Node 22.23.4: operator typecheck and nine local-first suites / 53 tests passed.
  Actual AWS SDK calls ran against a local HTTP S3 fixture, not a live provider.
  SQLite/filesystem execution evidence is macOS-only; Windows fails explicitly
  until ACL/locking support is verified. Authenticated history is bounded to
  256 nodes with an explicit HISTORY_LIMIT result, not hidden endless retries.
- Fixed caller-CWD-dependent admin framework roots. Actual Next config loader
  tests failed from both invocation directories before the change, then passed.
  Admin production build passed. Browser fixture diagnostics also exposed
  development-bundler responsiveness problems. The local command now explicitly
  uses the webpack builder verified in the actual sign-in/editor flow and binds
  loopback, rather than silently falling back. Production Turbopack build and
  local webpack development remain separately tested paths.

- The owner's explicit open-version/save-that-version rule is documented.
  Workspace reads now return content plus revision from one SQLite row read;
  real two-handle tests reject a stale save and retain its draft. A later status
  call cannot silently supply a newer editing token.
- Additional boundary regressions first failed for malformed URL errors and
  credential-bearing canonical identities, then passed after rejecting both
  before file creation. Current operator package: eleven suites / 57 tests.
- The first draft-PR CI run exposed two additional verification-environment
  failures: ANSI-colored test summaries broke a plain-text assertion, and the
  existing MinIO fixture image manifests denied anonymous pulls before the
  clean-room application ran. Summary parsing now removes terminal controls
  without weakening exit-status or real-test assertions. The fixture repair
  retains the exact official releases and verifies pinned artifact checksums;
  current remote results are tracked separately in draft PR #2.
- The repaired fixture passed six offline contract tests and independent source
  review. All four complete official binary downloads matched their pinned
  SHA-256 values. Both native arm64 and emulated amd64 images built; real Docker
  negative builds rejected an unsupported architecture and a tampered checksum.
  Full local clean-room execution stopped before the smoke script because the
  existing Docker VM ran out of disk during PostgreSQL initialization. No
  global cleanup, resizing or storage-threshold bypass was performed. Only the
  fresh verification project's containers/network/volumes and uniquely owned
  image tags were removed; shared caches and unrelated resources were retained.
- Updated full local `pnpm test`: all packages plus 72 suites / 426 tests pass.
  This is not a passing local Docker smoke or completed migration rehearsal.

## Remaining implementation boundaries

- Complete UI and direct-core CLI callers, site/account/authorization parity.
  Current browser selection checks a role rather than persisted site membership;
  restoring ACL rows does not establish assigned-site access enforcement.
- OS key custody, offline-root enrollment/revocation, secure handoff and full
  independently keyed fresh-PC recovery, including long-history checkpoints.
- Immutable private media closure (capture currently rejects media references).
- Encrypted online inbox, durable admission/retention, import and moderation.
- Source-reserved publication, inspectable host activation and observed delivery.
- Current-policy rollback, complete migration rehearsal and removal of replaced
  PostgreSQL/hosted management paths. No production cutover has taken place.
- Replace/extract remaining oversized CLI/client/admin-action/renderer/
  validation modules during caller migration. Their size violations are not
  waived by this proof-slice review or unrelated feature completion.

## Decisions

- Preserve the independent static build and current release until controlled
  cutover evidence exists. No automatic legacy/dual-write production mode.
- Use maintained standard encryption libraries; never label custom AES as age.
- Run supported Node 22 evidence rather than relying on the host's Node 24.
- Production resource, DNS, secret-transfer and destructive cutover authority
  remains separate from code implementation approval.

## Blockers

No blocker to local implementation. Real provider and operated-instance claims
require isolated/live evidence and any execution-time approval.

## Result

In progress. No completion, deployment or production migration claim.
