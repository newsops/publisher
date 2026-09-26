---
description: Show sites and the desk queue (posts in review, approval state)
argument-hint: '[--site <id>]'
allowed-tools: Bash(publisher:*)
---

Load the `publisher:publisher-cli` skill. Arguments: `$ARGUMENTS` (optional
`--site <id>`).

1. `publisher site list --json` → the sites (only the given `--site` when
   provided).
2. For each site, `publisher desk list --site <id> --json` → one table with
   `id`, `revision`, `status`, `review.status`, `updatedAt`, `title` per post.
3. Finish with, per site, how many posts wait for the desk (`status`
   `review` with `review.status` not `approved`) and how many are approved
   but not yet published (`status` `review` with `review.status`
   `approved`). Note that `draft` posts are listed but not counted in
   either total.

Read-only: run no mutation. To inspect a publish operation the user names,
use `publisher operation get <operation-id> --site <id> --json`.
