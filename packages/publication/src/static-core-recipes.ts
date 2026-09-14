import type { ArtifactRecipe } from './release-manifest'
import {
  BASELINE_CSP,
  DEFAULT_BASELINE_CSS,
  contentDigest,
} from './static-policy'
import type { PublicationInputs } from './static-types'
import {
  createStaticHostPolicyRecipe,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
} from './static-host-policy'

export interface BasePublicationGraph {
  readonly dependencies: Record<string, string>
  readonly recipes: ArtifactRecipe[]
  readonly baselinePath: string
}

export function createBasePublicationGraph(
  input: PublicationInputs,
): BasePublicationGraph {
  const baseline = `${input.baselineVersion}\u0000${input.baselineCss ?? DEFAULT_BASELINE_CSS}`
  const baselinePath = `/theme-runtime/immutable/baseline.${contentDigest(baseline)}.css`
  const dependencies: Record<string, string> = {
    'headers:csp': BASELINE_CSP,
    'headers:static-cache': 'static-cache-v1',
    'template:semantic': input.semanticVersion,
    'runtime:version': input.runtimeVersion,
    'theme:baseline': baseline,
    'site:identity': JSON.stringify({
      origin: input.origin,
      publicationName: input.publicationName,
      language: input.language,
    }),
  }
  const recipes: ArtifactRecipe[] = [
    {
      path: '/.well-known/publisher/release-policy.json',
      kind: 'runtime',
      contentType: 'application/json',
      cacheClass: 'runtime-pointer',
      dependencyKeys: ['headers:csp'],
      render: (read) =>
        JSON.stringify({
          schemaVersion: 1,
          contentSecurityPolicy: read('headers:csp'),
          cache: {
            html: REVALIDATE_CACHE_CONTROL,
            immutable: IMMUTABLE_CACHE_CONTROL,
            runtime: REVALIDATE_CACHE_CONTROL,
          },
        }),
    },
    createStaticHostPolicyRecipe(),
    {
      path: baselinePath,
      kind: 'theme',
      contentType: 'text/css; charset=utf-8',
      cacheClass: 'immutable',
      dependencyKeys: ['theme:baseline'],
      render: (read) => {
        read('theme:baseline')
        return input.baselineCss ?? DEFAULT_BASELINE_CSS
      },
    },
  ]
  return { dependencies, recipes, baselinePath }
}

export function appendMediaRecipes(
  input: PublicationInputs,
  dependencies: Record<string, string>,
  recipes: ArtifactRecipe[],
): void {
  for (const media of input.media ?? []) {
    const pathMatch = /^\/media\/([a-f0-9]{64})\.[A-Za-z0-9]+$/.exec(
      media.publicPath,
    )
    if (!pathMatch || pathMatch[1] !== media.sha256)
      throw new Error(
        `Media public path must be content-addressed: ${media.publicPath}`,
      )
    if (contentDigest(media.body) !== media.sha256)
      throw new Error(`Media checksum mismatch: ${media.id}`)
    const key = `media:${media.id}`
    dependencies[key] = media.sha256
    recipes.push({
      path: media.publicPath,
      kind: 'media',
      contentType: media.mimeType,
      cacheClass: 'immutable',
      dependencyKeys: [key],
      render: (read) => {
        read(key)
        return media.body
      },
    })
  }
}
