---
description: Publish desk-approved posts for a site and wait for the publish operation
argument-hint: '--site <id> [--post <post-id>]'
allowed-tools: Bash(publisher:*), Bash(sleep:*), Bash(date:*), Write
---

Load `publisher:publisher-cli`. Arguments: `$ARGUMENTS` (`--site`, optional
`--post` to limit to one post).

1. `publisher desk list --site <id> --json`. Candidates are posts with
   `status` `review` and `review.status` `approved` (or only the given
   `--post`). When `--post` is given, it must still appear in `desk list`
   with `status` `review` and `review.status` `approved`; otherwise stop and
   point to `/publisher:desk <post-id> --site <id>`. Use each entry's
   `revision` for `--revision`. If none, say so and stop.
2. Write `{"status":"published"}` to a scratch file `publish.json`. For each
   candidate:
   `publisher post update --site <id> --post <post-id> --input publish.json --revision <n> --non-interactive --json`.
   On `REMOTE_ERROR` `validation_failed` mentioning desk approval, skip it
   and tell the user to run `/publisher:desk` for that post. If every
   candidate was skipped, stop before step 3.
3. `publisher publish --site <id> --idempotency-key <site>-<yyyymmdd>-<n> --non-interactive --json`
   (`n` a 2-digit sequence number for the day; use `date` for `yyyymmdd`)
   → `operationId`.
4. Poll `publisher operation get <operation-id> --site <id> --json`, sleeping
   10 seconds between polls (`sleep 10`), until `state.operation.terminal` is
   true. After 5 minutes without a terminal state, print the operation id and
   tell the user to resume with
   `publisher operation get <operation-id> --site <id> --json`; otherwise
   report `state.operation.status`.
5. Report the operation state and the published post ids. State explicitly
   that static deployment to the public site is performed by the operations
   worker, not by this plugin.
