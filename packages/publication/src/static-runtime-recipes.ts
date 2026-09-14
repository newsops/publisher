import type { ArtifactRecipe } from './release-manifest'
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
