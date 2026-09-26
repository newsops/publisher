# Plugin system evaluation for a static, multi-site publisher

**Status:** Phase 1 architecture decision
**Date:** 2026-09-11
**Scope:** Controlled extensions for Publisher public sites and the separate authenticated administration application.

## Decision context

Publisher serves its public publication as a static export through a CDN. That is a deliberate availability and DDoS-resilience boundary: anonymous requests must resolve to already-published files, rather than invoke an application server, database, runtime configuration service, or plugin callback.

The platform nevertheless needs repeatable, per-site integrations for analytics, advertising, and future API-authoring support. A direct provider-specific change in the public application would make configuration, cloning, disabling, and security review inconsistent between sites. Conversely, an open marketplace or uploaded-code model would introduce unreviewed supply-chain code and undermine deterministic static output.

This document evaluates relevant CMS extension patterns and fixes the Phase 1 plugin contract. It does not authorize deployment of Google Analytics or AdSense; those remain separate adapter specifications.

## Evaluation criteria

An adopted pattern must preserve all of the following:

1. **Static public delivery:** no plugin request-time code, database read, server action, public API route, or configuration fetch.
2. **Deterministic release artifact:** the same published site snapshot and registry version produce the same public contribution set.
3. **Multi-site isolation:** installation, configuration, authorization, revision, and release state are owned by exactly one site ID.
4. **Secret isolation:** browser and static outputs contain only public-safe configuration; credentials stay in an administration/deployment secret store and are never cloned implicitly.
5. **Failure containment:** third-party script failure, blocking, timeout, or provider outage cannot prevent articles, SEO metadata, feeds, search, or cached files from rendering.
6. **API-first editorial integrity:** extensions cannot silently alter article bodies, editorial state, canonical URLs, robots directives, sitemaps, or structured news metadata.

## CMS comparison

| System    | Useful pattern                                                                                                                                                                                                                                                                                                                                                | Why it is useful here                                                                                                                                                            | Rejected or constrained pattern                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WordPress | Stable plugin lifecycle and named action/filter extension points. [Plugin Basics](https://developer.wordpress.org/plugins/plugin-basics/) and [Hooks](https://developer.wordpress.org/plugins/hooks/) document activation/deactivation and explicit insertion points.                                                                                         | Adopt named extension points, installation states, diagnostics, and upgrade discipline.                                                                                          | Do not execute uploaded PHP, scan a plugins directory at runtime, permit arbitrary hook callbacks, or let an adapter change public routes/data. Those mechanisms assume an origin application runs on each visitor request. |
| Ghost     | Separation between public content delivery and privileged Admin API, with integrations/webhooks for external systems. The [Content API](https://docs.ghost.org/content-api) is cache-oriented and the [Admin API](https://docs.ghost.org/admin-api) is versioned and privileged.                                                                              | Adopt separate public and administration surfaces, versioned automation APIs, integration credentials that remain server-side, and explicit webhooks for external workflows.     | Do not make code injection or arbitrary tag snippets the default extension path; public script contributions must be typed and allow-listed by the platform.                                                                |
| Strapi    | A plugin has explicit administrative and server structure; server plugins can register routes/controllers. [Plugin creation](https://docs.strapi.io/cms/plugins-development/create-a-plugin) and [structure](https://docs.strapi.io/cms/plugins-development/plugin-structure) make this boundary visible.                                                     | Adopt explicit package structure, configuration validation, and administration-only management UI.                                                                               | Reject server route/controller/middleware extension on the public site. It turns anonymous page views into origin work and is incompatible with static export.                                                              |
| Payload   | Code-first, typed plugin composition. The [plugin overview](https://payloadcms.com/docs/plugins/overview) and [Plugin API](https://payloadcms.com/docs/plugins/plugin-api) support declared IDs, ordering, and cross-plugin dependencies.                                                                                                                     | Adopt code-installed definitions, stable IDs/versions, typed configuration, dependency checks, and deterministic registry ordering.                                              | Constrain composition so a plugin cannot mutate core content models, add public endpoints, or introduce runtime data dependencies without a separate architecture decision.                                                 |
| Directus  | Explicit extension manifest, host compatibility and extension types; it supports marketplace, npm, and local installation. See [Extensions](https://docs.directus.io/extensions/introduction), [installation](https://docs.directus.io/extensions/installing-extensions), and [creating extensions](https://docs.directus.io/extensions/creating-extensions). | Adopt manifest metadata, host-version compatibility checks, explicit enable/disable lifecycle, and the principle that isolation/sandboxing is a first-class operational concern. | Reject operator-installed marketplace/npm code in Phase 1. A customer-controlled install path would require a separate supply-chain, signing, sandboxing, and incident-response design.                                     |

### Result of the comparison

The common value is not “plugins” as arbitrary executable code. It is a reviewable contract: stable identity, declared capabilities, typed settings, controlled lifecycle, and clear public/admin separation. The static publisher must compile these declarations at release time rather than dispatch them when a reader requests a page.

## Threat model

| Asset or boundary                 | Threat                                                                                                                                               | Required control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry and plugin code          | Malicious, vulnerable, or incompatible adapter; dependency confusion; unreviewed update.                                                             | Repository-bundled, code-reviewed definitions only; stable ID/version; lockfile review; no uploaded archive, marketplace install, runtime import, or remote executable configuration.                                                                                                                                                                                                                                                                                                                                                                    |
| Installation configuration        | Invalid values, one site's configuration applied to another, lost updates, or an enable operation that leaves partial state.                         | Site-scoped installation record, schema validation, monotonic revision, optimistic concurrency via If-Match, validate-before-enable, and immutable published snapshot.                                                                                                                                                                                                                                                                                                                                                                                   |
| Secrets                           | Credentials exposed in HTML, JSON, feed, log, API response, clone export, or browser memory.                                                         | Split public-safe config from secret references; resolve references only in the admin/deployment environment; deny secret reads in automation/browser APIs; sentinel tests scan every public artifact; never clone secrets.                                                                                                                                                                                                                                                                                                                              |
| Public scripts                    | Arbitrary origin, script injection, inline event handler, CSP wildcard, blocking parse/render, or a third party becoming an availability dependency. | Typed head/slot tokens only; platform-owned React renderers; exact registry allow-list; no raw HTML; asynchronous, deferred, or explicit lazy behavior; generated static CSP; no wildcard script or connect sources; public page remains functional without the script.                                                                                                                                                                                                                                                                                  |
| Consent and privacy choices       | Measurement or advertising runs without an operator-declared consent policy; a change of consent is ignored.                                         | Adapter declares a consent category and does not load until its configured policy allows it. The operator must choose and configure an approved consent implementation; the platform makes no legal sufficiency claim. Google's [consent-mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode) distinguishes basic blocking before consent from advanced mode, which can send cookieless measurements while denied. Phase 1 defaults to basic blocking unless a later adapter spec explicitly approves another mode. |
| Advertising slots                 | Ad code overlaps content, creates accidental clicks, collapses layout, or dynamically mutates prohibited markup.                                     | Fixed, named placement policy owned by the platform; responsive layout testing; no raw ad HTML; reserve only policy-approved space; do not hide active units or cover content. Google documents [code modification restrictions](https://support.google.com/adsense/answer/1354736?hl=en) and [placement policies](https://support.google.com/adsense/answer/1346295?hl=en).                                                                                                                                                                             |
| Ad blockers/provider outage       | Script or iframe is blocked, slow, malformed, or unavailable.                                                                                        | A rendered page must not await the provider; slots fail closed and leave editorial content, navigation, feed, search, metadata, and static caching intact. Browser tests simulate consent-off, blocked, and failed loads.                                                                                                                                                                                                                                                                                                                                |
| Tenant boundary                   | An administrator, API token, snapshot, cache key, or clone operation reads another site's installation/configuration.                                | Authorize before lookup; scope persistence and published snapshots by site ID; use site-qualified cache/build inputs; structured authorization errors; fixtures with at least two authorized sites and one denied caller; clone requires destination opt-in.                                                                                                                                                                                                                                                                                             |
| Editorial/SEO boundary            | Adapter changes article content or canonical/robots/sitemap/JSON-LD state to influence SEO or ads.                                                   | These fields remain platform-owned. No Phase 1 capability grants mutation. Any metadata extension needs a separate approved spec plus conflict and duplicate detection.                                                                                                                                                                                                                                                                                                                                                                                  |
| Static availability/DDoS boundary | Plugin adds per-request origin work, cache-bypassing personalization, an open proxy, or external runtime configuration.                              | Prohibit those capabilities by type and test for them in the static build. Public output is a CDN artifact; provider scripts are optional client enhancements, never the page-delivery path.                                                                                                                                                                                                                                                                                                                                                             |

## Phase 1 ADR: controlled static compilation registry

### Status

Accepted for implementation.

### Decision

Implement a platform-owned, repository-bundled registry. A PluginDefinition has a stable ID and semantic version; explicit allowed capabilities; typed non-secret configuration/defaults/validation; a function that projects only public-safe values; and an exact list of provider origins. Definitions are part of a platform release, not data uploaded by an operator.

Each site stores one installation per plugin ID with:

- site ID, plugin ID, definition version, installation state (disabled, configured, or enabled), and monotonic revision;
- validated non-secret configuration and administrator-safe diagnostics;
- secret references only, never secret values; and
- a publish reference to an immutable, site-scoped public projection.

The allowed Phase 1 capabilities are intentionally small:

- administrative settings and revision-safe configuration operations;
- static build-time contribution to the public document head; and
- static build-time contribution to platform-named slots such as article inline, article footer, and sidebar.

All public contributions use platform-owned, typed tokens. Plugins cannot emit raw HTML, inline handlers, arbitrary script tags, custom public routes, middleware, server actions, database queries, request-time configuration reads, or provider-defined URLs. The public site resolves the already-published projection during its static build.

### Lifecycle

    known definition → installed/disabled → configured → validated → enabled
          → published public-safe snapshot → static build/CDN release

Invalid configuration cannot become enabled. A disabled, invalid, unconsented, blocked, or unavailable extension contributes nothing and cannot make a public page unavailable. An upgrade validates the target definition version before a new snapshot is published. Rollback selects the prior validated configuration and republishes a new static artifact; it never mutates an already-published artifact in place.

### Consequences

**Accepted costs:** adapters require a reviewed platform release; this is slower than an open marketplace and intentionally limits third-party variety. The registry and publish snapshot introduce new admin data and tests.

**Availability benefit:** anonymous readers still receive static files even if the administration service, configuration store, analytics endpoint, or ad provider is degraded or under attack.

**Operational benefit:** configuration, enablement, cloning, audit, and rollback use one multi-site contract. Public identifiers may be projected when needed; credentials never are.

**Performance benefit:** disabled plugins are absent from the public artifact. Enabled third-party behavior is non-blocking and explicitly budgeted per adapter, so it cannot become an implicit dependency of first render.

## Provider adapter constraints derived from official documentation

### Google Analytics

Google's [Google tag installation guide](https://developers.google.com/tag-platform/gtagjs) uses a measurement ID and a tag loader. The implemented adapter treats a measurement ID as a public identifier, not a credential, and keeps any measurement-management credential or API key private. It provides:

- site-scoped measurement ID validation and no default enablement;
- basic consent-gated loading as the Phase 1 default, with an explicit future decision required to support advanced Consent Mode;
- exact external origins, non-blocking loading behavior, and a failure mode that cannot delay content rendering; and
- no advertising personalization unless the operator has configured its consent policy and corresponding adapter behavior.

### Google AdSense (future adapter)

AdSense requires site ownership and review before ads may serve; its [site-management guidance](https://support.google.com/adsense/answer/12131223?hl=en) also recommends an ads.txt file. Its [connection guidance](https://support.google.com/adsense/answer/7584263?hl=en) places the account script in the document head and provides the root-level ads.txt record. Therefore the future adapter must:

- make publisher ID and approved slot/placement IDs explicit, site-scoped public-safe configuration; treat account credentials as secrets;
- generate a static root ads.txt artifact from the approved site projection, never from a runtime handler;
- use a platform-owned set of named slots and validate only approved responsive placements; avoid raw operator-supplied ad markup;
- set a script/slot performance budget and prove no content loss, console error, horizontal overflow, or disruptive layout shift when the provider is blocked; and
- require policy and consent review per deployment. It must not infer account approval or legal compliance from a saved configuration.

Google's [AdSense code guidance](https://support.google.com/adsense/answer/9274634?hl=en) notes that the code supports Auto ads and ad-unit features, but dynamic/ad-server uses have limitations. The platform will begin with explicit named slots, not a general-purpose dynamic ad server or an unconstrained Auto ads integration.

## Implementation guardrails

1. Keep the site application static-only. It must build without runtime secrets or a database connection and add no plugin route, server action, or runtime fetch.
2. Keep the admin application on its separate authenticated origin. Plugin editing, validation, secret-reference assignment, and release controls live there, not in public pages.
3. Preserve existing versioned post create/update/publish API contracts. Plugin configuration is an explicit, separately authorized site API and cannot silently alter editorial state or content.
4. Derive every public script/connect source from the registry's exact, enabled allow-list. If a static CSP/header cannot be safely generated for an adapter, do not enable that adapter.
5. Test public output for secret sentinels, unapproved sources, raw HTML, inline event handlers, duplicate/conflicting metadata, and public runtime imports.
6. Test two sites plus an unauthorized caller, and test clone/rollback/disable operations so a configuration or secret reference cannot cross tenants.

## Sources

All sources below are official product documentation and were consulted on 2026-09-11.

- WordPress: [Plugin Basics](https://developer.wordpress.org/plugins/plugin-basics/), [Plugin Hooks](https://developer.wordpress.org/plugins/hooks/)
- Ghost: [Content API](https://docs.ghost.org/content-api), [Admin API](https://docs.ghost.org/admin-api), [Webhooks overview](https://docs.ghost.org/admin-api/webhooks/overview)
- Strapi: [Create a plugin](https://docs.strapi.io/cms/plugins-development/create-a-plugin), [Plugin structure](https://docs.strapi.io/cms/plugins-development/plugin-structure)
- Payload: [Plugins overview](https://payloadcms.com/docs/plugins/overview), [Plugin API](https://payloadcms.com/docs/plugins/plugin-api)
- Directus: [Extensions](https://docs.directus.io/extensions/introduction), [Install extensions](https://docs.directus.io/extensions/installing-extensions), [Create extensions](https://docs.directus.io/extensions/creating-extensions)
- Google: [Google tag installation](https://developers.google.com/tag-platform/gtagjs), [Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode), [Connect a site to AdSense](https://support.google.com/adsense/answer/7584263?hl=en), [AdSense site management](https://support.google.com/adsense/answer/12131223?hl=en), [AdSense code](https://support.google.com/adsense/answer/9274634?hl=en), [Ad code modifications](https://support.google.com/adsense/answer/1354736?hl=en), [Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
