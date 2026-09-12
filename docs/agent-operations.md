# Agent operations

`publisher` is the provider-neutral command interface for an autonomous
operator. It calls the authenticated admin API; it never connects directly to
PostgreSQL, object storage, Cloudflare, Vercel, or Neon.

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
