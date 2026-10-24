import type { ArtifactRecipe } from './release-manifest'
import {
  adapterProviderOrigins,
  renderAdapterContributions,
} from '@publisher/content'
import { commentRuntimeOrigins } from './static-runtime-config'
import { consentCss, consentCssPath } from './static-consent-style'
import {
  BASELINE_CSP,
  DEFAULT_BASELINE_CSS,
  contentDigest,
} from './static-policy'
import type { PublicationInputs } from './static-types'

function appendOrigins(
  csp: string,
  directive: string,
  origins: readonly string[],
): string {
  if (origins.length === 0) return csp
  const addition = [...new Set(origins)].join(' ')
  const expression = new RegExp(`(${directive} [^;]+)`)
  if (!expression.test(csp)) return `${csp}; ${directive} 'self' ${addition}`
  return csp.replace(expression, (_match, current) => `${current} ${addition}`)
}

export function publicationCsp(input: PublicationInputs): string {
  const origins = publicationOrigins(input)
  let csp = appendOrigins(BASELINE_CSP, 'script-src', origins.script)
  csp = appendOrigins(csp, 'connect-src', origins.connect)
  return appendOrigins(csp, 'frame-src', origins.frame)
}

function publicationOrigins(
  input: PublicationInputs,
): ReturnType<typeof commentRuntimeOrigins> {
  const runtime = commentRuntimeOrigins(input)
  const scripts = input.adapters
    ? adapterProviderOrigins(input.adapters, 'script')
    : []
  const connections = input.adapters
    ? adapterProviderOrigins(input.adapters, 'connect')
    : []
  return {
    script: [...new Set([...scripts, ...runtime.script])],
    connect: [...new Set([...connections, ...runtime.connect])],
    frame: [...new Set(runtime.frame)],
  }
}
import {
  createStaticHostPolicyRecipe,
  IMMUTABLE_CACHE_CONTROL,
  REVALIDATE_CACHE_CONTROL,
  STATIC_HOST_HEADERS,
} from './static-host-policy'

export interface BasePublicationGraph {
  readonly dependencies: Record<string, string>
  readonly recipes: ArtifactRecipe[]
  readonly baselinePath: string
}

function baseDependencies(
  input: PublicationInputs,
  baseline: string,
): Record<string, string> {
  return {
    'headers:csp': publicationCsp(input),
    'headers:origins': JSON.stringify(publicationOrigins(input)),
    'headers:static-cache': STATIC_HOST_HEADERS,
    'template:semantic': input.semanticVersion,
    'runtime:version': input.runtimeVersion,
    'public:head': JSON.stringify({
      head: input.adapters
        ? renderAdapterContributions(input.adapters).head
        : [],
      consentCssPath,
    }),
    'runtime:consent-style': consentCss,
    'theme:baseline': baseline,
    'site:identity': JSON.stringify({
      origin: input.origin,
      publicationName: input.publicationName,
      language: input.language,
    }),
  }
}

function baseRecipes(
  input: PublicationInputs,
  baselinePath: string,
): ArtifactRecipe[] {
  return [
    {
      path: consentCssPath,
      kind: 'runtime',
      contentType: 'text/css; charset=utf-8',
      cacheClass: 'immutable',
      dependencyKeys: ['runtime:consent-style'],
      render: (read) => read('runtime:consent-style'),
    },
    {
      path: '/.well-known/publisher/release-policy.json',
      kind: 'runtime',
      contentType: 'application/json',
      cacheClass: 'runtime-pointer',
      dependencyKeys: ['headers:csp', 'headers:origins'],
      render: (read) =>
        JSON.stringify({
          schemaVersion: 1,
          contentSecurityPolicy: read('headers:csp'),
          allowedOrigins: JSON.parse(read('headers:origins')),
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
}

export function createBasePublicationGraph(
  input: PublicationInputs,
): BasePublicationGraph {
  const baseline = `${input.baselineVersion}\u0000${input.baselineCss ?? DEFAULT_BASELINE_CSS}`
  const baselinePath = `/theme-runtime/immutable/baseline.${contentDigest(baseline)}.css`
  return {
    dependencies: baseDependencies(input, baseline),
    recipes: baseRecipes(input, baselinePath),
    baselinePath,
  }
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
