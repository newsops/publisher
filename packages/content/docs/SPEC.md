# Content package specification

## Scope

The content package owns portable publication types, validation, static build inputs, and the public snapshot contract. It has no database, HTTP, authentication, or deployment-provider dependency.

## Boundaries

The package does not persist private credentials, authorize administrators, execute plugins, add public routes, fetch remote configuration, or deliver a release. The admin application owns storage and authorization; the static site owns rendering; deployment owns artifact delivery.

## Architecture overview

Typed editorial entities are validated before they become managed records. A publish operation projects managed editorial and plugin-installation data into an immutable public snapshot. Plugin definitions are code-installed manifests that validate configuration and produce typed public tokens; they are not runtime callbacks.

## Type ownership

| Type                                         | Location                       | Purpose                                                    |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| PublicationSettings and editorial types      | src/types.ts and src/editor.ts | Public and managed publication data                        |
| ContentSnapshot                              | src/editor.ts                  | Immutable public release input                             |
| PluginDefinition and PluginInstallation      | src/plugins/index.ts           | Controlled extension manifest and site-scoped installation |
| PublicPluginSnapshot and contribution tokens | src/plugins/index.ts           | Public-safe static build projection                        |

## Public API surface

| Export                                         | Kind          | Description                                                                                         |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| validatePostInput and content validation types | function/type | Editorial validation contract                                                                       |
| ContentSnapshot                                | type          | Versioned static publication snapshot                                                               |
| pluginRegistry and plugin definitions          | value/type    | Repository-bundled, allow-listed extension registry                                                 |
| validatePluginInstallation                     | function      | Validates a site-scoped installation against the registry                                           |
| projectPublicPluginSnapshot                    | function      | Removes private installation values for static build use                                            |
| renderPluginContributions                      | function      | Converts validated public projection into typed head/slot tokens                                    |
| googleAnalyticsPlugin                          | value         | Reviewed GA4 adapter with a strict public ID/consent schema and a platform-owned static loader path |

## Extension points

Definitions may declare only administrative settings, static head contributions,
named static slots, and an exact allow-listed platform static-script path. A
definition has a stable ID/version, exact provider-origin allow-list,
configuration validator, and public projection. Definitions cannot create
routes, middleware, request-time work, raw HTML, inline event handlers, or
arbitrary remote URLs.

## Error taxonomy

| Error                  | Meaning                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| ContentValidationError | Invalid editorial or plugin configuration                          |
| Unknown plugin         | The installation references an ID absent from the bundled registry |
| Revision conflict      | The admin persistence layer rejected a stale installation update   |

## Test strategy

Harness contract tests cover registry validation, duplicate/unknown capabilities,
snapshot secrecy, static-boundary constraints, GA4 consent/origin constraints,
and multi-site isolation. Admin integration tests cover authorization and
optimistic concurrency; browser tests cover disabled and failed contribution
behavior.

## Class contract registry

The package exposes no inheritance hierarchy. Plugin definitions are immutable data-plus-validation objects consumed by platform-owned registry and renderer functions.
