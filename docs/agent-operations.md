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

Every `--json` result has `schemaVersion`, `ok`, and `code`. Those three
envelope fields are authoritative: payload keys never overwrite them, so a
`REMOTE_ERROR` keeps that `code` even when the admin client classified the
failure itself. The client's own classification travels as `clientCode`
(`REMOTE_ERROR` for a refused request with `status` and `body`;
`MALFORMED_RESPONSE` for a 2xx reply whose body was not JSON). Credentials are
read only from `PUBLISHER_API_TOKEN` and are never accepted as command-line
arguments or returned in JSON.

The admin service can merge a primary `ADMIN_AUTOMATION_KEYS` keyring with an
optional `ADMIN_AUTOMATION_KEYS_EXTRA` keyring. This permits narrowly scoped
rotation without replacing an encrypted primary provider secret; both rings
use the same record schema and duplicate key IDs fail closed.

```bash
publisher doctor --json --non-interactive
publisher status --json
publisher publish --idempotency-key release-20260912-01 --json
publisher operation get <operation-id> --json
publisher auth login --device --json
```

## Surfaces

`publisher` is the CLI surface of the admin. Every command wraps one
`@publisher/admin-client` method, which calls one Automation API operation
(`/api/v2/sites/{siteId}/**`); the admin page reaches the same services through
browser routes. `scripts/harness/surface-map.json` registers each capability
across the three surfaces and `pnpm harness:scan` fails when a command,
client method, or route is missing without a declared reason. Commands with
no server counterpart (`doctor`, `auth login`, `content inspect`) are
declared CLI-only there.

```bash
publisher settings get --site example --json
publisher settings set --site example --input ./settings.json --revision 2 --non-interactive --json
publisher site update --site example --input ./site.json --non-interactive --json
publisher post get --site example --post <post-id> --json
publisher post delete --site example --post <post-id> --revision 3 --non-interactive --json
publisher plugin list --site example --json
publisher plugin install --site example --plugin google.analytics --input ./plugin.json --non-interactive --json
publisher plugin enable --site example --plugin google.analytics --revision 1 --non-interactive --json
publisher article set --site example --article <post-id> --input ./variant.json --revision 4 --non-interactive --json
publisher media upload --site example --file ./hero.png --mime-type image/png --non-interactive --json
```

`media upload` approves the image and returns its public variants unless
`--pending` is given; `media approve --media <id>` approves a pending item.

## Claude Code plugin

`packages/claude-plugin` packages the CLI for Claude Code (PLUG-001). It is a
consumer of the CLI surface, not a fourth surface: `bin/publisher` is an
esbuild bundle of `packages/ops-cli/bin/publisher.mjs`, commands sequence CLI
calls, and skills carry the editorial rules. `scan-plugin-contract.mjs` fails
`pnpm harness:scan` when the bundle is stale or a command references a CLI
command that does not exist. Install with
`/plugin marketplace add newsops/publisher` and
`/plugin install publisher@publisher`; the plugin's README documents the
credential flow. Archive commands (`content inspect`, `content restore`) are
not bundled.

## Per-publication guidance

An operator can retain private editorial instructions for each publication.
Agents retrieve this context before content restore and publish operations;
it is planning input, never an authorization bypass or public content.

```bash
publisher site guidance get --site example --json
publisher site guidance set --site example --file ./editorial-guidance.txt \
  --revision 1 --non-interactive --json
```

Guidance is excluded from snapshots, static HTML, feeds, and search indexes.

## Operated sites stay out of the program repository

The repository holds the Publisher program, never an operation
(`.agents/rules/repository-scope.md`). When you create or rename an operated
site, add its name, domain, site ID, author slugs, and admin host to your
private denylist in your checkout of the program, and set the same list as the
`PUBLISHER_PRIVATE_DENYLIST_TEXT` Actions secret of your repository:

```bash
corepack pnpm privacy:denylist add "<site name>" <site-domain> <site-id> \
  <author-slug> <admin-host>
corepack pnpm privacy:denylist count
gh secret set PUBLISHER_PRIVATE_DENYLIST_TEXT < ~/.config/publisher/private-denylist.txt
```

The command never prints a term. The file lives outside the repository
(`PUBLISHER_PRIVATE_DENYLIST`, or `~/.config/publisher/private-denylist.txt`)
with mode 600. The `commit-msg` and `pre-push` hooks and CI then reject the
terms in tracked files, commit messages, and pull-request text. Evidence from
an operated instance is recorded only as "verified on an operated instance;
evidence kept privately by the operator".

## Desk review before publication

A story reaches readers only with a desk approval bound to its current
content. The server refuses `status=published` or `scheduled` and excludes the
post from a snapshot until a `publisher` key or account approves it; a later
edit to the title, excerpt, body, image, author, taxonomy, or SEO fields
invalidates the approval automatically. Automated checks cannot be overridden:
a failing story is improved until every check passes.

Loop for an agent acting as author and desk:

```bash
publisher post submit --site example --post <post-id> --revision 3 \
  --non-interactive --json                       # draft -> review, returns the report
publisher desk report --site example --post <post-id> --json
publisher desk approve --site example --post <post-id> --revision 4 \
  --check facts-verified --check headline-accurate --check image-representative \
  --check seo-fields --check taxonomy-author --check site-guidance \
  --note "Checked against site guidance" --non-interactive --json
publisher post update --site example --post <post-id> --revision 5 \
  --input ./published.json --non-interactive --json  # {"status":"published"}
publisher publish --idempotency-key release-01 --json
```

`desk report` returns `checks` (each `pass`, `warn`, or `fail`), the
`checklist` items with their descriptions, the site guidance text, and the
current review state. `desk approve` fails with `DESK_REJECTED` and reason
`desk_checks_failed` or `desk_checklist_incomplete` when a check fails or an
item is not attested; fix the story, re-read the report, and approve again.
`desk request-changes --note` records feedback for the author. `desk list`
shows the stories waiting for the desk.

Automated checks: representative image present, resolvable in the media
library, at least 1200×630 with a 1.4–2.0 aspect ratio, not near-blank, and
not repeated as the first body figure; title 20–110 characters; excerpt
40–200; SEO title ≤ 70; SEO description 50–160; body ≥ 150 words with at
least one HTTPS source link or embed and a valid Markdown body; active author;
valid categories.

## Reporter personas and taxonomy

Each site separately manages required primary `categories` and optional article
`tags`. A reporter also has a private `editorialPersona`. It is returned only
by authenticated authoring APIs and the CLI planning/create commands; it is
not included in public author profiles, snapshots, static HTML, feeds, or
search data.

```bash
publisher taxonomy categories list --site second-site --json
publisher taxonomy tags create --site second-site --name OpenAI --non-interactive --json
publisher author get --site second-site --slug example-editor --json
publisher post plan --site second-site --author example-editor --json
publisher post create --site second-site --input ./article.json --non-interactive --json
```

The same verbs are available for both taxonomy collections:
`taxonomy categories|tags list|get|create|update|archive`. Author management
uses `author list|get|create|update|archive`; create/update reads an input JSON
file and update/archive require the observed `--revision`.

`post plan` and `post create` load the selected author's current persona before
the operation and return it as `authorContext`. Treat it as advisory editorial
input, never as permission to bypass source verification, validation, or
editorial review.

## Markdown editorial documents

`bodyMarkdown` is the sole writable article document field. Responses can
include read-only derived `bodyHtml` for publication inspection, but agents
must write CommonMark and can add an attributed image with:

```md
:::figure{src="/media/image.webp" alt="Concise image description" creditName="Source" creditUrl="https://source.example/image"}
Visible caption.
:::
```

The source and alternative text are required; a credit URL, when present, must
be HTTPS. X source cards are stored as `:::embed{provider="x" url="https://x.com/.../status/..." quote="..." authorName="..."}`. Both directives are validated before a revision-controlled API/CLI mutation and rendered to static semantic HTML; agents must never submit raw HTML.

The supported derived node set is paragraph, heading, list, block quote, code,
thematic break, link, figure, and X embed. Links must be relative paths or
HTTPS URLs. Plain Markdown image syntax is rejected so every published image
has the required accessible figure attribution contract. The server returns
canonical deterministic Markdown after validation.

## Archive recovery

`content restore` is the agent-first recovery path for a private archive kept
outside this repository. It is not a database client and it is not browser
automation. The archive directory contains `archive.json` plus only the
relative media files declared by its checksum. The CLI validates the manifest,
paths, byte sizes, and SHA-256 values locally; its inspection result exposes
only counts and an archive digest.

```bash
publisher content inspect --archive /secure/archive --json --non-interactive
publisher content restore --archive /secure/archive --site default \
  --expected-revision 1 --idempotency-key restore-20260913-01 \
  --non-interactive --json
```

Before the restore command, create and retain a logical PostgreSQL backup
outside the repository. Obtain the `expectedRevision` from an observed admin
state, and use a new idempotency key for distinct content. The server accepts
this initial restore mode only for an unchanged generic starter fixture; a
changed state, stale revision, missing approved media binding, or a replay key
bound to different archive content is rejected without activating a release.

For each declared image, the CLI uses the scoped Admin API to upload and
approve a checksum-addressed variant, then sends only the resulting media IDs
and variant hashes with the archive request. The archive's paths never reach
the server. The response has a durable restore operation ID and safe counts;
it does not print article bodies, local paths, asset bytes, credentials, or
private object keys.

After a successful restore, publish with a separate idempotency key, process
the immutable snapshot into a verified candidate directory, and use the
operator-selected static-host CLI to upload that directory. A browser remains
the parallel human editorial surface and the final public-result check; it is
not a required automation interface.

`AUTHORITY_REQUIRED` is a successful safety boundary, not an invitation to
retry with more privilege. A person must approve billing, production DNS,
destructive deletion, or a device authorization user code. The CLI reports
the required action without persisting an access token by default.
