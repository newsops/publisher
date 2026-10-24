# Keep existing publications running during an upgrade

Use this runbook for an installation that already serves one or more
publications. Keep the current public release online throughout rehearsal.
Run each check separately for each publication, then reconcile shared accounts
and the installation catalog. Never seed an operating site with the repository
fixture.

Start with the [deployment assistance guide](../ai-assisted-deployment.ko.md).
That guide controls provider decisions, secrets, costs, and external actions.
This runbook does not authorize a production freeze, overwrite, deployment,
DNS change, credential transfer, or service shutdown.

## Select the operation

For an upgrade of the current PostgreSQL-backed application, follow the steps
below. Use a supported backup format and version-aligned admin, CLI, and
publication worker. Keep a working release and an independent recovery copy.

For a move to the approved local-first product, stop before cutover. The
[local-first acceptance plan](./local-first-verification.md) still gates that
product. The current operator package is a SQLite and encrypted-sync proof,
not a replacement installation. It cannot yet accept a complete operating
site with its media, permissions, comments, and publication history.

For draft content interchange, use `publisher content inspect` and
`publisher content restore` only against an untouched starter. Explicitly select
draft status in the archive. Omitted status also means draft. Published,
scheduled, and review statuses are rejected rather than downgraded. Review
imported drafts through the normal editorial workflow before publishing.
EditorialArchive is not a whole-installation migration or a private backup.

## 1. Record the source and public baseline

Keep this record outside the repository. Record the running program version,
applied migration checksums, selected publication, source revision, public
origin, current release, pending jobs, and unresolved operations. Record the
admin, CLI, and worker versions independently. A public script filename alone
does not identify the management runtime.

For each site, collect the current public URL list and observe representative
home, article, category, author, archive, search, and feed output. Record
canonical URLs, redirects, response status, cache policy, and CSP. Inspect
desktop and mobile layout, image loading, consent, and comment controls.
Measure the actual browser width after applying a device override.

Use the following preservation checks for the source, isolated recovery, and
candidate. Mark a check unavailable when its source cannot be observed. A
missing observation is not a passing zero count.

| Domain                     | Compare before accepting the recovered site                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site identity and settings | Stable site ID, canonical origin, name, language, locale, theme, navigation, and publication settings                                                                    |
| Articles and locales       | Article and post IDs, locale relationships, slugs, existing URLs, status, source/document revisions, timestamps, featured rank, source links, Markdown, and rendered SEO |
| Editorial review           | Actual review decision, reviewer identity, and exact reviewed revision; no generated approvals                                                                           |
| Taxonomy                   | Category and tag kind, identity, status, names, and every article association                                                                                            |
| People                     | Author identity, active state, biography, avatar references, persona Markdown, and revisions                                                                             |
| Agent guidance             | Private Markdown, revision, and site scope; no transfer to public snapshots                                                                                              |
| Media                      | Original and every referenced derivative, SHA-256, size, MIME type, approval, attribution, captions, and body/avatar references                                          |
| Adapters and analytics     | Installation identity/version/revision, enablement, public configuration, consent behavior, and required secret-reference names                                          |
| Comments                   | Site/thread identity, moderation state, dedup identity, accepted pending records, approved public projection, and working reader submission                              |
| Access                     | Account identity/status, role, site memberships, password-verifier policy, and fresh-session behavior                                                                    |
| Publication history        | Immutable snapshots, manifests, artifacts, release records, jobs, operation/idempotency records, audit history, and unknown effects                                      |

Compare identities, relationships, values, and hashes as well as counts. Keep
private guidance, personas, account records, original media, provider settings,
and operated-site evidence out of commits, issues, PRs, screenshots in the
repository, and GitHub deployment records.

Do not infer scoped browser permissions from recovered membership rows. The
current browser's `authorizedSiteId` checks a role, normally `owner`, rather
than reading `site_administrators`. Automation uses an external keyring's
explicit site list. Recovery preserves membership data but does not implement
assigned-site browser access. Keep that capability unverified until a separate
authorization implementation and cross-site acceptance test exist.

## 2. Establish a version-aligned capture boundary

Before a breaking runtime or schema upgrade, obtain narrow authorization for
the actual maintenance window. Keep public static delivery running.

1. Stop old editorial writers and automatic publication triggers.
2. Drain queued work with the original matching worker and its existing schema.
3. Reconcile running, failed, or unknown effects. Record an explicit disposition
   for every job instead of dropping it or treating a timeout as failure.
4. Prevent new old-contract snapshots after the final capture.
5. Establish a separate boundary for online comment intake. Drain accepted
   records and reconcile comments received during the window before retiring
   any receiver.

Do not send old `plugins` snapshots or old idempotency keys to the new Adapter
worker. Historical snapshots remain immutable. Migration 0006 changes current
relational names and stored current configuration, not every historical object.
Use a fresh supported snapshot and a fresh operation identity after the upgrade.
There is no old-name alias, compatibility renderer, or dual writer.

Admin and comments backups each have one database snapshot. Two separate
database captures are not a globally atomic capture. Retain their capture
times and the writer/intake boundary needed to reconcile them.

## 3. Capture complete private recovery copies

Check the source schema before selecting a backup tool. The new logical format
accepts only the exact current schema. For a source before migration 0006, it
fails closed. The original program's incomplete logical backup is not a full
recovery copy either. Do not migrate the sole source just to make backup pass.

For an older source, use a complete native PostgreSQL backup first. Enroll
source and disposable-target connections in a private PostgreSQL service file.
Verify that the target service names refer to separate, empty databases.
Use compatible PostgreSQL client tools and a source role that can read every
application table. Retain the source schema, migration ledger, and data.
[PostgreSQL documents the consistent capture and ownership limits](https://www.postgresql.org/docs/16/backup-dump.html).

Use a private local directory and owner-only file permissions. Choose new capture
paths and verify that no output file exists before running native tools, which
can overwrite their output. These example paths are placeholders, not permission
to replace an earlier recovery copy.

```bash
pg_dump --format=custom --file=/secure-backup/admin.dump \
	"service=publisher_source_admin"
pg_dump --format=custom --file=/secure-backup/comments.dump \
	"service=publisher_source_comments"
```

Inspect the trusted archives, then restore into new, isolated empty databases
without pre-applying application migrations. Do not use `--clean` or `--create`
against a source service. This example deliberately omits source database
ownership and grants. Recreate and test the required isolated roles separately.
[The restore options and source-code warning are documented here](https://www.postgresql.org/docs/16/app-pgrestore.html).

```bash
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
	--dbname="service=publisher_rehearsal_admin" /secure-backup/admin.dump
pg_restore --single-transaction --exit-on-error --no-owner --no-acl \
	--dbname="service=publisher_rehearsal_comments" /secure-backup/comments.dump
```

Native archives contain sensitive account verifiers and active session rows.
Keep restored services isolated and inactive. Invalidate copied sessions and
review credentials before any external activation. Compare the preservation
matrix against the restored source, apply current migrations only to the
isolated clone, and compare again. Then create the new logical recovery copy
from that current-schema clone. This is an offline upgrade rehearsal, not a
compatibility production runtime. Retain the original native copy unchanged.

For a current-schema source or the verified current-schema clone, use the
existing installation recovery commands from the supported program.
These are operator disaster-recovery tools, not permission for an editorial
agent to bypass the management API with arbitrary SQL.

```bash
corepack pnpm persistence:backup -- \
	--scope admin --output /secure-backup/admin.json
corepack pnpm persistence:backup -- \
	--scope comments --output /secure-backup/comments.json
```

Check the supported format, exact schema and migration provenance, row counts,
and data digests. Unknown tables, columns, or migrations stop capture. Do not
fill omitted domains with empty arrays or reinterpret an older backup format.
Keep the original supported runtime available for its own recovery artifact.
Backup output uses a new private file and refuses to overwrite an existing path.
Choose a fresh capture filename on each run.

The backup preserves durable current-schema data, including account identities,
site ACLs, guidance, and restore operations. Active account sessions are excluded
and remain empty after restoration. Password verifiers remain sensitive and
can still validate existing passwords. Session exclusion does not rotate a
password or revoke a copied agent token, environment keyring, or provider key.

Copy the complete referenced object set separately: originals, derivatives,
snapshots, manifests, and release artifacts. Verify bytes, sizes, and SHA-256
values. A media metadata row does not prove that its image is recoverable.
Retain an independent copy outside the sole provider account.

Treat logical SQL backups and private objects as plaintext unless an actual
encryption step has protected them. Before uploading private recovery material,
use the approved encryption and authenticated-provenance process. Hold recovery
keys and the trusted checkpoint separately from the only remote copy. The
current logical-backup command does not create the future encrypted local-first
bundle. Checksums and private cache headers do not encrypt data.

## 4. Rehearse in isolated empty targets

Use separate disposable databases, object prefixes, credentials, and output
directories. Disable scheduled jobs and external publication. Never point
rehearsal at the source database, source object prefix, or active host.

Apply the supported migrations to the targets. Current admin migrations create
a generic default catalog row. The strict restore target must have every managed
application table empty, including that row. Have the installation operator
verify and remove only the untouched bootstrap row in the disposable target.
Do not empty an operating database to satisfy this precondition.
Use the target table owner for restoration, including transactional identity
sequence restart. Insufficient privileges fail and roll back the restore.

Point `DATABASE_URL` and `COMMENTS_DATABASE_URL` only at these isolated targets,
then run the existing restore commands:

```bash
corepack pnpm persistence:restore -- \
	--scope admin --input /secure-backup/admin.json
corepack pnpm persistence:restore -- \
	--scope comments --input /secure-backup/comments.json
```

Expect an error for an unsupported schema or format, bad checksum, or nonempty
target. Successful restoration verifies durable rows inside the restoring
transaction. Sessions remain absent by policy. Check the preservation matrix
against both sites, including accounts shared across sites and denied cross-site
access. Verify the restored audit sequence with a new isolated event.

Restore and inspect the object copy as well. Resolve every body, hero, avatar,
variant, snapshot, and artifact reference. Build a fresh candidate without
activating or deploying it. Compare the full URL inventory and representative
HTML, SEO, feed, image, theme, adapter, consent, and comment behavior.

## 5. Upgrade the current runtime and verify a candidate

Keep the private recovery copy and original runtime available. After a successful
rehearsal and explicit execution authority, coordinate the supported schema,
admin, CLI, and worker versions. Re-enroll required external secret references
through the selected environment. Review password verifiers and rotate or revoke
reusable credentials before exposing a recovered installation. Require a fresh
login and check site permissions.

Use the management CLI or API for editorial and configuration changes. Keep the
human browser interface available for the same management capabilities. The
current capability exceptions are gaps, not the intended product boundary.

Create a new publication snapshot. Materialize and verify its complete candidate,
then compare it with a clean build of the same inputs. Exercise adapter enable,
public ID change, disable/removal, comment configuration, RSS body edits, and
author edits. Inspect consent and verification under the generated HTTP CSP,
not a preview that omits headers.

Obtain the deployment guide's final authority before changing the active host.
After promotion, observe the canonical public origin in desktop and mobile
browsers. Recheck old article URLs, loaded images, analytics consent, reader
comment submission and moderation, cache headers, and failure-independent
article delivery. A local activation or hosting-provider "Ready" label is not
public delivery evidence.

## 6. Keep distinct rollback plans

For a public artifact regression, activate the prior verified release through
the selected host's atomic promotion contract. This changes public files,
not editorial database state. Confirm the public origin serves that release.

For an admin or schema failure, stop writers and use the matched runtime and
isolated verified recovery copy. Reconcile all accepted writes since capture.
Do not run old admin code on a renamed schema or overwrite newer source data
with a stale backup. Preserve failed candidates and operation evidence for
diagnosis. A public artifact rollback does not roll back migrations.

Retain existing services and independent backups until every acceptance check
passes and the operator approves retirement. Do not delete a source to make
an incomplete migration appear final.

## Block full local-first cutover until every product gate passes

Use ARCH-008 as the acceptance authority. In particular, retain blockers for:

- Complete per-site private import preserving identities, locale/review history,
  revisions, object closure, accounts, moderation, and operation records.
- An independently complete browser application and direct-core CLI, without a
  required hosted management API or server database.
- Local authentication, OS-backed key custody, recovery material, rotation,
  credential revocation, and explicit writer handoff.
- Effective site-scoped browser permissions and independent account-management
  paths, not merely persisted account and membership rows.
- Original and derivative media recovery with authenticated encrypted closure.
- Online encrypted comment intake while the writer PC is off, durable deduplication,
  local moderation, late-record reconciliation, and static approved projections.
- Publication reservations, unknown-effect reconciliation, verified host promotion,
  external public-origin observation, and rebuild-free artifact rollback.
- A completed isolated migration rehearsal and real operator walkthrough for
  every site, including off-PC public availability.

Leave the current public release and management installation in place when any
gate is missing or unverified. The bounded recovery and rendering corrections
in INFRA-007 do not complete these product gates.
