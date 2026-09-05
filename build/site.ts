// site.ts — the front page: every card server-rendered, the miniatures drawn client-side by
// front-app.js with the reviewer's own Three.js bundle and layout module inlined once.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Card } from './review.ts';

export interface SiteAssets {
  reviewerTag: string;
  built: string;         // YYYY-MM-DD
  three: string;         // bundleThree() output
  layoutJs: string;      // schema-3d-layout.js source, exports intact
  css: string;
  app: string;
  clips: Set<string>;    // slugs that have a site/<slug>/clip.mp4 recorded
}

const e = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number): string => x.toLocaleString('en-GB');

/** A module's `export` keywords removed, so it can be inlined as a classic script. */
export function inlineModule(src: string): string {
  return src.replace(/^export (?=(function|const|let|class)\b)/gm, '');
}

/**
 * What a card shows when the page cannot draw in 3D: the recorded clip of that explorer turning,
 * with the flat map as its poster, or the map alone when no clip was recorded (a local build
 * without ffmpeg). Hidden once WebGL is up; the clip is not fetched until it is needed.
 */
function posterHtml(c: Card, clips: Set<string>): string {
  const map = `${e(c.slug)}/schema-map.svg`;
  return clips.has(c.slug)
    ? `<video class="poster" src="${e(c.slug)}/clip.mp4" poster="${map}" preload="none" muted loop playsinline></video>`
    : `<img class="poster" src="${map}" alt="" loading="lazy">`;
}

function cardHtml(c: Card, clips: Set<string>): string {
  const f = c.stats.findings;
  const commitUrl = `https://github.com/${c.repo}/tree/${c.commit}`;
  return `<article class="pcard" id="p-${e(c.slug)}">`
    + `<div class="mini" data-slug="${e(c.slug)}" aria-hidden="true">`
    + posterHtml(c, clips)
    + `<span class="lic">${e(c.license)}</span>${c.stress ? '<span class="stress">stress test</span>' : ''}</div>`
    + `<div class="body"><h2>${e(c.name)}</h2><p class="blurb">${e(c.blurb)}</p>`
    + `<p class="src"><a href="${e(commitUrl)}">${e(c.repo)} at ${e(c.ref)}</a> · <a href="${e(c.homepage)}">site</a></p>`
    + `<div class="stats"><span>${n(c.stats.tables)} tables</span><span>${n(c.stats.foreign_keys)} foreign keys</span>`
    + `<span>${n(c.stats.domains)} domains${c.domainsHow === 'prefix' ? ' <i>by table prefix</i>' : ''}</span>`
    + `<span class="e">${n(f.error)} errors</span><span class="w">${n(f.warn)} warnings</span><span>${n(f.info)} notes</span></div>`
    + `<div class="btns"><a class="pri" href="${e(c.slug)}/schema-3d.html">Explore in 3D</a><a href="${e(c.slug)}/index.html">Docs &amp; findings</a></div>`
    + '</div></article>';
}

export function renderIndex(cards: Card[], a: SiteAssets): string {
  const data = JSON.stringify({ cards: cards.map((c) => ({ slug: c.slug, mini: c.mini })) }).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>postgres-schema-gallery</title>'
    + '<meta name="description" content="Real PostgreSQL schemas behind well-known open-source products, documented and reviewed, each with a rotatable 3D explorer.">'
    + `<style>${a.css}</style></head><body>\n`
    + '<canvas id="gl" aria-hidden="true"></canvas>\n'
    + '<main>'
    + '<header><h1>Real PostgreSQL schemas, reviewed</h1>'
    + '<p class="tag">The database behind each product, documented and reviewed by <a href="https://github.com/greenstevester/archlens-postgres">ArchLens Postgres</a>: '
    + 'every table, every foreign key, the design findings, and a 3D explorer you can rotate. Each schema is fetched from the project\'s own repository at a pinned commit; nothing is edited by hand.</p>'
    + '<div class="nogl-note" role="status">'
    + '<p><b>This browser is not letting the page draw in 3D</b> (WebGL is unavailable), so each card plays a recording of its explorer instead of the live miniature. The docs and findings links work as normal; the explorers themselves need WebGL.</p>'
    + '<p class="nogl-first">Quickest test: open this page in a private or incognito window. Extensions are off there, and canvas or fingerprint blockers are the usual cause.</p>'
    + '<p data-browser="chrome">Chrome: type <code>chrome://gpu</code> in the address bar and look at the WebGL lines. If they say Unavailable, open <code>chrome://settings/system</code>, turn on "Use graphics acceleration when available", and relaunch. As a last resort, <code>chrome://flags/#ignore-gpu-blocklist</code>.</p>'
    + '<p data-browser="edge">Edge: type <code>edge://gpu</code> in the address bar and look at the WebGL lines. If they say Unavailable, open <code>edge://settings/system</code>, turn on "Use graphics acceleration when available", and restart Edge.</p>'
    + '<p data-browser="firefox">Firefox: open <code>about:config</code>, search <code>webgl.disabled</code> and make sure it is <code>false</code>; <code>about:support</code> shows the graphics status under Graphics.</p>'
    + '<p data-browser="safari">Safari: WebGL is on by default. Check Safari → Settings → Advanced → "Show features for web developers", then the Develop menu → Feature Flags, and make sure WebGL is enabled.</p>'
    + '<p data-browser="other">Look for a WebGL or hardware acceleration setting in this browser, or try another browser.</p>'
    + '</div></header>\n'
    + `<section class="grid">${cards.map((c) => cardHtml(c, a.clips)).join('\n')}</section>\n`
    + '<footer><h2>Add a product</h2><p>Open a pull request that adds an entry to <code>products.json</code>: the repository, a commit, the schema file (plain SQL, Go migration strings, or a Prisma schema), the licence, and a blurb. '
    + 'A <code>products/&lt;slug&gt;/narratives.json</code> with hand-curated domains makes the review and the picture better; without one, domains come from table-name prefixes and the card says so.</p>'
    + `<p class="meta">Built ${e(a.built)} with ArchLens Postgres ${e(a.reviewerTag)}. Schemas remain under their projects' licences; see <a href="NOTICE.md">NOTICE</a>. Gallery code is MIT.</p></footer>`
    + '</main>\n'
    + `<script>window.GALLERY=${data};</script>\n`
    + `<script>${a.three}</script>\n`
    + `<script>${inlineModule(a.layoutJs)}</script>\n`
    + `<script>${a.app}</script>\n`
    + '</body></html>\n';
}

export function writeSite(cards: Card[], a: SiteAssets, siteDir: string): void {
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(path.join(siteDir, 'index.html'), renderIndex(cards, a));
  const summary = cards.map(({ mini, ...rest }) => rest);
  writeFileSync(path.join(siteDir, 'products.json'), `${JSON.stringify({ built: a.built, reviewer: a.reviewerTag, products: summary }, null, 2)}\n`);
  if (existsSync('NOTICE.md')) copyFileSync('NOTICE.md', path.join(siteDir, 'NOTICE.md'));
  writeFileSync(path.join(siteDir, '.nojekyll'), '');
}
