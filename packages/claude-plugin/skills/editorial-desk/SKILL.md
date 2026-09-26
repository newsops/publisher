---
name: editorial-desk
description: The Publisher editorial workflow and desk gate — how a post moves from source to draft to approved to published, what each desk check requires, and how the improvement loop works. Use for any article drafting, review, approval, or publishing task.
---

# Editorial desk

Every published article passes the admin's desk gate (`desk report` → six
self-check attestations → `desk approve`). There is no override. A content
edit to a published post is rejected unless the patch itself sets
`"status": "review"`. Approval is bound to a fingerprint of title, excerpt,
body, image, author, categories, tags and SEO fields: any edit after
`DESK_APPROVED` invalidates it — make no content edits between step 6 and
step 7; if you must, return to step 4.

## Workflow

1. **Context** — `publisher site guidance get --site <id> --json` (site
   editorial guidance; follow it verbatim),
   `publisher post plan --site <id> --author <slug> --json` (author slug,
   display name and editorial persona; it does not return categories), and
   `publisher taxonomy categories list --site <id> --json` (the only source
   of valid category slugs — `post create` rejects unknown ones).
2. **Draft** — write `bodyMarkdown` per the body contract below, then
   `publisher post create --site <id> --input <post.json> --non-interactive --json`
   with `status: "review"`. See "Post JSON" below for the accepted fields.
3. **Image** — source per the `press-images` skill, then
   `publisher media upload --site <id> --file <path> --mime-type <type> --non-interactive --json`
   (returns `MEDIA_APPROVED`) and put the widest `media.variants[].publicPath`
   into `imageUrl`.
4. **Desk** — `publisher desk report --site <id> --post <post-id> --json`.
   Fix every `fail` check with
   `publisher post update --site <id> --post <post-id> --input <patch.json> --revision <n> --non-interactive --json`
   (partial patches are accepted; include `"status": "review"` when the post
   is currently published). A `warn` (`image.resolved`, `image.content`,
   `site.guidance`) cannot be fixed by a patch: confirm it manually and
   record the confirmation in the `--note`. Re-run the report. At most three
   iterations; then stop and report to the user with the remaining items.
   `publisher post get --site <id> --post <post-id> --json` reads the
   current `post.bodyMarkdown`, `post.revision`, `post.status` and
   `post.imageUrl` without changing the post — use it, never a no-op
   `post update`, whenever you need the body or revision as stored.
5. **Independent review** — dispatch the `publisher:desk-reviewer` agent with
   the site id, post id, `post.revision` and the exact `bodyMarkdown` from
   `post get`, the report JSON, the local path of the downloaded image file, and the
   image's press source URL (`imageUrl` is a `/media/...` path that is not
   fetchable before publish, so the reviewer needs the file and the original
   source instead). It returns one evidence line per checklist item, or an
   objection.
6. **Approve** — only when every check passes and the reviewer raised no
   objection. Write `checklist.json` as a JSON array of
   `{"id", "checked": true, "note"}`, one object per `report.checklist[].id`,
   each `note` carrying the reviewer's evidence for that item, then:
   `publisher desk approve --site <id> --post <post-id> --revision <n> --checklist-file checklist.json --note "<warn confirmations and image source>" --non-interactive --json`
   Repeated `--check <id>` flags (`--check facts-verified --check headline-accurate ...`)
   are the equivalent attestation when no per-item note is needed. Every
   `checklist.json` `id` (or every `--check` id) must come from
   `report.checklist[].id`; pass all of them or none. The response carries
   the new `revision`.
7. **Publish** — write `{"status":"published"}` to `publish.json`, then
   `publisher post update --site <id> --post <post-id> --input publish.json --revision <n from DESK_APPROVED> --non-interactive --json`
   (`--input` is always a file path, never inline JSON), then
   `publisher publish --site <id> --idempotency-key <site>-<yyyymmdd>-<n> --non-interactive --json`
   (returns `operationId`) and
   `publisher operation get <operation-id> --site <id> --json` until
   `state.operation.terminal` is true. Static deployment is performed by the
   operations worker, not by this plugin.

## Post JSON

`post create`/`post update --input` accepts a JSON object; unknown keys are
rejected. Relevant fields:

- `slug`, `title`, `excerpt`, `bodyMarkdown`
- `author` (display name — use `authorContext.displayName` from `post plan`)
  and `authorSlug` (or pass `--author <slug>` on the command line instead;
  omitting both fails with `INPUT_REQUIRED` on `--author`)
- `seoTitle`, `seoDescription`
- `publishedAt` (ISO 8601)
- `status` (`"review"` while drafting)
- `categories` (array of slugs from `taxonomy categories list`)
- `tags` (optional array of slugs)
- `imageUrl`

## Body contract (`bodyMarkdown`)

- Plain Markdown paragraphs; no raw HTML.
- Links must be `https://` or relative.
- Markdown image syntax `![…](…)` is rejected; a body image is
  `:::figure{src="…" alt="…" creditName="…" creditUrl="https://…"}` … `:::`.
- Cite every factual claim with a link to the source you actually read.
- Quote at most one short passage per source, in quotation marks.
- Embed an X post with a directive block, never a pasted screenshot:
  `:::embed{provider="x" url="https://x.com/<user>/status/<id>" quote="<text>" authorName="<name>"}` followed by `:::` on its own line. Take `quote`
  and `authorName` from
  `publisher embed x resolve --site <id> --url <url> --json`, never from
  memory.
- Do not repeat the representative image inside the body.
- 300–900 words for a news item (well above the desk's 150-word floor);
  first paragraph states the news.

House style: no H1 (the title is the H1) — this is a house convention, not
enforced by the body parser.

## Desk checks and how to satisfy them

| Check                   | Requirement                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `image.present`         | `imageUrl` is set on the post                                       |
| `image.resolved`        | The URL resolves to an approved media-library item                  |
| `image.size`            | At least 1200×630 px                                                |
| `image.aspect`          | Aspect ratio between 1.4 and 2.0 (16:9 ≈ 1.78 fits)                 |
| `image.content`         | Not blank or a placeholder (pixel channel deviation ≥ 12)           |
| `image.duplicate`       | The body's first figure does not repeat the representative image    |
| `title.length`          | 20–110 characters                                                   |
| `excerpt.length`        | 40–200 characters                                                   |
| `seoTitle.length`       | At most 70 characters                                               |
| `seoDescription.length` | 50–160 characters                                                   |
| `body.markdown`         | Valid editorial Markdown (contract above)                           |
| `body.length`           | At least 150 words                                                  |
| `body.sources`          | At least one HTTPS source link or embed                             |
| `author.active`         | Byline author is not archived (checked when author status is known) |
| `taxonomy.categories`   | At least one category slug from `taxonomy categories list`          |
| `site.guidance`         | Warns, but does not fail, when no site guidance is configured       |

Numbers are the desk's current thresholds; the report's `message` is
authoritative when they differ.

## Self-check attestations

`facts-verified`, `headline-accurate`, `image-representative`, `seo-fields`,
`taxonomy-author`, `site-guidance`. Each `--check` is a statement that you
verified the item; the `--note` must say what was verified and how. Never
attest an item the reviewer objected to.

## Errors

- `REMOTE_ERROR` with `body.error.code: "revision_conflict"` — re-read the
  current revision (`desk report` for a post revision, or the post/site
  response) and retry once.
- `DESK_REJECTED` at step 6 (`desk_checks_failed` or
  `desk_checklist_incomplete`) counts as one improvement iteration — return
  to step 4.
- `REMOTE_ERROR` with `body.error.code: "validation_failed"` at step 2 or
  step 7 — show `body.error.message`, fix the input JSON, and retry once.

See the `publisher-cli` skill for the full envelope and exit-code contract.
