# Layer boundaries

The repository is six layers; an import may only point down the list (or
sideways where the map says so). `scripts/harness/layer-map.json` is the single
source: it assigns every source directory to a layer and lists what each layer
may import. `.agents/project-structure.md` repeats the table for humans and is
never the authority when the two disagree.

| Layer | Name        | Owns                                                                             | Directories                                                               |
| ----- | ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| L0    | contract    | Content types, URL derivation, editorial Markdown, validation and desk rules     | `packages/content/src`                                                    |
| L1    | adapters    | PostgreSQL, S3-compatible store, image pipeline, repository implementations      | `packages/persistence/src`, `apps/admin/app/lib/{postgres-*,file-*,…}`    |
| L2    | publication | Snapshot → release: renderers, indexes, manifest, verification, activation       | `packages/publication/src`                                                |
| L3    | services    | Admin domain services and the composition root that wires adapters into them     | `apps/admin/app/lib/*.ts` (services), `repository.ts` (composition)       |
| L4    | surfaces    | Browser routes, automation routes, HTTP helpers, admin UI, public site, comments | `apps/admin/app/api`, `apps/admin/app/lib/{auth,api-*,…}.ts`, `apps/site` |
| L5    | operators   | Admin API client, CLI, build/deploy/harness scripts                              | `packages/admin-client`, `packages/ops-cli`, `scripts`                    |

Cross-cutting rules, each enforced by a scan in `pnpm harness:scan`:

- **Imports** (`scan-layer-imports.mjs`): a file imports only the layers, module
  classes (`sdk`, `framework`, `parser`, `tooling`), and builtins its layer
  allows. `types:<layer>` permits type-only imports; `index:<layer>` permits
  imports through the package index or `@publisher/*` alias only. Tests and
  `scripts/harness/**` are exempt.
- **Configuration** (`scan-env-access.mjs`): `process.env` is read only in the
  `compositionRoots` of the map (`config.ts`, `*FromEnvironment` factories,
  `next.config.ts`, scripts, CLI). Everything else receives configuration as
  parameters. `NEXT_PUBLIC_*` and `NODE_ENV` are allowed everywhere.
- **Route shape** (`scan-route-shape.mjs`): a browser `route.ts` calls
  `requireIdentity` and resolves the site through `repositoryForRequest` (or
  `pluginRepositoryForRequest`); an automation `route.ts` uses
  `withSiteAutomation`/`withAutomation`. Routes never import adapters, SDKs, or
  other routes — business rules live in a service shared by both surfaces.
- **Surfaces** (`scan-surface-parity.mjs`): `scripts/harness/surface-map.json`
  registers every capability with its service, browser route, `v2` route,
  `@publisher/admin-client` method, `publisher` command, and UI panel. A
  capability without `exclusive` is reachable from every surface; `exclusive`
  (`browser` | `automation` | `cli`) carries a `reason`. Every `v2` route is in
  `docs/admin-api.openapi.yaml`. The CLI wraps client methods and never opens a
  database, object store, or provider API.
- **Spec tags** (`scan-spec-contract.mjs`): `### Affected Scope` of every spec
  written after ARCH-001 tags each path with its layer id (L0–L5).

## Ratchet

`scripts/harness/layer-baseline.json` lists the violations that existed when a
rule was introduced. A scan fails on a violation that is not in the baseline
**and** on a baseline entry that no longer matches, so the file can only
shrink: remove the entry in the same change that removes the violation. Never
run `--write-baseline` to absorb a new violation; fix the code or, if the map
is wrong, change the map in a spec.

## Adding code

1. Find the layer of the directory you are editing in `layer-map.json`.
2. If the import you need is not allowed there, the code belongs one layer
   down (extract a service or adapter) — not in a wider allow list.
3. A new capability is added to `surface-map.json` with all four surfaces, or
   with `exclusive` and a reason, in the same change as its first route.
4. New specs tag `### Affected Scope` paths with layer ids.
