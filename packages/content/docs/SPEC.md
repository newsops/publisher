# Content package specification

## Scope

The content package owns portable publication types, validation, static build inputs, and the public snapshot contract. It has no database, HTTP, authentication, or deployment-provider dependency.

## Boundaries

The package does not persist private credentials, authorize administrators, execute adapters, add public routes, fetch remote configuration, or deliver a release. The admin application owns storage and authorization; the static site owns rendering; deployment owns artifact delivery.

## Architecture overview

Typed editorial entities are validated before they become managed records. A publish operation projects managed editorial and adapter-installation data into an immutable public snapshot. Adapter definitions are code-installed manifests that validate configuration and produce typed public tokens; they are not runtime callbacks.

`EditorialArchive` is narrow content interchange for an untouched starter,
not a full private backup or an operated-installation migration. Its JSON
validator normalizes omitted post status to `draft` and accepts explicit
`draft` only. Explicit review, scheduled, published or unknown statuses fail
with an actionable draft-import error; they are never silently downgraded.
It carries no desk approval and cannot recover true editorial lifecycle,
private identities, revisions, multilingual state, accounts or comments.
The restore boundary independently rejects non-draft entries before mutation,
including typed callers that bypass JSON validation. Recovery of real status
and review evidence belongs to complete private recovery or a future
controlled importer, not this interchange contract.

Untouched-starter restoration checks the complete site state, including
categories and managed revisions, plus the independent article inventory,
payloads, locale variants and SQL/payload revisions against the checked-in
fixture. Only generated managed creation/update timestamps are excluded where
the fixture creates them afresh. The article-table check and replacement share
a transaction-scoped write lock, including insertion gaps; a concurrent edit
cannot be acknowledged and then silently overwritten. Rejected restoration
preserves site state, articles and restore-operation records.

## Type ownership

| Type                                          | Location                       | Purpose                                                    |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| PublicationSettings and editorial types       | src/types.ts and src/editor.ts | Public and managed publication data                        |
| ContentSnapshot                               | src/editor.ts                  | Immutable public release input                             |
| AdapterDefinition and AdapterInstallation     | src/adapters/index.ts          | Controlled extension manifest and site-scoped installation |
| PublicAdapterSnapshot and contribution tokens | src/adapters/index.ts          | Public-safe static build projection                        |
| EditorialArchive and ArchivePostEntry         | src/archive.ts                 | Versioned draft-only editorial interchange                 |

## Public API surface

| Export                                         | Kind          | Description                                                                                               |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| validatePostInput and content validation types | function/type | Editorial validation contract                                                                             |
| ContentSnapshot                                | type          | Versioned static publication snapshot                                                                     |
| adapterRegistry and adapter definitions        | value/type    | Repository-bundled, allow-listed extension registry                                                       |
| validateAdapterInstallation                    | function      | Validates a site-scoped installation against the registry                                                 |
| projectPublicAdapterSnapshot                   | function      | Removes private installation values for static build use                                                  |
| renderAdapterContributions                     | function      | Converts validated public projection into typed head/slot tokens                                          |
| parsePublicAdapterSnapshot                     | function      | Parses only schema version 2 and rejects unknown or removed fields                                        |
| googleAnalyticsAdapter                         | value         | Reviewed GA4 adapter with a strict public ID/consent schema and a platform-owned static loader path       |
| validateEditorialArchive                       | function      | Parses version 1 draft-only interchange and validates site/media references; omitted status becomes draft |
| archiveSummary and archiveCanonicalJson        | function      | Safe interchange counts and deterministic restore-idempotency representation                              |

## Extension points

Definitions may declare only administrative settings, static head contributions,
named static slots, and an exact allow-listed platform static-script path. A
definition has a stable ID/version, exact provider-origin allow-list,
configuration validator, and public projection. Definitions cannot create
routes, middleware, request-time work, raw HTML, inline event handlers, or
arbitrary remote URLs.

## Error taxonomy

| Error                        | Meaning                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ContentValidationError       | Invalid editorial or adapter configuration                                                                                   |
| Unknown adapter              | The installation references an ID absent from the bundled registry                                                           |
| Revision conflict            | The admin persistence layer rejected a stale installation update                                                             |
| Invalid archive draft import | `ContentValidationError` rejects explicit non-draft archive status and instructs the caller to choose draft before importing |

## Test strategy

Harness contract tests cover registry validation, duplicate/unknown capabilities,
snapshot secrecy, static-boundary constraints, GA4 consent/origin constraints,
and multi-site isolation. Admin integration tests cover authorization and
optimistic concurrency; browser tests cover disabled and failed contribution
behavior.

`archive-restore-contract.test.mjs` covers omitted/explicit draft status and
rejected non-draft input. `portable-persistence-integration.test.mjs` passes
actual validated archive JSON into SQL restoration, verifies draft records
without fabricated desk approval, and preserves revision, site, approved-media,
starter-only and idempotency rejection. Run the focused regressions with
`pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/__tests__/archive-restore-contract.test.mjs scripts/harness/__tests__/portable-persistence-integration.test.mjs`.

`archive-starter-safety.test.mjs` covers real category-only and independent
locale mutations with the currently observed site revision, removed/extra/
mutated article inventory, unchanged rejection state and successful pristine
restore. With `PUBLISHER_RECOVERY_TEST_DATABASE_URL` pointed at disposable
localhost PostgreSQL, it also tests distinct connections racing article
insertion and locale edits against restore's check/replacement boundary.

## Class contract registry

The package exposes no inheritance hierarchy. Adapter definitions are immutable data-plus-validation objects consumed by platform-owned registry and renderer functions.
