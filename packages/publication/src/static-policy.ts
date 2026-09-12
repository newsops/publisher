import { createHash } from 'node:crypto'

export const BASELINE_CSP =
  "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'"

export const DEFAULT_BASELINE_CSS =
  ':root{color-scheme:light;--paper:#fff;--ink:#15181d;--body:#3a4048;--accent:#a20d25;font-family:system-ui,-apple-system,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--body);line-height:1.65}header,main{width:min(72rem,calc(100% - 2rem));margin-inline:auto}header{display:flex;align-items:center;justify-content:space-between;padding-block:1rem;border-beditorm:1px solid #dfe3e8}nav{display:flex;gap:1rem;flex-wrap:wrap}main{padding-block:2rem}article{max-width:48rem}h1,h2{color:var(--ink);line-height:1.15}a{color:var(--accent)}img{max-width:100%;height:auto}aside,section[data-comments]{margin-top:2rem;padding-top:1rem;border-top:1px solid #dfe3e8}'

export const PUBLICATION_SEMANTIC_VERSION = 'semantic-v1'
export const PUBLICATION_RUNTIME_VERSION = 'runtime-v1'
export const PUBLICATION_BASELINE_VERSION = 'baseline-v1'

export function contentDigest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
