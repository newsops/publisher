import type { ArtifactRecipe } from './release-manifest'
import type { StaticIndexGraph } from './static-indexes'
import { contentDigest } from './static-policy'
import type { PublicationInputs } from './static-types'

const themeBootstrap =
  "fetch('/.well-known/publisher/runtime.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(m=>{if(typeof m.themeCss!=='string'||!m.themeCss.startsWith('/theme-runtime/'))throw new Error();const l=document.createElement('link');l.rel='stylesheet';l.href=m.themeCss;document.head.append(l)}).catch(()=>{});"

const commentBootstrap =
  "for(const s of document.querySelectorAll('[data-comments]')){const g=s.dataset.comments;if(!g)continue;fetch('/data/comments/'+encodeURIComponent(g)+'.json',{cache:'no-cache'}).then(r=>r.ok?r.json():Promise.reject()).then(p=>typeof p.projection==='string'&&p.projection.startsWith('/data/comments/')?fetch(p.projection):Promise.reject()).then(r=>r.ok?r.json():Promise.reject()).then(items=>{if(!Array.isArray(items)||items.length===0)return;const h=document.createElement('h2');h.textContent='Comments';const l=document.createElement('ol');for(const item of items){const i=document.createElement('li');const a=document.createElement('strong');a.textContent=String(item.authorName??'');const b=document.createElement('p');b.textContent=String(item.body??'');i.append(a,b);l.append(i)}s.replaceChildren(h,l)}).catch(()=>{})}"

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
    `/theme-runtime/${input.theme.id}.` +
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
    runtimeScript('/site-runtime/theme-bootstrap.v1.js', themeBootstrap),
    runtimeScript('/site-runtime/comment-bootstrap.v1.js', commentBootstrap),
  )
}
