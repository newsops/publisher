---
description: Run the desk gate for a post — report, improvement loop, independent review, approval
argument-hint: '<post-id> --site <id> [--image <file> --image-source <url>]'
allowed-tools: Bash(publisher:*), Bash(curl:*), Bash(file:*), Bash(sips:*), WebFetch, Read, Write, Agent
---

Load `publisher:editorial-desk` and `publisher:publisher-cli`, and
`publisher:press-images` when any `image.*` check fails. Arguments:
`$ARGUMENTS` (post id, `--site`, optional `--image <local file>` and
`--image-source <url>` from `/publisher:draft`; if absent and the report's
image checks pass, ask the user for them before step 4).

1. `publisher desk report --site <id> --post <post-id> --json`. Keep
   `revision`, `report.checks`, and `report.checklist`. If
   `report.approvalValid` is true and no check is `fail`, say the post is
   already approved for its current content, suggest
   `/publisher:publish --site <id> --post <post-id>`, and stop.
2. Read the post: `publisher post get --site <id> --post <post-id> --json`
   → keep `post.bodyMarkdown`, `post.revision`, `post.status`,
   `post.imageUrl`. This is a read; it never changes the post. Re-run it
   after every `post update` so the reviewer sees the current body.
3. For each check whose `level` is `fail`: prepare the smallest patch that
   satisfies its `message`, write it to a file, apply it with
   `publisher post update --site <id> --post <post-id> --input <patch-file> --revision <n> --non-interactive --json`
   (include `"status": "review"` when `post.status` is `published`), then
   re-run the report and step 2. `warn` items are confirmed manually and
   noted. Stop after three iterations and report the remaining items to the
   user; do not attempt approval.

   Steps 3, 5 and 7 draw from the same budget of three iterations in total.

4. When no check fails, dispatch the `publisher:desk-reviewer` agent with
   the site id, post id, `post.revision`, the exact `post.bodyMarkdown` from
   step 2, the full report JSON, the image file path, and the image source
   URL. If the agent cannot be dispatched or its reply lacks a `VERDICT:`
   line, stop and report to the user; never approve without a
   `VERDICT: ready`.
5. If the reviewer's `VERDICT` is `objection`, fix the objected items (step 3)
   and dispatch the reviewer again, once. If it still objects, report to the
   user and stop.
6. Write `checklist.json`: an array with one object per `report.checklist[].id`
   — `{"id": "<id>", "checked": true, "note": "<the reviewer's evidence for that item>"}`
   — every id in `report.checklist`, or do not approve. Then approve with
   the checklist file and a `--note` carrying the manually confirmed `warn`
   items and the image source URL:
   `publisher desk approve --site <id> --post <post-id> --revision <n> --checklist-file checklist.json --note '<warn confirmations and image source URL, plain text without quotes>' --non-interactive --json`.
7. On `DESK_REJECTED`, show `body.error`; it counts as an iteration — return
   to step 3.
8. Print the `revision` from `DESK_APPROVED` and suggest
   `/publisher:publish --site <id> --post <post-id>`. Make no content edits
   after approval.

There is no path that skips the report, the reviewer, or the attestations.
