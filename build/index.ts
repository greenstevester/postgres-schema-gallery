// index.ts — the pipeline: reviewer → fetch → narratives → review → site → banner.
//
//   node build/index.ts [--only <slug>] [--no-banner]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { recordBanner } from './banner.ts';
import { CACHE, fetchSchema } from './fetch.ts';
import { loadManifest } from './manifest.ts';
import { REVIEWER_DIR, SKILL_DIR, loadReviewer, reviewProduct, type Card } from './review.ts';
import { writeSite } from './site.ts';

const SITE = 'site';

/**
 * A shallow clone of the reviewer at the pinned tag, with its dependencies installed. For local
 * work on an unreleased reviewer, GALLERY_REVIEWER_DIR names a checkout to use instead of cloning;
 * the build says so, because the site then no longer matches the tag in products.json.
 */
function ensureReviewer(repo: string, tag: string): void {
  const local = process.env.GALLERY_REVIEWER_DIR;
  if (local) {
    if (!existsSync(path.join(local, 'skills', 'db-architecture-review', 'scripts', 'db-review.ts'))) throw new Error(`GALLERY_REVIEWER_DIR ${local} is not a reviewer checkout`);
    rmSync(REVIEWER_DIR, { recursive: true, force: true });
    mkdirSync(CACHE, { recursive: true });
    symlinkSync(path.resolve(local), REVIEWER_DIR, 'dir');
    console.log(`reviewer: using local checkout ${local} instead of ${tag} (development only)`);
    return;
  }
  const stamp = path.join(REVIEWER_DIR, '.gallery-tag');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === tag) return;
  rmSync(REVIEWER_DIR, { recursive: true, force: true });
  const clone = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--branch', tag, `https://github.com/${repo}.git`, REVIEWER_DIR], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`clone of ${repo}@${tag} failed: ${clone.stderr}`);
  const install = spawnSync('npm', ['ci', '--no-audit', '--no-fund', '--silent'], { cwd: SKILL_DIR, encoding: 'utf8' });
  if (install.status !== 0) throw new Error(`npm ci in the reviewer failed: ${install.stderr}`);
  writeFileSync(stamp, `${tag}\n`);
}

const today = (): string => new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { only: { type: 'string' }, 'no-banner': { type: 'boolean', default: false } } });
  const manifest = loadManifest();
  ensureReviewer(manifest.reviewer.repo, manifest.reviewer.tag);
  const lib = await loadReviewer();
  const products = values.only ? manifest.products.filter((p) => p.slug === values.only) : manifest.products;
  if (!products.length) throw new Error(`no product called ${values.only}`);

  rmSync(SITE, { recursive: true, force: true });
  const cards: Card[] = [];
  for (const p of products) {
    const t0 = Date.now();
    const schema = await fetchSchema(p);
    const card = await reviewProduct(lib, p, schema, SITE);
    cards.push(card);
    const f = card.stats.findings;
    console.log(`${p.slug.padEnd(12)} ${String(card.stats.tables).padStart(5)} tables ${String(card.stats.foreign_keys).padStart(5)} fks `
      + `${String(card.stats.domains).padStart(3)} domains (${card.domainsHow})  findings ${f.error}/${f.warn}/${f.info}  ${Date.now() - t0} ms`);
  }
  writeSite(cards, {
    reviewerTag: manifest.reviewer.tag,
    built: today(),
    three: lib.bundleThree(lib.threeDir()),
    layoutJs: readFileSync(path.join(SKILL_DIR, 'scripts', 'schema-3d-layout.js'), 'utf8'),
    css: readFileSync('build/front.css', 'utf8'),
    app: readFileSync('build/front-app.js', 'utf8'),
  }, SITE);
  console.log(`site/index.html with ${cards.length} cards`);
  if (!values['no-banner'] && cards.some((c) => c.slug === manifest.banner)) {
    if (await recordBanner(SITE, manifest.banner)) console.log(`site/banner.gif${existsSync(path.join(SITE, 'banner.webp')) ? ' and site/banner.webp' : ''}`);
  }
  console.log(`cache in ${CACHE}/`);
}

main().catch((err: Error) => {
  console.error(`build failed: ${err.message}`);
  process.exitCode = 1;
});
