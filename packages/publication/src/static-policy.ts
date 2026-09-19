import { createHash } from 'node:crypto'

export const BASELINE_CSP =
  "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'"

export const DEFAULT_BASELINE_CSS =
  ":root{color-scheme:light;--paper:#fff;--ink:#0b0c0c;--body:#3a3f46;--accent:#b80000;font-family:'Helvetica Neue',Helvetica,'Segoe UI','Noto Sans',Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--body);line-height:1.65}a{color:inherit;text-decoration:none}img{max-width:100%;height:auto}:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.container{width:min(80rem,calc(100% - 2rem));margin-inline:auto}.site-header{background:var(--ink);color:var(--paper)}.topbar-inner,.main-header-inner,.section-nav-inner{display:flex;align-items:center;justify-content:space-between;gap:1rem}.main-header-inner{padding-block:1.25rem}.brand{font-size:2rem;font-weight:900;text-transform:uppercase}.section-nav{background:var(--paper);color:var(--ink);border-top:4px solid var(--accent);border-bottom:1px solid #dfe3e8}.main-nav,.topbar-nav{display:flex;gap:1rem;margin:0;padding:0;list-style:none}.content-grid,.post-body{padding-block:2rem}.post-list{display:grid;gap:1.5rem}.post-card,.lead,.prose{max-width:48rem}h1,h2{color:var(--ink);line-height:1.15}.category,.prose a{color:var(--accent)}.sidebar,.comments,.article-related{margin-top:2rem;padding-top:1rem;border-top:1px solid #dfe3e8}.site-footer{margin-top:3rem;padding-block:2rem;background:var(--ink);color:var(--paper)}"

export const PUBLICATION_SEMANTIC_VERSION = 'semantic-v3'
export const PUBLICATION_RUNTIME_VERSION = 'runtime-v1'
export const PUBLICATION_BASELINE_VERSION = 'baseline-v3'

export function contentDigest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Presentation contract (ARCH-004). `packages/publication` renders the
 * canonical public HTML; `apps/site` is the checked-in fixture preview. Both
 * must emit these class markers on the pages named, and every theme
 * stylesheet must style them, so the two renderers cannot drift apart
 * silently. Add a marker here when a theme starts depending on it.
 */
export const PRESENTATION_MARKERS = Object.freeze({
  chrome: [
    'site-shell',
    'site-header',
    'topbar',
    'main-header',
    'brand',
    'section-nav',
    'main-nav',
    'site-footer',
  ],
  article: [
    'post-body',
    'article-head',
    'breadcrumb',
    'category',
    'standfirst',
    'byline',
    'prose',
    'article-tags',
    'article-related',
  ],
  index: ['lead', 'lead-title', 'post-list', 'post-card', 'post-title'],
} as const)
