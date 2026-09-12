# Controlled publication plugins

## Operating model

Plugins are reviewed adapters bundled with the platform source. They are not
uploaded archives, marketplace packages, arbitrary remote scripts, or runtime
callbacks. An installation belongs to one site, has a monotonic revision, and
is configured through the authenticated admin surface or the site-scoped
automation API.

The public publication is still a static CDN artifact. At publish time, only
enabled adapters and public-safe configuration are projected into a
schema-version 4 content snapshot. The publication worker materializes that
projection as a versioned build input. The build validates and
embeds typed tokens; it does not call the admin service, database, plugin
endpoint, or configuration service when a reader requests a page.

## Current registry

| Plugin ID              | Purpose                                                                | Public contribution                                                                                               |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| platform.static-marker | Safe internal fixture that proves the registry and named-slot boundary | One metadata token and an optional article-footer label                                                           |
| google.analytics       | GA4 traffic measurement under the basic-consent contract               | Platform-owned local loader; it adds the asynchronous Google tag only after the approved analytics-consent signal |

The marker is not analytics, advertising, or an operator code-injection
facility. It is the deliberately harmless reference adapter used to verify
installation, configuration, enablement, snapshot projection, static rendering,
and disable behavior.

Google Analytics is a reviewed adapter, not a layout snippet. Google AdSense
remains a separate draft adapter specification (INFRA-004). Do not add either
provider script manually to a public layout.

## Google Analytics 4 consent contract

The `google.analytics` configuration accepts only a GA4 measurement ID
(`G-…`) and `consent: granted` or `consent: denied`. It rejects API keys,
credentials, arbitrary fields, URLs, HTML, and JavaScript. The measurement ID
is public; management credentials never belong in this configuration.

`denied` is the default and compiles no tag token or Google CSP source. With
`granted`, the static artifact contains only a platform-owned local loader and
the exact Google provider origins. That loader does **not** make a Google
request until the approved consent layer either sets
`window.__publisherConsent = { analytics: true }` before it runs or dispatches
`new CustomEvent('publisher:consent', { detail: { analytics: true } })`.
It safely ignores a denied or absent signal.

This is Google basic consent behavior: the platform does not ship a consent
banner, infer consent, or use advanced Consent Mode/cookieless pings. Operators
must connect an approved CMP or consent UI, document its signal integration,
and disable or publish `denied` until that work is verified. See Google's
[basic vs. advanced consent guidance](https://developers.google.com/tag-platform/security/concepts/consent-mode)
and [gtag.js setup requirements](https://developers.google.com/tag-platform/gtagjs).

## Installation and release

1. In the admin UI, choose a reviewed adapter, enter its validated non-secret
   configuration, and save. The record becomes configured.
2. Use Validate to inspect field diagnostics. Invalid configuration must not be
   enabled.
3. Enable the adapter with its current revision. A stale revision must be
   reloaded and reconciled instead of overwritten.
4. Publish the site. The resulting schema-version 4 snapshot contains only enabled,
   public-safe installation configuration.
5. The release system supplies that public projection to the static site build
   and runs the static build. The build generates only declared head/slot
   contributions and extends output CSP from the exact registry allow-list.
6. Verify a representative article, feed, sitemap, browser console, and static
   output before releasing the CDN artifact.

Disabling follows the same revision-safe flow. Publish a new snapshot and
static artifact; do not mutate the already deployed artifact.

## Multiple-site cloning

A clone operation is explicit: the destination operator chooses approved plugin
IDs. The clone creates disabled destination records with copied public
configuration only. It never copies secret references, secret values, enabled
state, provider approval, or a source site's release artifact. The destination
must validate, enable, publish, and verify each adapter independently.

## Secrets and rotation

Plugin configuration stores public-safe fields and references to secret material
separately. The browser UI, automation reads, publish snapshot, HTML, feeds,
sitemap, public JSON, and logs must never reveal the secret value or reference
name. Provider credentials belong in the deployment secret store.

To rotate a provider credential, create the replacement secret in the provider
and deployment secret store, update the private reference through a protected
administrative change, validate the adapter, publish a new static artifact, and
revoke the old provider credential only after the release is verified. Never
place a credential in a measurement ID, publisher ID, slot ID, issue, or commit.

## Provider outage and ad blocking

Third-party integrations are optional enhancements. A provider timeout,
network block, consent denial, ad blocker, malformed third-party response, or
provider outage must leave the static page, article text, navigation, search,
feed, sitemap, canonical URLs, robots rules, JSON-LD, and cached CDN response
available.

When diagnosing an outage, first disable the adapter for the affected site and
publish a new static artifact. Confirm the public release is healthy without
the contribution, then investigate the provider configuration out of band.
Rollback means selecting the prior validated installation configuration and
publishing a new artifact; it does not restore private values from a public
snapshot.

## Static safety checklist

- Never add a plugin route, public server action, database import, runtime
  configuration fetch, open proxy, or per-reader personalization.
- Never accept raw HTML, inline event handlers, arbitrary script URLs, wildcard
  script/connect origins, or a marketplace install.
- Keep plugin ownership out of canonical URLs, robots, sitemaps, feeds,
  structured news metadata, article bodies, and editorial workflow.
- Test disabled, consent-off, blocked, and failed behavior at desktop and
  mobile widths before enabling a new provider adapter.
- Treat platform configuration as distinct from Google account/site approval,
  advertising policy compliance, and jurisdiction-specific consent obligations.

## Rollback decision

Disable an adapter and republish when any of these is true:

- static output includes an undeclared origin, secret sentinel, raw markup, or
  duplicated SEO metadata;
- a provider failure affects page rendering, navigation, content visibility,
  keyboard access, console health, or layout stability;
- site authorization, revision checks, clone isolation, or public snapshot
  secrecy fail; or
- the operator cannot verify provider ownership, policy, or consent conditions.

The static public site remains available throughout this workflow because no
anonymous request depends on plugin management or provider availability.
