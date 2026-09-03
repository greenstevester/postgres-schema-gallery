import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sqlFromGoRawStrings } from '../build/fetch.ts';
import { checkManifest, loadManifest, type Manifest } from '../build/manifest.ts';
import { prefixNarratives } from '../build/narratives.ts';
import type { Card } from '../build/review.ts';
import { inlineModule, renderIndex } from '../build/site.ts';

const product = (slug: string): Manifest['products'][number] => ({
  slug, name: slug, homepage: 'https://example.org', repo: 'owner/name', commit: 'a'.repeat(40), ref: 'v1', license: 'MIT',
  blurb: 'b', source: { kind: 'sql', paths: ['schema.sql'] }, domains: 'prefix',
});
const manifest = (...slugs: string[]): Manifest => ({ reviewer: { repo: 'o/r', tag: 'v1.7.0' }, banner: slugs[0], products: slugs.map(product) });

describe('products.json', () => {
  it('the committed manifest is valid', () => {
    const m = loadManifest('products.json');
    assert.ok(m.products.length >= 7);
    assert.ok(m.products.some((p) => p.slug === 'gitlab' && p.stress));
  });

  it('rejects a duplicate slug, a short commit, an unknown kind and a banner that is not a product', () => {
    assert.throws(() => checkManifest(manifest('a', 'a')), /duplicate slug/);
    const short = manifest('a'); short.products[0].commit = 'abc';
    assert.throws(() => checkManifest(short), /40-character sha/);
    const kind = manifest('a'); (kind.products[0].source as { kind: string }).kind = 'zip';
    assert.throws(() => checkManifest(kind), /source\.kind/);
    const banner = manifest('a'); banner.banner = 'nope';
    assert.throws(() => checkManifest(banner), /banner must name/);
  });
});

describe('sqlFromGoRawStrings', () => {
  it('keeps backtick strings that start with a SQL verb and drops the rest', () => {
    const go = 'var m = []string{`\n  CREATE TABLE a (id int);\n`, `extra`, `users`, `\n  ALTER TABLE a ADD COLUMN b text\n`, "not sql", `DECLARE c CURSOR FOR SELECT 1`}';
    const sql = sqlFromGoRawStrings(go);
    assert.equal(sql, 'CREATE TABLE a (id int);\n\nALTER TABLE a ADD COLUMN b text;\n');
  });
});

describe('prefixNarratives', () => {
  it('claims every table once: shared prefixes become domains, singletons go to misc', () => {
    const tables = ['ci_builds', 'ci_runners', 'users', 'projects', 'project_members', 'ci_pipelines'];
    const n = prefixNarratives(product('x'), tables);
    assert.deepEqual(n.domains.map((d) => d.key), ['ci', 'misc']);
    assert.deepEqual(n.domains[0].tables, ['ci_builds', 'ci_runners', 'ci_pipelines']);
    assert.deepEqual(n.domains[1].tables.sort(), ['project_members', 'projects', 'users']);
    const claimed = n.domains.flatMap((d) => d.tables).sort();
    assert.deepEqual(claimed, [...tables].sort());
    assert.match(n.database.blurb, /by table-name prefix/);
  });

  it('groups CamelCase names by their leading word, as Prisma schemas need', () => {
    const tables = ['Booking', 'BookingReference', 'BookingSeat', 'EventType', 'EventTypeCustomInput', 'User', '_prisma_migrations'];
    const n = prefixNarratives(product('x'), tables);
    assert.deepEqual(n.domains.map((d) => d.key), ['Booking', 'Event', 'misc']);
    assert.deepEqual(n.domains[0].tables, ['Booking', 'BookingReference', 'BookingSeat']);
    assert.deepEqual(n.domains[1].tables, ['EventType', 'EventTypeCustomInput']);
    assert.deepEqual(n.domains[2].tables, ['User', '_prisma_migrations']);
  });
});

describe('renderIndex', () => {
  const card = (slug: string, tables: number): Card => ({
    slug, name: slug.toUpperCase(), homepage: 'https://example.org', repo: 'o/r', commit: 'b'.repeat(40), ref: 'v2', license: 'MIT',
    blurb: 'A <b>blurb</b>', stress: slug === 'big', domainsHow: slug === 'big' ? 'prefix' : 'curated',
    stats: { tables, columns: 10, foreign_keys: 3, domains: 2, findings: { error: 1, warn: 2, info: 3 } },
    mini: { domains: [{ key: 'd', title: 'd', color: '#ffffff' }], tables: [{ name: 't', domain: 'd' }], fks: [], hubs: [] },
  });
  const assets = { reviewerTag: 'v1.7.0', built: '2026-09-03', three: '/* three:start */const THREE={};/* three:end */', layoutJs: 'export const CARD = 1;\nexport function layout(m) { return m; }\n', css: 'body{}', app: '(() => {})();' };
  const html = renderIndex([card('small', 12), card('big', 1429)], assets);

  it('renders one card per product with escaped text, counts, links and the stress label', () => {
    assert.equal((html.match(/<article class="pcard"/g) ?? []).length, 2);
    assert.match(html, /A &lt;b&gt;blurb&lt;\/b&gt;/);
    assert.match(html, /1,429 tables/);
    assert.match(html, /<span class="stress">stress test<\/span>/);
    assert.match(html, /by table prefix/);
    assert.match(html, /href="big\/schema-3d\.html"/);
    assert.match(html, /href="https:\/\/github\.com\/o\/r\/tree\/b{40}"/);
  });

  it('loads nothing from the web and inlines the bundle, the layout module and the app', () => {
    assert.doesNotMatch(html, /<script src=/);
    assert.doesNotMatch(html, /<link[^>]+href="http/);
    assert.match(html, /window\.GALLERY=\{"cards":\[\{"slug":"small"/);
    assert.match(html, /\/\* three:start \*\//);
    assert.match(html, /<script>const CARD = 1;\nfunction layout\(m\)/);
    assert.doesNotMatch(html, /^export /m);
  });

  it('inlineModule strips only leading export keywords', () => {
    assert.equal(inlineModule('export const A = 1;\nconst exported = 2;\nexport function f() {}\n'), 'const A = 1;\nconst exported = 2;\nfunction f() {}\n');
  });
});
