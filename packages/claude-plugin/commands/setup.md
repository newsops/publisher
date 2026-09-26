---
description: Verify the Publisher plugin can reach the admin with the configured origin and token
allowed-tools: Bash(publisher:*)
---

Load the `publisher:publisher-cli` skill. Then:

1. Run `publisher doctor --json --non-interactive`. If `code` is
   `CONFIGURATION_REQUIRED`, tell the user which variables `missing` lists and
   that they come from the plugin settings (`/plugin` → Publisher Desk →
   Configure: Admin origin, Automation API token); a new session is needed
   after saving. Stop.
2. Run `publisher site list --json`. If `code` is `REMOTE_ERROR`, show `status`
   and `body.error` (or `retryable`) verbatim and stop; do not retry with
   different credentials. If `status` is 401 or 403, the token is wrong or
   lacks this site — point to the plugin settings (Automation API token) and
   stop.
3. Print a table of `siteId`, `name`, `canonicalOrigin`, `themeId` from
   `sites[]` and say the plugin is ready.

Never print the value of `PUBLISHER_API_TOKEN`.
