# Agent operations

`publisher` is the provider-neutral command interface for an autonomous
operator. It calls the authenticated admin API; it never connects directly to
PostgreSQL, object storage, Cloudflare, Vercel, or Neon.

`@publisher/admin-client` is the reusable counterpart for a Claude plugin or
another automation runtime. It accepts an explicit admin origin, bearer-token
source, and `fetch`-compatible transport; it does not read environment
variables, persist credentials, or gain direct access to data stores or a
hosting provider. The CLI is intentionally only a process-I/O adapter over
that package. `apps/admin` remains the sole owner of authorization, audit, and
content mutations.

Every `--json` result has `schemaVersion`, `ok`, and `code`. Credentials are
read only from `PUBLISHER_API_TOKEN` and are never accepted as command-line
arguments or returned in JSON.

The admin service can merge a primary `ADMIN_AUTOMATION_KEYS` keyring with an
optional `ADMIN_AUTOMATION_KEYS_EXTRA` keyring. This permits narrowly scoped
rotation without replacing an encrypted primary provider secret; both rings
use the same record schema and duplicate key IDs fail closed.

```bash
publisher doctor --json --non-interactive
publisher status --json
publisher publish --idempotency-key release-20260912-01 --json
publisher operation get <operation-id> --json
publisher auth login --device --json
```

## Per-publication guidance

An operator can retain private editorial instructions for each publication.
Agents retrieve this context before content restore and publish operations;
it is planning input, never an authorization bypass or public content.

```bash
publisher site guidance get --site example --json
publisher site guidance set --site example --file ./editorial-guidance.txt \
  --revision 1 --non-interactive --json
```

Guidance is excluded from snapshots, static HTML, feeds, and search indexes.

## Archive recovery

`content restore` is the agent-first recovery path for a private archive kept
outside this repository. It is not a database client and it is not browser
automation. The archive directory contains `archive.json` plus only the
relative media files declared by its checksum. The CLI validates the manifest,
paths, byte sizes, and SHA-256 values locally; its inspection result exposes
only counts and an archive digest.

```bash
publisher content inspect --archive /secure/archive --json --non-interactive
publisher content restore --archive /secure/archive --site default \
  --expected-revision 1 --idempotency-key restore-20260913-01 \
  --non-interactive --json
```

Before the restore command, create and retain a logical PostgreSQL backup
outside the repository. Obtain the `expectedRevision` from an observed admin
state, and use a new idempotency key for distinct content. The server accepts
this initial restore mode only for an unchanged generic starter fixture; a
changed state, stale revision, missing approved media binding, or a replay key
bound to different archive content is rejected without activating a release.

For each declared image, the CLI uses the scoped Admin API to upload and
approve a checksum-addressed variant, then sends only the resulting media IDs
and variant hashes with the archive request. The archive's paths never reach
the server. The response has a durable restore operation ID and safe counts;
it does not print article bodies, local paths, asset bytes, credentials, or
private object keys.

After a successful restore, publish with a separate idempotency key, process
the immutable snapshot into a verified candidate directory, and use the
operator-selected static-host CLI to upload that directory. A browser remains
the parallel human editorial surface and the final public-result check; it is
not a required automation interface.

`AUTHORITY_REQUIRED` is a successful safety boundary, not an invitation to
retry with more privilege. A person must approve billing, production DNS,
destructive deletion, or a device authorization user code. The CLI reports
the required action without persisting an access token by default.
