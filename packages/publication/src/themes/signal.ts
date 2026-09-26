import type { ThemeDefinition } from './definition'

/**
 * Signal theme — Dark "research wire": ink-navy ground, one acid-lime accent,
 * Didone wordmark and serif display headlines paired with monospaced metadata.
 * Centred masthead with a monospace ticker and a restrained italic section
 * row; a full-bleed lead with the headline set over the image; a single-column
 * story river (meta column, serif title, thumbnail); the rail as a numbered
 * index to the left of the river; a marginalia article layout (metadata in a
 * side column beside a long-form serif reading column); a two-line colophon.
 *
 * Every theme owns its complete stylesheet: the token block first, then the
 * presentation rules for the shared semantic slots (header, navigation,
 * index, article, rail, comments, footer). Edit this file directly; the
 * bundle is content-addressed at build time and never rebuilds article HTML.
 */
export const signal: ThemeDefinition = {
  id: 'signal',
  name: 'Signal',
  version: '2',
  css: `:root { color-scheme: dark; --paper: #0b1120; --ground: #0b1120; --panel: #121b2f; --raise: #19243c; --ink: #f1f3f7; --body: #c4ccd9; --prose: #dde2ea; --meta: #95a1b5; --rule: #26314a; --rule-soft: #1a2439; --accent: #c8f23c; --accent-ink: #0b1120; --accent-wash: rgba(200, 242, 60, 0.12); --serif: 'Iowan Old Style', Charter, 'Palatino Linotype', Georgia, 'Times New Roman', serif; --didone: Didot, 'Bodoni 72', 'Bodoni MT', 'Iowan Old Style', Georgia, 'Times New Roman', serif; --mono: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; }
:root { --gutter: clamp(16px, 4vw, 48px); --measure: 68ch; --container: 1280px; --column: 700px; --side: 240px; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; background: var(--ground); }
body { margin: 0; background: var(--ground); color: var(--body); font: 18px/1.6 var(--serif); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow-wrap: break-word; }
main, article { min-width: 0; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--accent); }
img { max-width: 100%; }
::selection { background: var(--accent); color: var(--accent-ink); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
h1, h2, h3, p { margin: 0; }
.site-shell { display: flex; min-height: 100vh; flex-direction: column; }
.container { width: min(var(--container), calc(100% - var(--gutter) * 2)); margin-inline: auto; }
.category { display: inline-flex; width: fit-content; align-items: center; gap: 8px; color: var(--accent); font: 500 12px/1.3 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; }
.category::before { content: ''; flex: none; width: 6px; height: 6px; background: currentColor; }
a.category:hover { color: var(--ink); }
.meta, .post-date { color: var(--meta); font: 12px/1.5 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }
.meta a { color: var(--ink); }
.meta a:hover { color: var(--accent); }
.post-image-placeholder { position: relative; min-height: 1px; background: var(--panel) repeating-linear-gradient(45deg, transparent 0 9px, var(--rule-soft) 9px 10px); }
.post-image-placeholder::after { content: ''; position: absolute; inset: 0; border: 1px solid var(--rule); }
.site-header { width: 100%; background: var(--ground); color: var(--ink); border-bottom: 1px solid var(--rule); }
header.site-header a { color: inherit; }
.topbar { border-bottom: 1px solid var(--rule-soft); }
.topbar-inner { display: flex; min-height: 40px; align-items: center; justify-content: center; gap: 20px; color: var(--meta); font: 11px/1.4 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
.topbar-date { display: inline-flex; min-width: 0; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topbar-date::before { content: ''; flex: none; width: 7px; height: 7px; background: var(--accent); animation: blink 2.4s steps(2, jump-none) infinite; }
.topbar-nav, .main-nav { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; }
.topbar-nav { flex: none; gap: 20px; white-space: nowrap; }
.topbar-nav::before { content: ''; width: 1px; height: 12px; background: var(--rule); }
.topbar-nav a, header.site-header .topbar-nav a { display: inline-flex; min-height: 40px; align-items: center; color: var(--meta); transition: color 160ms ease; }
.topbar-nav a:hover, header.site-header .topbar-nav a:hover { color: var(--accent); }
.main-header { padding: 0; }
.main-header-inner { position: relative; display: flex; min-height: 0; align-items: center; justify-content: center; padding-block: clamp(22px, 3.2vw, 44px); }
.brand, header.site-header .brand { display: inline-flex; align-items: flex-end; margin-right: -0.16em; color: var(--ink); font: 400 clamp(24px, 4.6vw, 60px)/1 var(--didone); letter-spacing: 0.16em; text-align: center; text-transform: uppercase; }
.brand::after { content: ''; flex: none; width: 0.14em; height: 0.14em; margin: 0 0 0.08em -0.1em; background: var(--accent); }
.brand:hover, header.site-header .brand:hover { color: var(--ink); }
.masthead-search { display: none; }
.section-nav { background: transparent; color: var(--body); border-top: 1px solid var(--rule-soft); border-bottom: 0; }
.section-nav-inner { display: flex; min-height: 0; align-items: stretch; justify-content: center; justify-content: safe center; }
.main-nav { gap: 0; white-space: nowrap; }
.main-nav li { display: flex; align-items: center; }
.main-nav li + li::before { content: ''; width: 1px; height: 14px; background: var(--rule); }
.main-nav a, .site-header .main-nav a { display: inline-flex; height: 46px; align-items: center; padding-inline: clamp(12px, 1.6vw, 22px); color: var(--body); font: italic 400 17px/1 var(--serif); letter-spacing: 0.01em; transition: color 160ms ease; }
.main-nav a:hover, .site-header .main-nav a:hover { color: var(--accent); }
.main-nav a[aria-current='page'] { color: var(--ink); text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 6px; }
.nav-search, .site-header .main-nav .nav-search { color: var(--meta); }
.content-grid { display: grid; grid-template-columns: 280px minmax(0, 1fr); grid-template-areas: 'lead lead' 'rail feed'; gap: clamp(36px, 4vw, 56px) clamp(32px, 4vw, 64px); padding-top: clamp(24px, 3vw, 40px); align-content: start; flex: 1; }
.content-grid:not(:has(.lead)) { grid-template-areas: 'rail feed'; }
.primary { display: contents; }
.primary > * { grid-area: feed; min-width: 0; }
.primary > .lead { grid-area: lead; }
.lead { position: relative; display: grid; max-width: none; grid-template-areas: 'stack'; grid-template-columns: minmax(0, 1fr); overflow: hidden; background: var(--panel); border: 1px solid var(--rule); }
.lead-figure { position: relative; display: block; grid-area: stack; aspect-ratio: 2.1 / 1; overflow: hidden; background: var(--panel); }
.lead-figure::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11, 17, 32, 0.94) 0%, rgba(11, 17, 32, 0.8) 34%, rgba(11, 17, 32, 0.15) 70%, rgba(11, 17, 32, 0) 100%), linear-gradient(0deg, rgba(11, 17, 32, 0.75) 0%, rgba(11, 17, 32, 0) 55%); }
.lead-figure img { display: block; width: 100%; height: 100%; object-fit: cover; filter: saturate(0.85); transition: transform 900ms cubic-bezier(0.2, 0.7, 0.2, 1); }
.lead-figure:hover img { transform: scale(1.02); }
.lead .post-image-placeholder { display: none; }
.lead-copy { position: relative; display: flex; min-width: 0; grid-area: stack; align-self: end; flex-direction: column; gap: 16px; padding: clamp(32px, 4vw, 56px); pointer-events: none; }
.lead-copy > * { pointer-events: auto; }
.lead:has(.post-image-placeholder) .lead-copy { padding-top: clamp(32px, 4vw, 56px); }
.lead-title { max-width: 22ch; color: var(--ink); font: 400 clamp(34px, 4.4vw, 66px)/1.02 var(--serif); letter-spacing: -0.018em; text-wrap: balance; }
.lead-title a { background-image: linear-gradient(var(--accent), var(--accent)); background-repeat: no-repeat; background-size: 0 2px; background-position: 0 96%; transition: background-size 320ms ease; }
.lead-title a:hover { color: var(--ink); background-size: 100% 2px; }
.lead-excerpt { max-width: 620px; color: var(--body); font: italic 400 clamp(17px, 1.4vw, 20px)/1.5 var(--serif); }
.lead .meta { max-width: 620px; padding-top: 14px; border-top: 1px solid rgba(241, 243, 247, 0.18); }
.section-heading { display: flex; align-items: center; justify-content: flex-start; gap: 14px; margin-bottom: 0; padding: 0 0 16px; border-top: 0; }
.section-heading::after { content: ''; order: 1; flex: 1; height: 1px; background: var(--rule); }
.section-heading h2 { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font: 500 12px/1.2 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; }
.section-heading h2::before { content: ''; width: 8px; height: 8px; background: var(--accent); }
.section-heading h1 { color: var(--ink); font: 400 clamp(38px, 4.6vw, 64px)/1.02 var(--serif); letter-spacing: -0.018em; text-wrap: balance; }
.section-heading:has(h1) { flex-wrap: wrap; align-items: flex-end; padding-bottom: 24px; }
.section-heading:has(h1)::after { display: none; }
.section-heading > a { order: 2; color: var(--meta); font: 500 11px/1.2 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }
.section-heading:has(h1) > a { margin-left: auto; padding-bottom: 8px; }
.section-heading > a::after { content: '↗'; margin-left: 6px; color: var(--accent); }
.section-heading > a:hover { color: var(--accent); }
.feed-section, .index-section { padding-top: 0; }
.post-list, .post-list[data-variant='grid'], .post-list[data-variant='list'] { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; margin-inline: 0; border-top: 1px solid var(--rule); }
.post-card, .post-list[data-variant='grid'] .post-card, .post-list[data-variant='list'] .post-card { display: grid; max-width: none; min-width: 0; grid-template-columns: 128px minmax(0, 1fr) clamp(160px, 18vw, 232px); grid-template-rows: auto auto 1fr; grid-template-areas: 'cat title image' 'date title image' '. excerpt image'; gap: 10px clamp(20px, 2.4vw, 36px); padding: 26px 0; border: 0; border-bottom: 1px solid var(--rule); }
.post-list .post-card:last-child, .post-list[data-variant] .post-card:last-child { border-bottom: 0; }
.post-copy { display: contents; }
.post-card .category { grid-area: cat; padding-top: 6px; }
.post-card .post-date { grid-area: date; }
.post-title { grid-area: title; color: var(--ink); font: 400 clamp(22px, 1.9vw, 28px)/1.16 var(--serif); letter-spacing: -0.01em; text-wrap: balance; }
.post-title a { background-image: linear-gradient(var(--accent), var(--accent)); background-repeat: no-repeat; background-size: 0 1px; background-position: 0 100%; transition: background-size 260ms ease; }
.post-title a:hover { color: var(--ink); background-size: 100% 1px; }
.excerpt, .post-list[data-variant='grid'] .excerpt { display: block; grid-area: excerpt; max-width: 60ch; color: var(--body); font: 16px/1.55 var(--serif); }
.post-image, .post-list[data-variant='list'] .post-image { display: block; grid-area: image; align-self: start; order: 0; overflow: hidden; aspect-ratio: 4 / 3; background: var(--panel); border: 1px solid var(--rule); }
.post-image img { display: block; width: 100%; height: 100%; object-fit: cover; filter: saturate(0.6) contrast(1.05); transition: filter 320ms ease; }
.post-card:hover .post-image img { filter: none; }
.feed-end { margin-top: 24px; color: var(--meta); font: 11px/1.4 var(--mono); letter-spacing: 0.12em; text-align: center; text-transform: uppercase; }
.feed-end::before, .feed-end::after { content: ' ── '; color: var(--rule); }
.feed-sentinel { height: 1px; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 28px; padding-top: 0; border-top: 0; font: 500 12px/1 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
.pagination a, .pagination strong, .pagination span { display: inline-flex; min-width: 40px; height: 40px; align-items: center; justify-content: center; padding-inline: 10px; border: 0; border-bottom: 1px solid transparent; color: var(--body); }
.pagination a:hover { border-color: var(--accent); color: var(--accent); }
.pagination strong { border-color: var(--accent); color: var(--accent); background: transparent; }
.pagination > span { color: var(--rule); }
.pagination > a:first-child::before { content: '←'; margin-right: 8px; }
.pagination > a:last-child::after { content: '→'; margin-left: 8px; }
.pagination-numbers { display: flex; flex-wrap: wrap; gap: 4px; }
.sidebar, .editorial-rail { display: flex; min-width: 0; grid-area: rail; align-self: start; margin-top: 0; padding: 0 clamp(20px, 2.4vw, 32px) 0 0; flex-direction: column; gap: 36px; border-top: 0; border-right: 1px solid var(--rule); }
.sidebar h2, .editorial-rail h2 { padding: 0 0 12px; border-top: 0; border-bottom: 1px solid var(--rule); color: var(--meta); font: 500 12px/1.2 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; }
.sidebar ul, .sidebar ol, .editorial-rail ul, .editorial-rail ol { display: flex; margin: 0; padding: 0; flex-direction: column; list-style: none; }
.rail-list { counter-reset: rail; }
.rail-list li { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 8px; padding: 14px 0; border-bottom: 1px solid var(--rule-soft); counter-increment: rail; }
.rail-list li::before { content: counter(rail, decimal-leading-zero); grid-row: 1 / span 2; padding-top: 4px; color: var(--accent); font: 500 12px/1 var(--mono); letter-spacing: 0.04em; }
.rail-list li:last-child { border-bottom: 0; }
.rail-list a { color: var(--ink); font: 400 17px/1.28 var(--serif); }
.rail-list a:hover { color: var(--accent); }
.rail-stamp { grid-column: 2; order: 2; margin-top: 6px; color: var(--meta); font: 11.5px/1.3 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }
.archive-list li { border-bottom: 1px solid var(--rule-soft); }
.archive-list li:last-child { border-bottom: 0; }
.archive-list a { display: flex; min-height: 40px; align-items: center; gap: 10px; color: var(--body); font: 12px/1.3 var(--mono); letter-spacing: 0.04em; }
.archive-list a > span:first-child { display: flex; flex: 1; align-items: baseline; gap: 10px; }
.archive-list a > span:first-child::after { content: ''; flex: 1; border-bottom: 1px dotted var(--rule); }
.archive-list a:hover { color: var(--accent); }
.archive-count { min-width: 0; padding: 0; background: none; color: var(--accent); font: 500 12px/1 var(--mono); text-align: right; }
.sidebar-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.sidebar-tags a, .article-tags a { display: inline-flex; min-height: 36px; align-items: center; padding: 0 14px; border: 1px solid var(--rule); border-radius: 999px; color: var(--body); font: 12px/1 var(--mono); letter-spacing: 0.04em; text-transform: lowercase; transition: border-color 160ms ease, color 160ms ease, background 160ms ease; }
.sidebar-tags a:hover, .article-tags a:hover { border-color: var(--accent); background: var(--accent-wash); color: var(--accent); }
.sidebar-empty { color: var(--meta); font: 13px/1.6 var(--mono); }
.comments-empty, .comments p.comments-empty { color: var(--body); font: italic 19px/1.5 var(--serif); }
.field-row { display: flex; gap: 0; }
input[type='search'], input[name='q'] { flex: 1; min-width: 0; height: 44px; padding: 0 14px; border: 1px solid var(--rule); border-radius: 2px; background: var(--panel); color: var(--ink); font: 14px/1 var(--mono); }
input::placeholder, textarea::placeholder { color: var(--meta); }
input:focus, textarea:focus { outline: none; border-color: var(--accent); }
button[type='submit'] { height: 44px; padding: 0 20px; border: 1px solid var(--accent); border-radius: 2px; background: var(--accent); color: var(--accent-ink); font: 600 11px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
button[type='submit']:hover { background: transparent; color: var(--accent); }
.post-body { display: grid; width: min(1180px, calc(100% - var(--gutter) * 2)); margin-inline: auto; padding-top: clamp(32px, 4vw, 64px); grid-template-columns: [full-start] minmax(0, 1fr) [side-start] var(--side) [side-end] clamp(32px, 4vw, 56px) [main-start] minmax(0, var(--column)) [main-end] minmax(0, 1fr) [full-end]; grid-template-rows: auto auto minmax(0, 1fr) auto; grid-auto-flow: row; align-content: start; flex: 1; }
.post-body > * { grid-column: main; min-width: 0; }
.article-head { display: contents; }
.breadcrumb { display: flex; grid-column: side; grid-row: 1; flex-wrap: wrap; align-items: center; align-self: start; gap: 6px; padding-top: 12px; color: var(--meta); font: 12px/1.4 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }
.breadcrumb a:hover { color: var(--accent); }
.article-head .category { grid-column: side; grid-row: 2; align-self: start; margin-top: 14px; }
.post-body h1 { grid-column: main; grid-row: 1 / span 3; color: var(--ink); font: 400 clamp(36px, 4.8vw, 68px)/1.03 var(--serif); letter-spacing: -0.02em; text-wrap: balance; }
.standfirst { grid-column: main; grid-row: 4; margin-top: 24px; color: var(--body); font: italic 400 clamp(19px, 1.6vw, 23px)/1.48 var(--serif); text-wrap: pretty; }
.byline { display: flex; grid-column: side; grid-row: 3 / span 2; align-self: start; margin-top: 28px; padding-top: 18px; flex-direction: column; align-items: flex-start; gap: 6px; border-top: 1px solid var(--rule); color: var(--meta); font: 12px/1.5 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.byline > span[aria-hidden='true']:not(.byline-avatar) { display: none; }
.byline a { color: var(--ink); }
.byline a:hover { color: var(--accent); }
.byline-avatar { display: inline-grid; width: 40px; height: 40px; margin-bottom: 6px; place-items: center; border: 1px solid var(--accent); border-radius: 50%; background: transparent; color: var(--accent); font: 400 20px/1 var(--didone); text-transform: uppercase; }
.updated-time { color: var(--meta); }
.article-figure { grid-column: side-start / main-end; max-width: none; margin: clamp(32px, 4vw, 56px) 0 0; }
.article-figure img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: var(--panel); border: 1px solid var(--rule); }
.article-figure figcaption { padding: 12px 0 0; color: var(--meta); font: 11px/1.5 var(--mono); letter-spacing: 0.04em; }
.prose { max-width: none; margin: clamp(36px, 4vw, 56px) 0 0; color: var(--prose); font: 20px/1.72 var(--serif); }
.prose > * + * { margin-top: 24px; }
.prose > p:first-child { color: var(--ink); }
.prose > p:first-child::first-letter { float: left; margin: 0.06em 0.1em 0 0; color: var(--accent); font: 400 5.2em/0.74 var(--didone); }
@supports (initial-letter: 3) or (-webkit-initial-letter: 3) { .prose > p:first-child::first-letter { float: none; margin: 0 0.12em 0 0; font-size: 1em; line-height: 1; -webkit-initial-letter: 3; initial-letter: 3; } }
.prose h2, .prose h3 { clear: both; margin-top: 48px; color: var(--ink); font: 400 30px/1.2 var(--serif); letter-spacing: -0.01em; }
.prose h2::before { content: ''; display: block; width: 40px; height: 2px; margin-bottom: 16px; background: var(--accent); }
.prose h3 { font: italic 400 23px/1.3 var(--serif); }
.prose img { display: block; width: 100%; height: auto; margin: 32px 0; border: 1px solid var(--rule); }
.prose figure { margin: 36px 0; }
.prose figcaption { margin-top: 10px; color: var(--meta); font: 11px/1.5 var(--mono); letter-spacing: 0.04em; }
.prose a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 4px; transition: background 160ms ease, color 160ms ease; }
.prose a:hover { color: var(--accent-ink); background: var(--accent); text-decoration-color: var(--accent); }
.prose blockquote { position: relative; margin: 44px 0; padding: 0 0 0 clamp(28px, 4vw, 56px); border: 0; color: var(--ink); font: italic 400 clamp(24px, 2.2vw, 30px)/1.35 var(--serif); letter-spacing: -0.01em; }
.prose blockquote::before { content: '“' / ''; position: absolute; top: -0.12em; left: -0.06em; color: var(--accent); font: 400 2.8em/1 var(--didone); }
.prose blockquote p + p { margin-top: 14px; }
.prose ul, .prose ol { padding-left: 24px; }
.prose li + li { margin-top: 10px; }
.prose li::marker { color: var(--accent); font-family: var(--mono); }
.prose code { padding: 2px 6px; border: 1px solid var(--rule); border-radius: 2px; background: var(--panel); color: var(--ink); font: 0.8em/1.4 var(--mono); }
.prose pre { overflow-x: auto; padding: 18px 20px; border: 1px solid var(--rule); border-left: 2px solid var(--accent); background: var(--panel); font: 14px/1.6 var(--mono); }
.prose pre code { padding: 0; border: 0; background: none; font-size: inherit; }
.prose hr { height: 1px; margin: 44px 0; border: 0; background: var(--rule); }
.article-tags { display: flex; max-width: none; margin: 44px 0 0; padding-top: 22px; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--rule); }
.article-tags::before { content: 'Filed under' / ''; margin-right: 6px; color: var(--meta); font: 500 12px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; }
.post-body > .article-tags { grid-column: side; grid-row: 5; align-self: start; position: sticky; top: 28px; margin-top: clamp(36px, 4vw, 56px); padding-top: 18px; }
.post-body:has(> .article-figure) > .article-tags { grid-row: 6; }
.post-body > .article-tags::before { flex-basis: 100%; margin: 0 0 6px; }
.article-related { max-width: none; margin: 48px 0 0; padding-top: 0; border-top: 0; }
.article-related h2 { display: flex; align-items: center; gap: 12px; padding: 0 0 14px; border-top: 0; color: var(--ink); font: 500 12px/1.2 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; }
.article-related h2::before { content: ''; width: 8px; height: 8px; background: var(--accent); }
.article-related h2::after { content: ''; flex: 1; height: 1px; background: var(--rule); }
.article-related p { margin-top: 0; font: italic 400 clamp(20px, 1.8vw, 24px)/1.3 var(--serif); }
.article-related a { color: var(--ink); }
.article-related p a { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--rule); }
.article-related p a::after { content: '→' / ''; color: var(--accent); font: 400 24px/1 var(--mono); transition: transform 200ms ease; }
.article-related p a:hover::after { transform: translateX(6px); }
.article-related a:hover { color: var(--accent); }
.article-related .rail-list { counter-reset: rail; margin: 4px 0 0; padding: 0; list-style: none; }
.article-related .rail-list a { text-decoration: none; }
.plugin-slot { max-width: none; margin: 32px 0 0; padding-top: 16px; border-top: 1px solid var(--rule-soft); color: var(--meta); font: 12px/1.6 var(--mono); }
.plugin-slot p { margin: 0; }
.post-body > small { display: block; max-width: none; margin: 40px 0 0; padding-top: 16px; border-top: 1px solid var(--rule-soft); color: var(--meta); font: 11px/1.5 var(--mono); word-break: break-all; }
.post-body > p, .post-body > ul { max-width: var(--measure); margin-top: 16px; color: var(--prose); font: 19px/1.7 var(--serif); }
.post-body > ul { padding-left: 22px; }
.post-body > a { display: inline-flex; width: fit-content; min-height: 44px; align-items: center; margin-top: 24px; padding: 0 20px; border: 1px solid var(--accent); color: var(--accent); font: 500 11px/1 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; }
.post-body > a:hover { background: var(--accent); color: var(--accent-ink); }
.post-body label { display: block; margin: 24px 0 10px; color: var(--meta); font: 500 11px/1.2 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; }
.post-body input[type='search'] { width: min(440px, 100%); }
.post-body [aria-live] { margin-top: 14px; color: var(--meta); font: 12px/1.4 var(--mono); }
.post-body .post-list { margin-top: 28px; }
.author-profile { padding-top: clamp(32px, 4vw, 56px); }
.author-profile h1 { margin: 14px 0 14px; color: var(--ink); font: 400 clamp(36px, 4.4vw, 60px)/1.04 var(--serif); letter-spacing: -0.018em; }
.author-profile p:last-child { max-width: 60ch; color: var(--body); font: italic 19px/1.55 var(--serif); }
.comments { max-width: none; margin: 56px 0 0; padding-top: 0; border-top: 0; font-family: var(--serif); }
.comments h2 { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); color: var(--ink); font: 500 12px/1.2 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; }
.comments h2::before { content: ''; width: 8px; height: 8px; background: var(--accent); }
.comments [data-comment-status] { color: var(--meta); font: 12px/1.6 var(--mono); }
.comment-list { display: grid; gap: 0; margin: 12px 0 0; padding: 0; list-style: none; }
.comment-list li { padding: 18px 0 18px 20px; border-left: 1px solid var(--accent); border-bottom: 1px solid var(--rule-soft); background: none; }
.comment-list li strong { display: block; color: var(--ink); font: 500 12px/1.3 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }
.comment-list p { margin-top: 8px; color: var(--prose); font: 17px/1.6 var(--serif); }
.comment-form { display: grid; gap: 16px; margin-top: 28px; padding: 24px; border: 1px solid var(--rule); background: var(--panel); }
.comment-form label { display: grid; gap: 8px; color: var(--meta); font: 500 11px/1.3 var(--mono); letter-spacing: 0.14em; text-transform: uppercase; }
.comment-form input, .comment-form textarea { width: 100%; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 2px; background: var(--ground); color: var(--ink); font: 16px/1.5 var(--serif); letter-spacing: 0; text-transform: none; }
.comment-form input:focus, .comment-form textarea:focus { outline: none; border-color: var(--accent); }
.comment-form textarea { min-height: 128px; resize: vertical; }
.comment-form button[type='submit'] { justify-self: start; }
.comment-form button:disabled { cursor: not-allowed; opacity: 0.5; }
.comment-verification-note, [data-comment-submit-status], [data-human-verification-status] { color: var(--meta); font: 12px/1.5 var(--mono); }
.site-footer { margin-top: clamp(56px, 7vw, 96px); padding: 0; background: var(--ground); color: var(--meta); border-top: 1px solid var(--rule); }
.site-footer a { color: var(--body); }
.site-footer a:hover { color: var(--accent); }
.footer-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px clamp(20px, 3vw, 40px); padding: 28px 0 22px; }
.footer-main[data-brand]::before { content: attr(data-brand); margin-right: auto; color: var(--ink); font: 400 20px/1 var(--didone); letter-spacing: 0.16em; text-transform: uppercase; }
.footer-col { display: flex; flex-wrap: wrap; align-items: center; gap: 0 18px; }
.footer-col h2 { margin: 0 4px 0 0; color: var(--meta); font: 500 10.5px/1 var(--mono); letter-spacing: 0.16em; text-transform: uppercase; }
.footer-col h2::after { content: ' /' / ''; color: var(--accent); }
.footer-col a, .footer-col span { display: inline-flex; min-height: 40px; align-items: center; color: var(--body); font: 12px/1.4 var(--mono); letter-spacing: 0.06em; }
.footer-col + .footer-col { padding-left: clamp(20px, 3vw, 40px); border-left: 1px solid var(--rule); }
.footer-col a:hover { color: var(--accent); }
.footer-bar-inner { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--rule-soft); color: var(--meta); font: 11px/1.4 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }
.footer-bar-inner small { font-size: inherit; }
.to-top, .site-footer .to-top { display: inline-flex; min-height: 40px; align-items: center; color: var(--accent); }
.to-top::after { content: ' ↑'; white-space: pre; }
.to-top:hover, .site-footer .to-top:hover { color: var(--ink); }
.publisher-x-post { margin: 40px 0; padding: 22px 24px 18px; border: 1px solid var(--rule); border-left: 2px solid var(--accent); border-radius: 0; background: var(--panel); }
.publisher-x-post blockquote, .prose .publisher-x-post blockquote { margin: 0; padding: 0; border: 0; color: var(--ink); font: 400 19px/1.55 var(--serif); font-style: normal; letter-spacing: 0; }
.publisher-x-post blockquote::before, .prose .publisher-x-post blockquote::before { content: none; }
.publisher-x-post blockquote p { margin: 0; }
.publisher-x-post figcaption, .prose .publisher-x-post figcaption { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--rule); color: var(--meta); font: 500 11px/1.4 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; }
.publisher-x-post figcaption::before { content: 'POST' / ''; padding: 3px 6px; border: 1px solid var(--rule); color: var(--meta); font-size: 10px; }
.publisher-x-post figcaption a, .prose .publisher-x-post figcaption a { color: var(--accent); text-decoration: none; }
.publisher-x-post figcaption a::after { content: ' ↗' / ''; }
.publisher-x-post figcaption a:hover { color: var(--ink); background: none; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@media (max-width: 1100px) { .content-grid, .content-grid:not(:has(.lead)) { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'lead' 'feed' 'rail'; } .content-grid:not(:has(.lead)) { grid-template-areas: 'feed' 'rail'; } .sidebar, .editorial-rail { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px clamp(24px, 3vw, 40px); padding: 32px 0 0; border-right: 0; border-top: 1px solid var(--rule); } .sidebar, .editorial-rail { grid-template-rows: auto 1fr; align-items: start; } .sidebar > section:first-child { grid-row: span 2; } .footer-main[data-brand]::before { flex-basis: 100%; margin: 0 0 6px; } }
@media (max-width: 900px) { .footer-main { align-items: flex-start; flex-direction: column; gap: 0; padding: 28px 0 12px; } .footer-main[data-brand]::before { margin: 0 0 10px; font-size: 18px; } .footer-col + .footer-col { padding-left: 0; border-left: 0; } }
@media (max-width: 1000px) { .post-body { grid-template-rows: none; grid-template-columns: [full-start side-start main-start] minmax(0, 1fr) [full-end side-end main-end]; width: min(var(--column), calc(100% - var(--gutter) * 2)); } .breadcrumb, .article-head .category, .post-body h1, .standfirst, .byline, .post-body > .article-tags, .post-body:has(> .article-figure) > .article-tags { grid-column: main; grid-row: auto; } .post-body > .article-tags { position: static; margin-top: 44px; padding-top: 22px; } .post-body > .article-tags::before { flex-basis: auto; margin: 0 6px 0 0; } .breadcrumb { justify-content: center; padding-top: 0; } .article-head .category { justify-self: center; margin: 18px 0 18px; } .post-body h1 { text-align: center; } .standfirst { margin-top: 18px; text-align: center; } .byline { justify-content: center; margin-top: 24px; padding-top: 20px; border-top: 0; background: linear-gradient(var(--accent), var(--accent)) top center / 48px 1px no-repeat; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 14px; } .byline-avatar { margin-bottom: 0; } .article-figure { grid-column: main; } }
@media (max-width: 760px) { body { font-size: 17px; } .container { width: calc(100% - 32px); } .post-body { width: calc(100% - 32px); } .topbar-inner { gap: 12px; font-size: 10.5px; letter-spacing: 0.06em; } .topbar-nav { gap: 16px; } .main-header-inner { padding-block: 22px 20px; } .section-nav-inner { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; } .section-nav-inner::-webkit-scrollbar { display: none; } .main-nav a, .site-header .main-nav a { height: 44px; padding-inline: 12px; font-size: 16px; } .main-nav li:first-child a { padding-left: 0; } .main-nav li:last-child a { padding-right: 0; } .lead { margin-inline: -16px; border-inline: 0; } .lead-figure { aspect-ratio: 4 / 5; } .lead-figure::after { background: linear-gradient(180deg, rgba(11, 17, 32, 0) 30%, rgba(11, 17, 32, 0.85) 62%, rgba(11, 17, 32, 0.98) 100%); } .lead-copy { gap: 12px; padding: 120px 16px 22px; } .lead:has(.post-image-placeholder) .lead-copy { padding-top: 28px; } .lead-title { font-size: clamp(30px, 8.6vw, 40px); } .lead-excerpt { font-size: 16.5px; } .lead .meta { padding-top: 12px; } .post-card, .post-list[data-variant='grid'] .post-card, .post-list[data-variant='list'] .post-card { grid-template-columns: minmax(0, 1fr) 104px; grid-template-rows: auto auto auto; grid-template-areas: 'cat image' 'title image' 'date image' 'excerpt excerpt'; gap: 8px 16px; padding: 20px 0; } .post-card .category { padding-top: 0; } .article-figure { margin-inline: -16px; } .article-figure img { border-inline: 0; } .post-image, .post-list[data-variant='list'] .post-image { aspect-ratio: 1; } .post-title { font-size: 21px; line-height: 1.2; } .excerpt, .post-list[data-variant='grid'] .excerpt { font-size: 15px; } .pagination { flex-wrap: wrap; } .prose { font-size: 18.5px; line-height: 1.7; } .prose blockquote { padding-left: 28px; } .category, .breadcrumb a, .meta a, .byline a { position: relative; } .category::after, .breadcrumb a::after, .meta a::after, .byline a::after { content: ''; position: absolute; inset: -12px -4px; } .publisher-x-post figcaption { padding-top: 4px; } .publisher-x-post figcaption a { display: inline-flex; min-height: 40px; align-items: center; } .section-heading > a { display: inline-flex; min-height: 40px; align-items: center; } }
@media (max-width: 520px) { .topbar-inner { gap: 10px; font-size: 10px; letter-spacing: 0.03em; } .topbar-nav { gap: 12px; } .topbar-date { gap: 8px; } .lead-excerpt { display: none; } .post-card, .post-list[data-variant='grid'] .post-card, .post-list[data-variant='list'] .post-card { grid-template-columns: minmax(0, 1fr) 88px; } .excerpt, .post-list[data-variant='grid'] .excerpt, .post-list[data-variant='list'] .excerpt { display: none; } .post-title { font-size: 19px; } .post-body h1 { font-size: 34px; } .section-heading h1 { font-size: 36px; } .standfirst { font-size: 19px; } .publisher-x-post { padding: 18px 18px 14px; } .publisher-x-post blockquote, .prose .publisher-x-post blockquote { font-size: 17px; } .sidebar-tags a, .article-tags a { min-height: 40px; } .footer-bar-inner { align-items: flex-start; flex-direction: column; justify-content: center; gap: 0; padding-block: 8px; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } .topbar-date::before { animation: none; } }
`,
}
