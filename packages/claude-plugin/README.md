# Publisher Desk — Claude Code plugin

Run a Publisher newsroom from Claude Code. The plugin turns a source URL into
a desk-approved, published article: it drafts the story, sources an official
press image, runs the admin's desk gate, has an independent reviewer re-check
the facts, records the attestations, and publishes — every step through the
same `publisher` CLI and automation API that human editors' tools use.

```text
/publisher:draft <url> --site <id> --author <slug>
        │  guidance + categories → draft → press image → post created (review)
        ▼
/publisher:desk <post-id> --site <id>
        │  desk report → improvement loop (≤ 3) → independent reviewer → attest → approve
        ▼
/publisher:publish --site <id> --post <post-id>
        │  set published → publish operation → wait until the admin marks it done
        ▼
operations worker + static host (outside the plugin)
```

## 1. Prerequisites

You need three things before the plugin is useful:

1. **A deployed Publisher admin** reachable from your machine (its origin
   looks like `https://admin.example.com`). See `docs/deployment.md`.
2. **At least one site** in the admin's site registry. A fresh install has
   none; create one with `POST /api/v2/sites` and `bootstrap` (see
   `docs/admin-api.md`, "Multiple sites") or with
   `publisher site create` / `publisher site bootstrap`.

   Whenever you create or rename an operated site, keep it out of the
   Publisher program repository (`.agents/rules/repository-scope.md`): in
   your checkout of the program, add the site's name, domain, site ID, author
   slugs, and admin host to your private denylist, then set the same list as
   the `PUBLISHER_PRIVATE_DENYLIST_TEXT` Actions secret of your repository.

   ```bash
   corepack pnpm privacy:denylist add "<site name>" <site-domain> <site-id> \
     <author-slug> <admin-host>
   gh secret set PUBLISHER_PRIVATE_DENYLIST_TEXT < ~/.config/publisher/private-denylist.txt
   ```

   The command prints only counts; the file stays outside the repository
   with mode 600, and the hooks and CI reject any listed term.

3. **An automation API key** with the `publisher` role, scoped to the sites
   you will operate. The admin owner generates it on the admin host:

   ```bash
   corepack pnpm admin:api-key claude-desk publisher
   ```

   The command prints a `record` (`{ id, role, sha256 }`), an `envFragment`,
   and the raw `token` once. Before storing the record, add the site
   allow-list — a key without `sites` is rejected with
   `Automation key has no site scope`:

   ```json
   [
     {
       "id": "claude-desk",
       "role": "publisher",
       "sha256": "<digest>",
       "sites": ["default"]
     }
   ]
   ```

   Put that JSON in the admin's `ADMIN_AUTOMATION_KEYS` (or
   `ADMIN_AUTOMATION_KEYS_EXTRA` for an additive rotation) and restart the
   admin. Hand the raw `token` to the editor who will run the plugin; the
   repository, logs, and audit trail only ever contain the digest.

Claude Code 2.1 or newer on macOS or Linux (the credential hook is a POSIX
`sh` script). No Node.js, pnpm, or checkout of this repository is needed on
the editor's machine: the plugin ships the CLI as a single bundled file.

## 2. Install

Inside Claude Code:

```text
/plugin marketplace add newsops/publisher
/plugin install publisher@publisher
```

When the plugin is enabled, Claude Code opens a configuration dialog with two
fields:

| Setting                  | Value                                                 |
| ------------------------ | ----------------------------------------------------- |
| **Admin origin**         | `https://admin.example.com` — scheme + host, no path  |
| **Automation API token** | the raw token from step 1 (stored in the OS keychain) |

Enter the token in that dialog, not on a command line: `claude plugin install
--config api_token=…` works but leaves the secret in your shell history. You
can reopen the dialog later with `/plugin` → Publisher Desk → Configure.

Then **start a new Claude Code session** (the credentials are exported when a
session starts) and run:

```text
/publisher:setup
```

It checks that the two settings are present, calls the admin, and prints the
sites your key can see:

```text
| siteId      | name           | canonicalOrigin            | themeId   |
| default     | Example News   | https://news.example.com   | editorial |
| second-site | Second Example | https://second.example.com | editorial |
```

If it reports `CONFIGURATION_REQUIRED`, the settings were not saved or the
session predates them. If it reports a `401`/`403`, the token is wrong, was
revoked, or lacks that site in its allow-list.

## 3. Daily use

### See what is waiting

```text
/publisher:status
/publisher:status --site second-site
```

One table per site: every post in review with its revision, desk status, and
title, plus two counts — posts waiting for the desk and posts already approved
but not yet published.

### Draft a story from a source

```text
/publisher:draft https://source.example.com/news/example-announcement --site second-site --author example-desk
```

`--author` is the slug of an author that exists on that site (ask an admin, or
verify one with `publisher author get --site <id> --slug <slug> --json`). The
command:

1. reads the site's editorial guidance and its category list from the admin;
2. reads the source page and, when it links to a primary source, that too;
3. finds an official press or product image (announcement page `og:image`,
   product page, press kit — never stock or third-party), downloads it,
   checks its size, and uploads it to the media library;
4. writes the article as editorial Markdown with every claim linked to the
   source it read, and creates the post in `review`.

It ends by printing the post id, the image file and its source URL, and the
next command to run. It never approves or publishes.

### Run the desk gate

```text
/publisher:desk post-admin-example-announcement --site second-site --image ./press-image.jpg --image-source https://…/hero.jpg
```

(`--image`/`--image-source` are the values `draft` printed; if you omit them
the command asks for them before the review step.) The command:

1. runs `desk report` — sixteen checks on the image, title, excerpt, SEO
   fields, body, sources, author, categories, and site guidance;
2. fixes every `fail` with the smallest patch and re-runs the report, at most
   three times; items that can only be `warn` (no media library, no guidance
   configured) are confirmed by hand and recorded in the approval note;
3. dispatches the **desk-reviewer** agent — a separate, read-only Claude
   context that has not seen the draft being written. It opens every source,
   compares headline and excerpt with the body, looks at the image file, and
   checks SEO, taxonomy, and guidance. It returns `VERDICT: ready` with one
   evidence sentence per checklist item, or `VERDICT: objection`;
4. on an objection, fixes the objected items and asks the reviewer once more;
5. approves with all six attestations (`facts-verified`,
   `headline-accurate`, `image-representative`, `seo-fields`,
   `taxonomy-author`, `site-guidance`), each carrying the reviewer's evidence,
   via `desk approve --checklist-file`.

There is no override. If the report still fails after three iterations, or
the reviewer still objects, the command stops and tells you what is left. The
approval is bound to the content: any edit after approval invalidates it and
sends the post back through the gate.

In the trial run that produced this README, the reviewer rejected a draft
whose excerpt overstated a duration given in the source; the command patched
the body, excerpt, and SEO description and obtained approval on the second
pass.

### Publish

```text
/publisher:publish --site second-site
/publisher:publish --site second-site --post post-admin-example-announcement
```

Publishes every post that is approved and still in `review` (or only the one
named), then asks the admin to publish the site and polls the resulting
operation every ten seconds for up to five minutes. The admin's operation
becomes `published` when the **operations worker** has built and activated a
release — see the next section. If the worker has not run yet, the command
prints the operation id and how to resume:

```text
publisher operation get <operation-id> --site second-site --json
```

### Fix a published story

Publishing does not end the desk's authority. To change a published article
(a wrong thumbnail, a correction), run `/publisher:desk` again: it moves the
post back to `review` with the patch, re-runs the report and the reviewer,
re-attests, and you publish once more.

## 4. After publish: the operations worker

The plugin deliberately stops at the admin's publish operation. It holds an
editorial token, not infrastructure credentials, and the CLI it bundles never
talks to PostgreSQL, object storage, or a hosting provider. Turning the
operation into a live site is an operations task run from a checkout of this
repository with the admin's environment:

```bash
corepack pnpm publication:next -- --site second-site --deployment-root /srv/publisher-static
```

`publication:next` claims the queued job, renders only the changed routes,
verifies the release, and activates it with a compare-and-swap
(`docs/deployment.md`, "Run one queued job"). Upload the activated release
directory to your static host — for a Cloudflare Pages project, for example:

```bash
wrangler pages deploy /srv/publisher-static/releases/<release-id> --project-name <project> --branch main
```

The worker is normally a scheduled or event-driven process on the operations
side; editors only need to know that `/publisher:publish` reports
`published` once it has run.

## 5. Operating several sites

Every command takes `--site`. One key can be scoped to several sites (its
`sites` allow-list), and `/publisher:status` without `--site` shows all of
them in one view. Sites differ in guidance, authors, categories, and theme,
and the `draft` command reads those from the site it is given, so the same
plugin drafts an XR hardware story for one site and an AI research story for
another without any local configuration.

## 6. When something goes wrong

| Symptom                                                              | Meaning                                                                    | What to do                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CONFIGURATION_REQUIRED` with `missing: [PUBLISHER_ADMIN_ORIGIN, …]` | Settings not saved, or the session started before they were saved          | `/plugin` → Publisher Desk → Configure, then open a new session                   |
| `REMOTE_ERROR` with `status: 401` or `403`                           | Wrong or revoked token, `editor` role on a publish, or site not in `sites` | Ask the admin owner for a key with the right role and allow-list                  |
| `REMOTE_ERROR` with `retryable: true` and no `status`                | Admin unreachable                                                          | Check the origin and the admin deployment; retry once                             |
| `REMOTE_ERROR` `revision_conflict`                                   | Someone else edited the post since it was read                             | The commands re-read and retry once; otherwise re-run the command                 |
| `DESK_REJECTED` `desk_checks_failed` / `desk_checklist_incomplete`   | Content changed since the report, or an attestation is missing             | The desk command loops back to the report; it never bypasses the gate             |
| `AUTHOR_CONTEXT_UNAVAILABLE`                                         | `--author` slug unknown or inactive on that site                           | Use an existing author slug                                                       |
| `/publisher:publish` ends with the operation still `queued`          | The operations worker has not run                                          | Run `publication:next` (section 4), then `publisher operation get …`              |
| Image checks fail (`image.size`, `image.aspect`, `image.content`)    | Asset narrower than 1200×630, not roughly 16:9, or blank/placeholder       | The desk command re-sources per the press-images rules; supply `--image` if asked |

Every `publisher` call prints one JSON envelope (`schemaVersion`, `ok`,
`code`, …); the `publisher-cli` skill inside the plugin documents all codes.

## 7. Security model

- The token lives in the OS keychain (`sensitive` plugin setting). Plugin
  settings are not visible to Bash commands, so a `SessionStart` hook
  (`scripts/session-env.sh`) exports `PUBLISHER_ADMIN_ORIGIN` and
  `PUBLISHER_API_TOKEN` into the session's `CLAUDE_ENV_FILE`, which Claude
  Code sources before each Bash command. The token therefore exists in that
  per-session file while a session runs. The hook prints nothing and refuses
  values containing a line break.
- The bundled CLI reads credentials only from those two variables, never
  accepts a token as an argument, and never prints it. The repository's
  harness scan fails if any plugin file passes the token as a command-line
  argument or references the token setting outside the hook.
- The plugin has editorial authority only: it can create, edit, approve, and
  publish posts on the sites its key allows. It cannot deploy, reach a
  database or bucket, or change site configuration beyond the CLI's
  site-scoped commands. Use a key with the `editor` role for a drafting-only
  workstation; publish then returns `403`.
- The reviewer agent is read-only (`Write`/`Edit` disallowed) and is
  instructed never to run `desk approve`, `post update`, or `publish`;
  approval happens once, in the main session, with the reviewer's evidence
  attached.
- Drafting reads arbitrary web pages. Instructions found on those pages are
  data, not commands; the skills say so, but keep the key scoped to the sites
  and role the workstation actually needs.

## 8. Uninstall

Open `/plugin`, select Publisher Desk, and choose Uninstall — or from a shell:

```bash
claude plugin uninstall publisher@publisher
```

```bash
claude plugin marketplace remove publisher
```

Ask the admin owner to remove the key record from `ADMIN_AUTOMATION_KEYS`
when the workstation is retired; deleting the plugin does not revoke the key.

## 9. Development

- `pnpm --filter @publisher/claude-plugin build` bundles
  `packages/ops-cli/bin/publisher.mjs` into `bin/publisher` (committed) and
  regenerates the command table in `skills/publisher-cli/SKILL.md`. The
  bundle depends on the pinned esbuild version; bumping esbuild requires a
  rebuild.
- `pnpm --filter @publisher/claude-plugin test` runs the bundle and hook tests.
- `pnpm harness:scan` fails when the bundle or table is stale, when a command
  or skill mentions a `publisher` command the CLI does not have, or when a
  credential appears anywhere but the hook.
- Local trial without installing: `claude --plugin-dir packages/claude-plugin`
  with `PUBLISHER_ADMIN_ORIGIN` and `PUBLISHER_API_TOKEN` exported in the
  shell (with `--plugin-dir` the hook runs but writes nothing because there
  are no saved plugin settings). To test the real install path, add the
  checkout as a local marketplace: `claude plugin marketplace add <path>`.
- Layout: `commands/` (the five slash commands), `skills/` (`publisher-cli`,
  `editorial-desk`, `press-images`), `agents/desk-reviewer.md`,
  `hooks/hooks.json` + `scripts/session-env.sh`, `scripts/build.mjs`,
  `bin/publisher`, `test/`. Archive commands (`content inspect`,
  `content restore`) are not bundled.
