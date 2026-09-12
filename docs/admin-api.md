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

The v1 routes always address the configured `default` site. Multi-site
automation uses `/api/v2/sites/{siteId}/...` and a
key whose `sites` allow-list contains that exact site ID. A missing allow-list
never means access to every site.

Set `ADMIN_SITES_JSON` to describe additional sites. Each entry contains
`siteId`, `name`, `canonicalOrigin`, and `themeId`; an optional
`adminEmails` array limits the browser admin selector to those application-owned
administrator accounts. An owner account always has access.

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
  "$PUBLISHER_API_URL/api/v1/posts?limit=20&offset=0"
```

The browser-oriented `/api/*` routes and the machine-oriented `/api/v1/*`
routes are separate contracts. The machine API does not use browser cookies or
browser CORS.

## Endpoint and role summary

| Method   | Path                    | Minimum role | Purpose                                         |
| -------- | ----------------------- | ------------ | ----------------------------------------------- |
| `GET`    | `/api/v1/posts`         | editor       | Paginated content list                          |
| `POST`   | `/api/v1/posts`         | editor       | Create a validated draft                        |
| `GET`    | `/api/v1/posts/:id`     | editor       | Read one record and revision                    |
| `PATCH`  | `/api/v1/posts/:id`     | editor       | Revision-safe update using `If-Match`           |
| `DELETE` | `/api/v1/posts/:id`     | editor       | Revision-safe deletion                          |
| `GET`    | `/api/v1/tags`          | editor       | List managed tags                               |
| `POST`   | `/api/v1/tags`          | editor       | Create a managed tag                            |
| `GET`    | `/api/v1/tags/:slug`    | editor       | Read a managed tag                              |
| `PATCH`  | `/api/v1/tags/:slug`    | editor       | Rename a tag with `If-Match`                    |
| `DELETE` | `/api/v1/tags/:slug`    | editor       | Archive a tag with `If-Match`                   |
| `GET`    | `/api/v1/settings`      | editor       | Read publication identity and canonical origin  |
| `PATCH`  | `/api/v1/settings`      | editor       | Update publication settings with `If-Match`     |
| `GET`    | `/api/v1/authors`       | editor       | List managed author profiles                    |
| `POST`   | `/api/v1/authors`       | editor       | Create an author with a stable slug             |
| `GET`    | `/api/v1/authors/:slug` | editor       | Read one author and revision                    |
| `PATCH`  | `/api/v1/authors/:slug` | editor       | Edit an author without changing its slug        |
| `DELETE` | `/api/v1/authors/:slug` | editor       | Archive an author with `If-Match`               |
| `POST`   | `/api/v1/publish`       | publisher    | Create a snapshot and enqueue an idempotent job |

Article locale operations use the same editor key:

| `GET` | `/api/v1/articles/:id` | editor | Read all locale variants |
| `PUT` | `/api/v1/articles/:id` | editor | Add or update one locale with `If-Match` |
| `DELETE` | `/api/v1/articles/:id?locale=ko-KR` | editor | Remove a locale with `If-Match` |

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

1. `GET /api/v1/posts?limit=20&offset=0` to discover records and revisions.
2. `GET /api/v1/settings`, `/api/v1/authors`, and `/api/v1/tags` to discover
   the current publication identity and valid author/tag slugs.
3. `POST /api/v1/tags` to create a tag, or `PATCH /api/v1/tags/:slug` to rename
   one with its current revision. `DELETE` archives a tag; it remains readable
   on existing posts but cannot be newly assigned.
4. `POST /api/v1/posts` to create validated content with an active
   `authorSlug`, SEO title/description, and one of `draft`, `review`,
   `scheduled`, or `published`; or `PATCH` an existing post with
   `If-Match: <revision>`.
5. If the revision is stale, reload the post and reconcile instead of
   overwriting another update.
6. `POST /api/v1/publish` with a publisher key and unique `Idempotency-Key`.
7. Verify the `202` response's `snapshotId`, checksum, `jobId`, and
   `jobStatus: queued`. The schema-version 4 snapshot contains publication
   settings, active authors/tags, published/due content, public-safe plugin
   projection, and approved logical media references.
8. Run the repository-owned publication worker. A job becomes `published` only
   after candidate checksum verification and compare-and-swap activation.

Example:

```bash
export PUBLISHER_API_URL=https://admin.publisher.com
export PUBLISHER_API_TOKEN='store-this-outside-the-repository'

curl --fail-with-body \
  -H "Authorization: Bearer $PUBLISHER_API_TOKEN" \
  "$PUBLISHER_API_URL/api/v1/posts?limit=20&offset=0"

curl --fail-with-body -X POST \
  -H "Authorization: Bearer $PUBLISHER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "slug": "new-report",
    "title": "New report",
    "excerpt": "A short summary.",
    "bodyHtml": "<p>Validated article body.</p>",
    "author": "Example Editor",
    "authorSlug": "example-editor",
    "seoTitle": "New report",
    "seoDescription": "A short summary for search and social previews.",
    "status": "review",
    "publishedAt": "2026-08-21T00:00:00.000Z",
    "categories": ["Platforms"],
    "featured": false
  }' \
  "$PUBLISHER_API_URL/api/v1/posts"
```

The complete request/response contract is in
[`admin-api.openapi.yaml`](./admin-api.openapi.yaml). Body HTML is sanitized by
the shared content validation boundary; scripts, iframes, event handlers, and
`javascript:` URLs are removed or neutralized.

Publication settings are a single managed record per deployment. Changing the
canonical origin is a migration operation: update existing post `sourceUrl`
values to that origin before editing those posts. Author and tag slugs are
stable identifiers; archive them instead of renaming slugs. An author can be
archived only after every assigned post is moved to another author, which keeps
all public byline links resolvable.
