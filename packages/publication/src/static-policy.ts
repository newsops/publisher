import { createHash } from 'node:crypto'

export const BASELINE_CSP =
  "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'"

export const DEFAULT_BASELINE_CSS =
  ':root{color-scheme:light;--paper:#fff;--ink:#15181d;--body:#3a4048;--accent:#a20d25;font-family:system-ui,-apple-system,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--body);line-height:1.65}.container{width:min(72rem,calc(100% - 2rem));margin-inline:auto}.site-header{border-bottom:1px solid #dfe3e8}.topbar-inner,.section-nav-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem}.main-header{padding-block:1.5rem;text-align:center}.brand{color:var(--ink);font-size:2rem;font-weight:700}.main-nav,.topbar-nav{display:flex;gap:1rem;margin:0;padding:0;list-style:none}.content-grid,.post-body{padding-block:2rem}.post-list{display:grid;gap:1.5rem}.post-card,.lead,.prose{max-width:48rem}h1,h2{color:var(--ink);line-height:1.15}a{color:var(--accent)}img{max-width:100%;height:auto}.sidebar,.comments,.article-related{margin-top:2rem;padding-top:1rem;border-top:1px solid #dfe3e8}.site-footer{margin-top:3rem;border-top:2px solid var(--ink);padding-block:2rem}'

export const PUBLICATION_SEMANTIC_VERSION = 'semantic-v2'
export const PUBLICATION_RUNTIME_VERSION = 'runtime-v1'
export const PUBLICATION_BASELINE_VERSION = 'baseline-v2'

export function contentDigest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
