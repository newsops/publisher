# Publication package contract

## Scope

`@publisher/publication` turns public, credential-free content inputs into a
complete static release graph. It owns deterministic rendering, dependency
invalidation, release verification and activation contracts.

## Boundaries

Content source validation and adapter definitions belong to `@publisher/content`.
Database recovery, private source documents and provider credentials are not
publication inputs. Hosting adapters apply the generated cache/security policy;
the public website does not connect to the editorial database.

## Architecture Overview

`createPublicationRecipes` validates public comment runtime configuration before
creating core, article, index and runtime recipes. The incremental builder hashes
declared dependencies and reuses unchanged artifacts. Every HTML recipe depends
on public head/runtime contributions; rendered feed bodies and lead bylines have
explicit dependencies. Equivalent clean and incremental inputs produce equal
artifact bytes, while unrelated projections and media remain reusable.
Worker environment configuration distinguishes an absent submission flag
(read-only default) from supplied exact `true`/`false`. Every other supplied
value, including empty text, fails rather than silently disabling submissions.
Shared head generation and HTML escaping reside in `src/static-html.ts`;
semantic document/body rendering remains in `src/static-renderers.ts`.

Consent uses a content-addressed same-origin stylesheet linked in HTML before
its deferred runtime. The runtime never injects inline styles. Analytics remains
opt-in. Generated CSP keeps `style-src 'self'` and admits only exact validated
comment/verification origins in the required directive. A verification widget
declares `frameOrigins` and `connectOrigins` explicitly, including empty arrays
when the selected provider needs none. HTTP is accepted only for loopback test
origins; deployed configuration uses HTTPS, without credentials or wildcards.
The release policy records these exact allowed origins alongside its CSP;
candidate verification checks both policy and header admissibility, not a
provider-specific hard-coded origin list. It does not authenticate a candidate's
publisher; manifest/source authority remains the caller's responsibility.

## Type Ownership

| Type                                                                                                                                       | Location                   | Purpose                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------- |
| `PublicationInputs`, `ArticleDocument`, `PublicationProjection`, `ThemeBundle`, `MaterializedMedia`                                        | `src/static-types.ts`      | Public static rendering input            |
| `ArtifactRecipe`, `ArtifactEntry`, `ArtifactStore`, `ReleaseManifest`, `BuildResult`, `BuildMetrics`, `ArtifactKind`, `ArtifactCacheClass` | `src/release-manifest.ts`  | Dependency graph and immutable artifacts |
| `StaticIndexGraph`                                                                                                                         | `src/static-indexes.ts`    | Static index recipe collection           |
| `BuildJob`, `BuildJobRepository`, `BuildJobStatus`, `EnqueueBuildJobInput`                                                                 | `src/build-job.ts`         | Publication work lifecycle               |
| `ReleaseActivation`                                                                                                                        | `src/activation.ts`        | Verified active-release pointer          |
| `ReadableArtifactStore`                                                                                                                    | `src/static-deployment.ts` | Deployment artifact reader               |
| `ThemeDefinition`                                                                                                                          | `src/themes.ts`            | Bundled presentation definition          |

## Public API Surface

| Export                                                                                                                                                        | Kind              | Contract                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
| `createPublicationRecipes`, `createStaticIndexRecipes`, `staticIndexPaths`, `assertCompletePublicationGraph`, `createScaleFixture`                            | Functions         | Complete static graph construction          |
| `buildIncrementalRelease`, `manifestChecksum`, `verifyPublicationCandidate`                                                                                   | Functions         | Build, integrity and reference verification |
| `InMemoryReleaseActivation`, `activateVerifiedRelease`                                                                                                        | Class/function    | Verified activation                         |
| `InMemoryBuildJobRepository`, `assertBuildJobTransition`, `guardBuildJobTransitions`                                                                          | Class/functions   | Job transition and persistence contract     |
| `FileSystemStaticDeployment`                                                                                                                                  | Class             | Local materialized deployment               |
| `validatePopularityProjection`, `sanitizeCommentProjection`                                                                                                   | Functions         | Public projection constraints               |
| `getTheme`, `themes`                                                                                                                                          | Function/registry | Built-in themes                             |
| `BASELINE_CSP`, `DEFAULT_BASELINE_CSS`, `PUBLICATION_BASELINE_VERSION`, `PUBLICATION_RUNTIME_VERSION`, `PUBLICATION_SEMANTIC_VERSION`, `PRESENTATION_MARKERS` | Constants         | Static presentation/security contract       |
| Types in Type Ownership                                                                                                                                       | Types             | Re-exported contracts from `src/index.ts`   |

## Extension Points

Inputs select a theme, public adapter snapshot, approved comment projections and
an optional independent comment service. Verification is provider-neutral: public
site key, script URL, browser global and exact frame/connect origin arrays.
No provider-specific inferred origins or compatibility renderer are supplied.

## Error Taxonomy

Invalid runtime origins, missing verification capabilities, unsupported public
paths, missing dependency reads, invalid projections and incomplete release
graphs throw before activation. Errors are ordinary `Error` values with
actionable messages; no new public error class or code is introduced.

## Test Strategy

`scripts/harness/__tests__/publication-continuity.test.mjs` compares actual
incremental artifacts with independent clean builds for adapter and runtime
changes, RSS body edits and byline edits. It rejects malformed public runtime
configuration and asserts external consent CSS and exact CSP directives.
Existing incremental and consent harness tests retain lifecycle coverage.
`publication-runtime-config.test.mjs` exercises the actual worker environment
mapping, including missing/malformed explicit capabilities and read-only comments.

Run `volta run --node 22 pnpm exec vitest run --config
vitest.harness.config.ts scripts/harness/__tests__/publication-continuity.test.mjs`.
`scripts/harness/continuity-preview.mts` serves generated artifacts with their
actual security/cache headers and isolated loopback comment/verification
receivers. Real desktop/mobile Chrome checks cover first-visit consent,
rejection/reload, reopening/grant and configured script/frame/connect/submission
behavior; DOM stubs alone do not prove CSP compatibility.

## Class Contract Registry

| Class                        | Contract                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| `InMemoryReleaseActivation`  | Implements `ReleaseActivation`                                    |
| `InMemoryBuildJobRepository` | Implements `BuildJobRepository`                                   |
| `FileSystemStaticDeployment` | Materializes verified manifest artifacts through a readable store |
