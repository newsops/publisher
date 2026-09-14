import type { ArtifactRecipe } from './release-manifest'
import { BASELINE_CSP } from './static-policy'

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const REVALIDATE_CACHE_CONTROL = 'public, max-age=0, must-revalidate'

export const STATIC_HOST_HEADERS = `# Portable static-host cache and security policy.
# Only content-addressed paths are immutable. Stable URLs always revalidate.

/media/*
  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}

/theme-runtime/immutable/*
  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}

/data/immutable/*
  Cache-Control: ${IMMUTABLE_CACHE_CONTROL}

/theme-runtime/current.css
  Cache-Control: ${REVALIDATE_CACHE_CONTROL}

/.well-known/publisher/*
  Cache-Control: ${REVALIDATE_CACHE_CONTROL}

/data/comments/*
  Cache-Control: ${REVALIDATE_CACHE_CONTROL}

/search-index.json
  Cache-Control: ${REVALIDATE_CACHE_CONTROL}

/site-runtime/*
  Cache-Control: ${REVALIDATE_CACHE_CONTROL}

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: ${BASELINE_CSP}
`

export function createStaticHostPolicyRecipe(): ArtifactRecipe {
  return {
    path: '/_headers',
    kind: 'metadata',
    contentType: 'text/plain; charset=utf-8',
    cacheClass: 'runtime-pointer',
    dependencyKeys: ['headers:csp', 'headers:static-cache'],
    render: (read) => {
      read('headers:csp')
      read('headers:static-cache')
      return STATIC_HOST_HEADERS
    },
  }
}
