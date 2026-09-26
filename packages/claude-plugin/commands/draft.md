---
description: Draft a Publisher article from a source URL, upload its press image, and create it in review
argument-hint: '<source-url> --site <id> --author <slug>'
allowed-tools: Bash(publisher:*), Bash(curl:*), Bash(file:*), Bash(sips:*), WebFetch, Read, Write
---

Load `publisher:editorial-desk`, `publisher:press-images`, and
`publisher:publisher-cli`. Arguments: `$ARGUMENTS` (source URL, `--site`,
`--author`). If `--author` is missing, ask the user for the author slug and
stop; `publisher author get --site <id> --slug <slug> --json` confirms one.

1. `publisher site guidance get --site <id> --json`,
   `publisher post plan --site <id> --author <slug> --json`, and
   `publisher taxonomy categories list --site <id> --json`. Quote the
   guidance's constraints back to yourself before writing.
2. Fetch and read the source. If it links to a primary source (company
   announcement, filing, official post), read that too and cite it. For an X
   post, get `quote`/`authorName` from
   `publisher embed x resolve --site <id> --url <url> --json`.
3. Source and upload the image per `press-images`; keep the downloaded file
   and its source URL for the desk step.
4. Write the post JSON (fields per the editorial-desk skill's "Post JSON"
   section, `status: "review"`, `imageUrl` from the upload) to a scratch file.
5. `publisher post create --site <id> --input <file> --author <slug> --non-interactive --json`.
   On `REMOTE_ERROR` with `validation_failed`, show `body.error.message`, fix
   the JSON, and retry once.
6. Print `post.id` and `post.revision`, the image file path and source URL,
   and suggest `/publisher:desk <post-id> --site <id>`.

Do not approve or publish in this command.
