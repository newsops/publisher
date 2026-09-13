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

```bash
publisher doctor --json --non-interactive
publisher status --json
publisher publish --idempotency-key release-20260912-01 --json
publisher operation get <operation-id> --json
publisher auth login --device --json
```

`AUTHORITY_REQUIRED` is a successful safety boundary, not an invitation to
retry with more privilege. A person must approve billing, production DNS,
destructive deletion, or a device authorization user code. The CLI reports
the required action without persisting an access token by default.
