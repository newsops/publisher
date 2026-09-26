---
name: publisher-cli
description: Reference for the bundled publisher CLI — command list, JSON envelope, exit codes, and credential rules. Use whenever a command or skill runs `publisher`.
---

# publisher CLI

`publisher` is on the Bash PATH while this plugin is enabled (it is
`bin/publisher`, a bundle of the workspace CLI). It talks only to the admin's
automation API; it never reaches a database, object store, or hosting provider.

## Invocation rules

- Always pass `--json` and, for mutations, `--non-interactive`. Parse stdout as
  one JSON object.
- Credentials come only from the environment: `PUBLISHER_ADMIN_ORIGIN` and
  `PUBLISHER_API_TOKEN`, exported by the plugin's SessionStart hook from the
  plugin settings. Never pass a token as an argument, never print
  `$PUBLISHER_API_TOKEN`, never write it to a file.
- Mutations on an existing record take `--revision <n>`; read the current
  revision first (`desk report` returns `revision`; `post update` returns
  `post.revision`) and retry once on `revision_conflict`.
- `doctor` only checks that the two variables are set; `site list` is the first
  call that proves connectivity.
- `content inspect` and `content restore` are not bundled in the plugin CLI.

## Envelope

Every result is `{ "schemaVersion": 1, "ok": boolean, "code": string, ... }`.
Those three envelope fields are authoritative — payload keys never overwrite
them. Remote failures also carry `clientCode`, the admin client's own
classification (`REMOTE_ERROR` or `MALFORMED_RESPONSE`); branch on the envelope
`code` first and read `clientCode` only to explain the failure.

| `code`                             | Meaning                                                                                                                                                                                        | Exit | What to do                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------- |
| `USAGE`, `INPUT_REQUIRED`          | Wrong or missing arguments (`field` names the option)                                                                                                                                          | 10   | Fix the invocation                                         |
| `NON_INTERACTIVE_REQUIRED`         | A mutation was attempted without `--non-interactive`                                                                                                                                           | 10   | Add the flag                                               |
| `CONFIGURATION_REQUIRED`           | `missing` lists unset environment variables                                                                                                                                                    | 20   | Tell the user to set plugin settings, then retry           |
| `REMOTE_ERROR`                     | Admin refused: `status` and `body.error.code` (e.g. `revision_conflict`, `validation_failed`); `clientCode: "MALFORMED_RESPONSE"` with a 2xx `status` and no `body` means the reply was not JSON; without `status` and with `retryable: true` the admin was unreachable — retry once, then report | 30   | Branch on `body.error.code`                                |
| `DESK_REJECTED`                    | Desk gate failed: `body.error.code` `desk_checks_failed` or `desk_checklist_incomplete`                                                                                                        | 30   | Run the improvement loop (editorial-desk skill)            |
| `AUTHOR_CONTEXT_UNAVAILABLE`       | `post plan`/`post create`: the `--author` slug is unknown or inactive                                                                                                                          | 30   | Ask the user for a valid author slug                       |
| `AUTHORITY_REQUIRED`               | A human must act (device login, `publish --requires-authority`)                                                                                                                                | 40   | Stop and report                                            |
| `READY`                            | `doctor` (variables set) or `status` (`state.site` lists sites)                                                                                                                                | 0    | Continue                                                   |
| `DESK_QUEUE`                       | `desk list`: `posts[]` with `id`, `revision`, `status`, `review`                                                                                                                               | 0    | Continue                                                   |
| `DESK_REPORT`                      | `desk report`: `revision`, `report.checks[]`, `report.checklist[]`, `report.approvalValid`                                                                                                     | 0    | Fix non-`pass` checks, then approve                        |
| `DESK_APPROVED`                    | `desk approve` accepted: top-level `revision`, `status`, `report`                                                                                                                              | 0    | Continue                                                   |
| `POST_UPDATED`, `POST_CREATED`     | `post.id`, `post.revision`, `post.status`                                                                                                                                                      | 0    | Continue                                                   |
| `POST`                             | `post get`: `post` with `bodyMarkdown`, `revision`, `status`, `imageUrl`                                                                                                                       | 0    | Continue                                                   |
| `MEDIA_APPROVED`, `MEDIA_UPLOADED` | `media upload` (`MEDIA_UPLOADED` when `--pending`) / `media approve`: `media.id`, `media.variants[].publicPath`                                                                                | 0    | Use the widest variant as `imageUrl`                       |
| `OPERATION_ACCEPTED`               | `publish` accepted: `operationId`                                                                                                                                                              | 0    | `publisher operation get <operationId> --site <id> --json` |
| `OPERATION`                        | `operation get`: `state.operation.status` (`published`, `failed`, …); `state.operation.terminal` is true when done                                                                             | 0    | Poll until terminal                                        |

Other `ok: true` codes (`SITES`, `POST_SUBMITTED`, `DESK_CHANGES_REQUESTED`, `MEDIA_UPLOADED`, …) exit 0 and carry the admin response body.

## Commands

<!-- publisher-usage:start -->

| Command | Usage |
| --- | --- |
| `doctor` | `doctor` |
| `site list` | `site list` |
| `site create` | `site create --site <id> --name <name> --canonical-origin <origin> --non-interactive` |
| `site bootstrap` | `site bootstrap --site <id> --non-interactive` |
| `site guidance get` | `site guidance get --site <id> --json` |
| `site guidance set` | `site guidance set --site <id> --file <path> --revision <n> --non-interactive --json` |
| `site update` | `site update --site <id> --input <site.json> --non-interactive --json` |
| `site archive` | `site archive --site <id> --non-interactive --json` |
| `settings get` | `settings get --site <id> --json` |
| `settings set` | `settings set --site <id> --input <settings.json> --revision <n> --non-interactive --json` |
| `taxonomy categories\|tags list` | `taxonomy categories\|tags list --site <id> --json` |
| `taxonomy categories\|tags create` | `taxonomy categories\|tags create --site <id> --name <name> [--slug <slug>] --non-interactive --json` |
| `author get` | `author get --site <id> --slug <author-slug> --json` |
| `post plan` | `post plan --site <id> --author <author-slug> --json` |
| `post get` | `post get --site <id> --post <post-id> --json` |
| `post create` | `post create --site <id> --input <post.json> [--author <author-slug>] --non-interactive --json` |
| `post update` | `post update --site <id> --post <post-id> --input <patch.json> --revision <n> [--author <author-slug>] --non-interactive --json` |
| `post submit` | `post submit --site <id> --post <post-id> --revision <n> --non-interactive --json` |
| `post delete` | `post delete --site <id> --post <post-id> --revision <n> --non-interactive --json` |
| `article get` | `article get --site <id> --article <post-id> --json` |
| `article set` | `article set --site <id> --article <post-id> --input <variant.json> --revision <n> --non-interactive --json` |
| `article remove` | `article remove --site <id> --article <post-id> --locale <tag> --revision <n> --non-interactive --json` |
| `plugin list` | `plugin list --site <id> --json` |
| `plugin get` | `plugin get --site <id> --plugin <plugin-id> --json` |
| `plugin install` | `plugin install --site <id> --plugin <plugin-id> [--input <configuration.json>] --non-interactive --json` |
| `plugin configure` | `plugin configure --site <id> --plugin <plugin-id> --input <configuration.json> --revision <n> --non-interactive --json` |
| `plugin validate\|enable\|disable` | `plugin validate\|enable\|disable --site <id> --plugin <plugin-id> --revision <n> [--input <configuration.json>] --non-interactive --json` |
| `media upload` | `media upload --site <id> --file <path> --mime-type <type> [--pending] --non-interactive --json` |
| `media approve` | `media approve --site <id> --media <media-id> --non-interactive --json` |
| `desk list` | `desk list --site <id> --json` |
| `desk report` | `desk report --site <id> --post <post-id> --json` |
| `desk approve` | `desk approve --site <id> --post <post-id> --revision <n> --check <item-id>... \| --checklist-file <path> [--note <text>] --non-interactive --json` |
| `desk request-changes` | `desk request-changes --site <id> --post <post-id> --revision <n> --note <text> --non-interactive --json` |
| `status` | `status` |
| `publish` | `publish` |
| `operation get` | `operation get` |
| `auth login` | `auth login --device` |
| `embed x resolve` | `embed x resolve --site <id> --url <canonical-x-status-url> --json` |

<!-- publisher-usage:end -->
