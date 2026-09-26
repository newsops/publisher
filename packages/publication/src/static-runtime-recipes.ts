import type { ArtifactRecipe } from './release-manifest'
import {
  googleAnalyticsRuntimeSource,
  renderPluginContributions,
} from '@publisher/content'
import type { StaticIndexGraph } from './static-indexes'
import { contentDigest } from './static-policy'
import type { PublicationInputs } from './static-types'

const commentBootstrap =
  "for(const s of document.querySelectorAll('[data-comments]')){const g=s.dataset.comments;if(!g)continue;fetch('/data/comments/'+encodeURIComponent(g)+'.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(p=>typeof p.projection==='string'&&p.projection.startsWith('/data/immutable/comments/')?fetch(p.projection):Promise.reject()).then(r=>r.ok?r.json():Promise.reject()).then(items=>{if(!Array.isArray(items)||items.length===0)return;const h=document.createElement('h2');h.textContent='Comments';const l=document.createElement('ol');for(const item of items){const i=document.createElement('li');const a=document.createElement('strong');a.textContent=String(item.authorName??'');const b=document.createElement('p');b.textContent=String(item.body??'');i.append(a,b);l.append(i)}s.replaceChildren(h,l)}).catch(()=>{})}"

// This runtime intentionally talks only to the isolated comment service.  It
// never turns a public article request into an admin or PostgreSQL request.
const liveComments =
  "(()=>{const clean=(v,n)=>String(v??'').replace(/[\\u0000-\\u001f\\u007f]/g,' ').trim().slice(0,n);for(const s of document.querySelectorAll('[data-comments]')){const o=s.dataset.commentOrigin?.replace(/\\/$/,'');const site=s.dataset.commentSite,slug=s.dataset.comments,list=s.querySelector('[data-comment-list]'),status=s.querySelector('[data-comment-status]');if(!o||!site||!slug||!list)continue;const endpoint=o+'/v1/sites/'+encodeURIComponent(site)+'/threads/'+encodeURIComponent(slug);fetch(endpoint,{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():Promise.reject()).then(p=>{const cs=Array.isArray(p.comments)?p.comments:[];if(cs.length){const l=document.createElement('ol');l.className='comment-list';for(const c of cs){const i=document.createElement('li'),a=document.createElement('strong'),b=document.createElement('p');a.textContent=clean(c.authorName,80);b.textContent=clean(c.body,2000);i.append(a,b);l.append(i)}list.replaceWith(l)}if(status)status.textContent=cs.length?cs.length+' approved comment'+(cs.length===1?'':'s'):'No approved comments yet.'}).catch(()=>{if(status)status.textContent='Comments are temporarily unavailable.'});const f=s.querySelector('[data-comment-form]');if(!(f instanceof HTMLFormElement))continue;let token='';s.addEventListener('publisher:verification-token',e=>{token=clean(e.detail?.token,4096);const i=f.elements.namedItem('verificationToken');if(i instanceof HTMLInputElement)i.value=token});f.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(f),m=f.querySelector('[data-comment-submit-status]');token=clean(d.get('verificationToken')||token,4096);if(!token){if(m)m.textContent='Complete human verification first.';return}fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorName:d.get('authorName'),body:d.get('body'),verificationToken:token})}).then(r=>{if(!r.ok)throw Error();f.reset();token='';s.dispatchEvent(new CustomEvent('publisher:verification-reset'));if(m)m.textContent='Submitted for moderation.'}).catch(()=>{if(m)m.textContent='Comment submission failed. Try again.'})})}})()"

const humanVerificationRuntime =
  "(()=>{const load=(u,g)=>window[g]?.render?Promise.resolve(window[g]):new Promise((ok,no)=>{const x=document.createElement('script');x.src=u;x.async=true;x.onload=()=>window[g]?.render?ok(window[g]):no(Error());x.onerror=()=>no(Error());document.head.append(x)});for(const w of document.querySelectorAll('[data-human-verification-widget]')){const s=w.closest('[data-comments]'),key=w.dataset.humanVerificationSiteKey,u=w.dataset.humanVerificationScriptUrl,g=w.dataset.humanVerificationGlobal,status=s?.querySelector('[data-human-verification-status]');if(!s||!key||!u||!g)continue;let id;s.addEventListener('publisher:verification-reset',()=>{if(id!==undefined&&window[g]?.reset)window[g].reset(id)});load(u,g).then(api=>{id=api.render(w,{sitekey:key,callback:token=>{s.dispatchEvent(new CustomEvent('publisher:verification-token',{detail:{token}}));if(status)status.textContent=''},'error-callback':()=>{if(status)status.textContent='Human verification is unavailable. Try again.'},'expired-callback':()=>{if(id!==undefined)api.reset(id)}})}).catch(()=>{if(status)status.textContent='Human verification is unavailable. Try again.'})}})()"

/**
 * SECURITY-002: the platform-owned analytics consent layer. Analytics is
 * opt-in, so this runtime never grants consent on its own — it only replays a
 * stored grant and lets the visitor change the choice at any time. The Google
 * Analytics runtime reads `window.__publisherConsent` on execute and also
 * listens for `publisher:consent`, so setting both makes the load order of the
 * two async scripts irrelevant.
 */
export const consentRuntimeSource = `;(() => {
  const KEY = 'publisher.consent.analytics'
  const readStored = () => {
    try {
      const stored = localStorage.getItem(KEY)
      return stored === 'granted' || stored === 'denied' ? stored : null
    } catch {
      return null
    }
  }
  const store = (decision) => {
    try {
      localStorage.setItem(KEY, decision)
    } catch {}
  }

  const apply = (granted) => {
    window.__publisherConsent = Object.assign({}, window.__publisherConsent, {
      analytics: granted,
    })
    window.dispatchEvent(
      new CustomEvent('publisher:consent', { detail: { analytics: granted } }),
    )
  }

  const button = (label, key) => {
    const element = document.createElement('button')
    element.setAttribute('type', 'button')
    element.className = 'consent-action'
    element.dataset[key] = 'true'
    element.textContent = label
    return element
  }

  const styles = () => {
    if (document.querySelector('[data-consent-styles]')) return
    const sheet = document.createElement('style')
    sheet.dataset.consentStyles = 'true'
    sheet.textContent =
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
    document.head.append(sheet)
  }

  const removeLayer = () => {
    document.querySelector('[data-consent-layer]')?.remove()
  }

  const mountReopen = () => {
    if (document.querySelector('[data-consent-reopen]')) return
    const control = button('Privacy settings', 'consentReopen')
    control.className = ''
    control.addEventListener('click', () => open(readStored()))
    const host = document.querySelector('.footer-bar-inner') ?? document.body
    host.append(control)
  }

  const decide = (decision) => {
    store(decision)
    apply(decision === 'granted')
    removeLayer()
    mountReopen()
  }

  function open(current) {
    removeLayer()
    styles()
    const layer = document.createElement('div')
    layer.dataset.consentLayer = 'true'
    layer.setAttribute('role', 'region')
    layer.setAttribute('aria-label', 'Analytics consent')
    const message = document.createElement('p')
    message.textContent =
      'We load Google Analytics only if you allow it. Nothing is sent before you choose.'
    const actions = document.createElement('div')
    actions.className = 'consent-actions'
    const allow = button('Allow analytics', 'consentAllow')
    allow.addEventListener('click', () => decide('granted'))
    const reject = button('Reject', 'consentReject')
    reject.addEventListener('click', () => decide('denied'))
    const settings = button('Settings', 'consentSettings')
    settings.addEventListener('click', () => {
      if (layer.querySelector('[data-consent-state]')) return
      const state = document.createElement('p')
      state.dataset.consentState = 'true'
      state.textContent =
        'Stored choice: ' +
        (current === 'granted'
          ? 'analytics allowed'
          : current === 'denied'
            ? 'analytics rejected'
            : 'not set') +
        '. Only this preference is stored, on this site, in your browser.'
      layer.append(state)
    })
    actions.append(allow, reject, settings)
    layer.append(message, actions)
    document.body.append(layer)
  }

  const stored = readStored()
  if (stored === 'granted') apply(true)
  if (stored === null) open(null)
  else mountReopen()
})()`

function runtimeScript(path: string, source: string): ArtifactRecipe {
  return {
    path,
    kind: 'runtime',
    contentType: 'text/javascript; charset=utf-8',
    cacheClass: 'runtime-pointer',
    dependencyKeys: ['runtime:version'],
    render: (read) => {
      read('runtime:version')
      return source
    },
  }
}

export function appendRuntimeRecipes(
  input: PublicationInputs,
  indexes: StaticIndexGraph,
  dependencies: Record<string, string>,
  recipes: ArtifactRecipe[],
): void {
  const themeKey = `theme:${input.theme.id}:${input.theme.version}`
  dependencies[themeKey] = input.theme.css
  const themePath =
    `/theme-runtime/immutable/${input.theme.id}.` +
    `${contentDigest(dependencies[themeKey])}.css`
  recipes.push({
    path: themePath,
    kind: 'theme',
    contentType: 'text/css; charset=utf-8',
    cacheClass: 'immutable',
    dependencyKeys: [themeKey],
    render: (read) => {
      read(themeKey)
      return input.theme.css
    },
  })
  recipes.push({
    path: '/theme-runtime/current.css',
    kind: 'theme',
    contentType: 'text/css; charset=utf-8',
    cacheClass: 'runtime-pointer',
    dependencyKeys: [themeKey],
    render: (read) => {
      read(themeKey)
      return input.theme.css
    },
  })
  dependencies['runtime:pointer'] = JSON.stringify({
    schemaVersion: 1,
    themeCss: themePath,
    recent: indexes.recentDataPath,
    popular: indexes.popularDataPath,
  })
  recipes.push({
    path: '/.well-known/publisher/runtime.json',
    kind: 'runtime',
    contentType: 'application/json',
    cacheClass: 'runtime-pointer',
    dependencyKeys: ['runtime:pointer'],
    render: (read) => read('runtime:pointer'),
  })
  recipes.push(
    runtimeScript('/site-runtime/comment-bootstrap.v1.js', commentBootstrap),
  )
  recipes.push(
    runtimeScript('/site-runtime/consent.v1.js', consentRuntimeSource),
  )
  const pluginHead = input.plugins
    ? renderPluginContributions(input.plugins).head
    : []
  if (
    pluginHead.some(
      (token) => token.src === '/plugin-runtime/google-analytics.js',
    )
  )
    recipes.push(
      runtimeScript(
        '/plugin-runtime/google-analytics.js',
        googleAnalyticsRuntimeSource,
      ),
    )
  if (input.commentRuntime) {
    recipes.push(runtimeScript('/site-runtime/comments.v1.js', liveComments))
    if (
      input.commentRuntime.submissionEnabled &&
      input.commentRuntime.humanVerification
    )
      recipes.push(
        runtimeScript(
          '/site-runtime/human-verification.v1.js',
          humanVerificationRuntime,
        ),
      )
  }
}
