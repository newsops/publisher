import { contentDigest } from './static-policy'

export const consentCss =
  '[data-consent-layer]{position:fixed;inset-inline:0;bottom:0;z-index:2147483000;' +
  'display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:center;' +
  'padding:1rem clamp(1rem,4vw,2rem);background:#111;color:#fff;font:inherit;' +
  'box-shadow:0 -2px 12px rgba(0,0,0,.35)}' +
  '[data-consent-layer] p{margin:0;flex:1 1 20rem;font-size:.95rem;line-height:1.45}' +
  '[data-consent-layer] .consent-actions{display:flex;flex-wrap:wrap;gap:.5rem}' +
  '[data-consent-layer] .consent-action{min-height:2.75rem;padding:.55rem 1.1rem;' +
  'border:1px solid #fff;border-radius:.25rem;background:transparent;color:inherit;' +
  'font:inherit;font-weight:600;cursor:pointer}' +
  '[data-consent-layer] .consent-action:focus-visible{outline:3px solid #7cc4ff;outline-offset:2px}' +
  '[data-consent-state]{flex:1 1 100%;margin:0;font-size:.85rem;opacity:.85}' +
  '[data-consent-reopen]{background:none;border:0;padding:0;color:inherit;' +
  'font:inherit;text-decoration:underline;cursor:pointer}'

export const consentCssPath = `/site-runtime/immutable/consent.${contentDigest(consentCss)}.css`
