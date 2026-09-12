# Static boundary

`apps/site` must remain exportable as static files.

- No server actions, API routes, runtime secrets, database SDKs, or request-time content fetches.
- Search and load-more interactions use a build-generated index or pre-rendered routes.
- All route parameters required for export must be declared by `generateStaticParams`.
- Content changes publish through a new build; the CDN never becomes the source of truth.
