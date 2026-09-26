# News platform automation API

The admin automation API is a versioned server-to-server REST interface for
Claude and other automation clients. It is served from the separate admin
origin and does not change the browser-oriented `/api/*` routes.

## Configure an automation key

Generate a secret locally:

```bash
corepack pnpm admin:api-key claude publisher
```

Store the printed `envFragment` as the server-only `ADMIN_AUTOMATION_KEYS`
secret. Keep the printed `token` in the automation client's secret store. The
repository and audit logs contain only the SHA-256 digest and key ID.

When a provider cannot reveal the existing encrypted primary value, add a
separately rotated record to `ADMIN_AUTOMATION_KEYS_EXTRA` instead of replacing
the primary keyring. It uses the identical JSON schema, is validated with the
primary ring, and duplicate key IDs fail closed. After verifying the new
site-scoped client, retire an old record in a later controlled rotation.

The generator prints the raw token once. Do not paste it into Git, issue
trackers, chat transcripts, or audit logs. For local development, copy only the
`envFragment` into the admin process environment and keep the raw `token` in
the shell or client secret store. For production, add the same fragment to the
selected runtime's secret store and rotate by generating a new key, updating
the secret, and removing the old record.

The `publisher` role can do everything the `editor` role can do and can call
the publish endpoint. An `editor` key can manage drafts but receives `403` from
publish.

## Multiple sites

Every automation endpoint is site-qualified at
`/api/v2/sites/{siteId}/...`. The PostgreSQL site registry is the sole
runtime catalog for publication identity, lifecycle state, and canonical
origin. An automation key must include the exact `siteId` in its `sites`
allow-list; a missing allow-list never means access to every site.

Create a site through `POST /api/v2/sites`, then initialize its empty
editorial state through `POST /api/v2/sites/{siteId}/bootstrap`. No
environment-variable catalog or default-site compatibility route exists.

## Local API smoke test

Start the admin server on a separate port with an isolated local repository:

```bash
corepack pnpm admin:api-key local-claude publisher
# Copy the printed envFragment into ADMIN_AUTOMATION_KEYS.
ADMIN_AUTOMATION_KEYS='[...]' \
ADMIN_DATA_DIR=/tmp/publisher-admin-api \
ADMIN_PUBLIC_ORIGIN=http://localhost:3001 \
corepack pnpm --dir apps/admin exec next dev -p 3001
```

Use the printed token in a separate shell:

```bash
export PUBLISHER_API_URL=http://localhost:3001
export PUBLISHER_API_TOKEN='the-one-time-token-from-the-generator'
curl --fail-with-body \
  -H "Authorization: Bearer $PUBLISHER_API_TOKEN" \
  "$PUBLISHER_API_URL/api/v2/sites/{siteId}/posts?limit=20&offset=0"
```

The browser-oriented `/api/*` routes and the machine-oriented `/api/v2/sites/{siteId}/*`
routes are separate contracts. The machine API does not use browser cookies or
browser CORS.

## Browser media library

The authenticated human dashboard provides the browser media workflow. Its
site-scoped `GET /api/media` response contains only verified metadata and,
after approval, public-path variant metadata. It never returns object-store
credentials, endpoints, original-object keys, or original bytes. The dashboard
uploads through same-origin `POST /api/media`, explicitly generates variants
through `POST /api/media/{id}/approve`, and streams an approved preview only
through the authenticated `GET /api/media/{id}/preview?variant={sha256}` route.

Selecting a variant changes unsaved editorial state only. Saving the post and
creating a publication snapshot remain separate explicit actions. Agents must
use the versioned CLI/API contract, rather than browser controls, for their
equivalent operations.

## Surfaces

The admin exposes one set of capabilities through three surfaces that share
the same services and rules (see `.agents/rules/layer-boundaries.md` and the
capability registry `scripts/harness/surface-map.json`):

| Surface        | Caller             | Identity                                  | Path                                   |
| -------------- | ------------------ | ----------------------------------------- | -------------------------------------- |
| Admin page     | Human in a browser | Local account session cookie, same-origin | `/api/**` (browser routes)             |
| Automation API | Agent, integration | Bearer automation key with `sites[]`      | `/api/v2/sites/{siteId}/**` (this doc) |
| CLI            | Operator shell     | `PUBLISHER_API_TOKEN` via admin-client    | `publisher …` → Automation API         |

A capability is available on every surface unless the registry declares it
exclusive with a reason (accounts, sessions, and comment moderation are
browser-only; build-job polling and archive restore are automation-only;
`doctor` and `auth login` are CLI-only). Every `v2` route must appear in
`admin-api.openapi.yaml`; `pnpm harness:scan` fails otherwise.

## Endpoint and role summary

| Method   | Path                                      | Minimum role | Purpose                                         |
| -------- | ----------------------------------------- | ------------ | ----------------------------------------------- |
| `GET`    | `/api/v2/sites/{siteId}/posts`            | editor       | Paginated content list                          |
| `POST`   | `/api/v2/sites/{siteId}/posts`            | editor       | Create a validated draft                        |
| `GET`    | `/api/v2/sites/{siteId}/posts/:id`        | editor       | Read one record and revision                    |
| `PATCH`  | `/api/v2/sites/{siteId}/posts/:id`        | editor       | Revision-safe update using `If-Match`           |
| `DELETE` | `/api/v2/sites/{siteId}/posts/:id`        | editor       | Revision-safe deletion                          |
| `GET`    | `/api/v2/sites/{siteId}/tags`             | editor       | List managed tags                               |
| `POST`   | `/api/v2/sites/{siteId}/tags`             | editor       | Create a managed tag                            |
| `GET`    | `/api/v2/sites/{siteId}/tags/:slug`       | editor       | Read a managed tag                              |
| `PATCH`  | `/api/v2/sites/{siteId}/tags/:slug`       | editor       | Rename a tag with `If-Match`                    |
| `DELETE` | `/api/v2/sites/{siteId}/tags/:slug`       | editor       | Archive a tag with `If-Match`                   |
| `GET`    | `/api/v2/sites/{siteId}/categories`       | editor       | List primary categories                         |
| `POST`   | `/api/v2/sites/{siteId}/categories`       | editor       | Create a primary category                       |
| `GET`    | `/api/v2/sites/{siteId}/categories/:slug` | editor       | Read a category                                 |
| `PATCH`  | `/api/v2/sites/{siteId}/categories/:slug` | editor       | Rename a category with `If-Match`               |
| `DELETE` | `/api/v2/sites/{siteId}/categories/:slug` | editor       | Archive a category with `If-Match`              |
| `GET`    | `/api/v2/sites/{siteId}/settings`         | editor       | Read publication identity and canonical origin  |
| `PATCH`  | `/api/v2/sites/{siteId}/settings`         | editor       | Update publication settings with `If-Match`     |
| `GET`    | `/api/v2/sites/{siteId}/agent-guidance`   | editor       | Read private operator context for agents        |
| `PATCH`  | `/api/v2/sites/{siteId}/agent-guidance`   | editor       | Revision-safe private guidance update           |
| `GET`    | `/api/v2/sites/{siteId}/authors`          | editor       | List managed author profiles                    |
| `POST`   | `/api/v2/sites/{siteId}/authors`          | editor       | Create an author with a stable slug             |
| `GET`    | `/api/v2/sites/{siteId}/authors/:slug`    | editor       | Read one author and revision                    |
| `PATCH`  | `/api/v2/sites/{siteId}/authors/:slug`    | editor       | Edit an author without changing its slug        |
| `DELETE` | `/api/v2/sites/{siteId}/authors/:slug`    | editor       | Archive an author with `If-Match`               |
| `POST`   | `/api/v2/sites/{siteId}/publish`          | publisher    | Create a snapshot and enqueue an idempotent job |
| `GET`    | `/api/v2/sites/{siteId}/posts/:id/desk`   | editor       | Desk report: checks, checklist, guidance, state |
| `POST`   | `/api/v2/sites/{siteId}/posts/:id/desk`   | publisher    | `approve` or `request-changes` with `If-Match`  |
| `GET`    | `/api/v2/sites`                           | editor       | List active publications                        |
| `POST`   | `/api/v2/sites`                           | publisher    | Create a publication                            |
| `GET`    | `/api/v2/sites/{siteId}`                  | editor       | Read one publication                            |
| `PATCH`  | `/api/v2/sites/{siteId}`                  | publisher    | Update name, canonical origin, or theme         |
| `DELETE` | `/api/v2/sites/{siteId}`                  | publisher    | Archive a publication                           |
| `POST`   | `/api/v2/sites/{siteId}/bootstrap`        | publisher    | Create the empty content state                  |
| `POST`   | `/api/v2/sites/{siteId}/media`            | publisher    | Upload a pending image (multipart `file`)       |
| `PUT`    | `/api/v2/sites/{siteId}/media`            | publisher    | Approve pending media by `mediaId`              |
| `POST`   | `/api/v2/sites/{siteId}/embeds/x`         | editor       | Resolve an X post URL into a static embed       |
| `GET`    | `/api/v2/sites/{siteId}/operations/:id`   | publisher    | Build job or archive-restore operation state    |
| `POST`   | `/api/v2/sites/{siteId}/content-restore`  | publisher    | Restore a local archive with `Idempotency-Key`  |

Article locale operations use the same editor key:

| `GET` | `/api/v2/sites/{siteId}/articles/:id` | editor | Read all locale variants |
| `PUT` | `/api/v2/sites/{siteId}/articles/:id` | editor | Add or update one locale with `If-Match` |
| `DELETE` | `/api/v2/sites/{siteId}/articles/:id?locale=ko-KR` | editor | Remove a locale with `If-Match` |

All machine responses use `Cache-Control: no-store` and `X-Request-Id`.

The v2 site-scoped endpoints are GET|POST /api/v2/sites/{siteId}/posts,
`GET|PUT|DELETE /api/v2/sites/{siteId}/posts/{id}`, and
POST /api/v2/sites/{siteId}/publish. Plugin automation uses GET|POST
/api/v2/sites/{siteId}/plugins, GET|PATCH /api/v2/sites/{siteId}/plugins/{pluginId},
and POST to that plugin path with an explicit validate, enable, or disable
action. Mutations require the installation's If-Match revision. Plugin read
responses expose validated non-secret configuration plus hasSecretReferences;
they never return secret references or values. Site-scoped snapshots use the
logical key `sites/{siteId}/snapshots/{snapshotId}.json` in the configured
S3-compatible store. A build job is scoped to the same site and never falls
back to another site's data. API payloads retain logical IDs/keys and do not
expose the selected infrastructure provider.

## Authentication and response policy

Send the token on every request:

```http
Authorization: Bearer xrtn_...
```

The API is server-to-server: it does not accept the browser development token,
cookies, or cross-origin browser requests. Responses are `Cache-Control:
no-store` and include `X-Request-Id`. Errors use this shape:

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "The post changed; reload it before updating or deleting",
    "requestId": "..."
  }
}
```

## Content workflow

1. `GET /api/v2/sites/{siteId}/posts?limit=20&offset=0` to discover records and revisions.
2. `GET /api/v2/sites/{siteId}/settings`, `/api/v2/sites/{siteId}/authors`, and `/api/v2/sites/{siteId}/tags` to discover
   the current publication identity and valid author/tag slugs.
3. `POST /api/v2/sites/{siteId}/tags` to create a tag, or `PATCH /api/v2/sites/{siteId}/tags/:slug` to rename
   one with its current revision. `DELETE` archives a tag; it remains readable
   on existing posts but cannot be newly assigned.
4. `POST /api/v2/sites/{siteId}/posts` to create validated content with an active
   `authorSlug`, SEO title/description, and one of `draft`, `review`,
   `scheduled`, or `published`; or `PATCH` an existing post with
   `If-Match: <revision>`.
5. If the revision is stale, reload the post and reconcile instead of
   overwriting another update.
6. Before a post can be `published` or `scheduled`, `GET
/api/v2/sites/{siteId}/posts/:id/desk` for the report and `POST` the same
   path with `If-Match` and `{ "action": "approve", "checklist": [{ "id",
"checked": true }...], "note" }`. Every automated check must pass and every
   checklist item must be attested; otherwise the response is `409` with
   `desk_checks_failed` or `desk_checklist_incomplete` and the report. `{
"action": "request-changes", "note" }` records feedback. Editing the
   content afterwards returns the post to `pending`, and a `published` save
   without a valid approval fails with `validation_failed`.
7. `POST /api/v2/sites/{siteId}/publish` with a publisher key and unique `Idempotency-Key`.
8. Verify the `202` response's `snapshotId`, checksum, `jobId`, and
   `jobStatus: queued`. The schema-version 4 snapshot contains publication
   settings, active authors/tags, published/due content, public-safe plugin
   projection, and approved logical media references.
9. Run the repository-owned publication worker. A job becomes `published` only
   after candidate checksum verification and compare-and-swap activation.

Example:

```bash
export PUBLISHER_API_URL=https://admin.publisher.com
export PUBLISHER_API_TOKEN='store-this-outside-the-repository'

curl --fail-with-body \
  -H "Authorization: Bearer $PUBLISHER_API_TOKEN" \
  "$PUBLISHER_API_URL/api/v2/sites/{siteId}/posts?limit=20&offset=0"

curl --fail-with-body -X POST \
  -H "Authorization: Bearer $PUBLISHER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "slug": "new-report",
    "title": "New report",
    "excerpt": "A short summary.",
    "bodyMarkdown": "Validated article body.\n\n:::figure{src=\"/media/report.webp\" alt=\"Report illustration\" creditName=\"Example\" creditUrl=\"https://example.test/source\"}\nImage caption.\n:::",
    "author": "Example Editor",
    "authorSlug": "example-editor",
    "seoTitle": "New report",
    "seoDescription": "A short summary for search and social previews.",
    "status": "review",
    "publishedAt": "2026-08-21T00:00:00.000Z",
    "categories": ["Platforms"],
    "featured": false
  }' \
  "$PUBLISHER_API_URL/api/v2/sites/{siteId}/posts"
```

The complete request/response contract is in
[`admin-api.openapi.yaml`](./admin-api.openapi.yaml). `bodyMarkdown` is the
only editable document field. It accepts CommonMark plus non-executable
`figure` and `embed` directives; raw HTML, unsafe URLs, and unknown directives
are rejected. The platform derives sanitized static HTML at publication time.
Responses may include `bodyHtml` as a read-only derived publication projection;
clients must never send it as editable source.

Publication settings are a single managed record per deployment. Changing the
canonical origin is a migration operation: update existing post `sourceUrl`
values to that origin before editing those posts. Author and tag slugs are
stable identifiers; archive them instead of renaming slugs. An author can be
archived only after every assigned post is moved to another author, which keeps
all public byline links resolvable.
