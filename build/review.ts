// review.ts — the reviewer used as a library: one product in, its docs written and a card out.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CACHE } from './fetch.ts';
import type { Product } from './manifest.ts';
import { narrativesFor } from './narratives.ts';

export const REVIEWER_DIR = path.join(CACHE, 'reviewer');
export const SKILL_DIR = path.join(REVIEWER_DIR, 'skills', 'db-architecture-review');

/** What schema3dModel() returns, as far as the gallery reads it. */
export interface Schema3dModel {
  title: string;
  domains: { key: string; title: string; color: string }[];
  tables: { name: string; domain: string }[];
  fks: { child: string; parent: string }[];
  hubs: string[];
}

/** The reviewer's exports the gallery calls, typed as loosely as they are used. */
export interface ReviewerLib {
  parseSchema(sql: string, source: string): Promise<{ tables: Map<string, unknown> }>;
  Reviewer: new (tables: Map<string, unknown>, narratives: unknown) => { run(): unknown[] };
  schema3dModel(tables: Map<string, unknown>, narratives: unknown, findings: unknown[], source: string): Schema3dModel;
  main(argv: string[]): Promise<number>;
  bundleThree(dir: string): string;
  threeDir(): string;
}

export async function loadReviewer(): Promise<ReviewerLib> {
  return import(pathToFileURL(path.resolve(SKILL_DIR, 'scripts', 'db-review.ts')).href) as Promise<ReviewerLib>;
}

/** The pruned model the front-page miniature draws: enough for layout() and colours, nothing else. */
export interface Mini {
  domains: { key: string; title: string; color: string }[];
  tables: { name: string; domain: string }[];
  fks: { child: string; parent: string }[];
  hubs: string[];
}

export interface Card {
  slug: string;
  name: string;
  homepage: string;
  repo: string;
  commit: string;
  ref: string;
  license: string;
  blurb: string;
  stress: boolean;
  domainsHow: 'curated' | 'prefix';
  stats: { tables: number; columns: number; foreign_keys: number; domains: number; findings: { error: number; warn: number; info: number } };
  mini: Mini;
}

/** Runs the reviewer on one product: writes site/<slug>/ and returns the card the front page needs. */
export async function reviewProduct(lib: ReviewerLib, p: Product, schemaPath: string, siteDir: string): Promise<Card> {
  const sql = readFileSync(schemaPath, 'utf8');
  const { tables } = await lib.parseSchema(sql, schemaPath);
  const { narratives, how } = narrativesFor(p, [...tables.keys()]);
  const narrPath = path.join(CACHE, p.slug, 'narratives.json');
  writeFileSync(narrPath, `${JSON.stringify(narratives, null, 2)}\n`);

  const outDir = path.resolve(siteDir, p.slug);
  mkdirSync(outDir, { recursive: true });
  // The reviewer prints the schema path it was given on every page ("Generated from ..."), so run
  // it from inside the product's cache folder with a name worth printing: `listmonk@v6.2.0.sql`.
  const label = `${p.repo.split('/')[1]}@${p.ref.split(' ')[0]}.sql`;
  const cacheDir = path.dirname(schemaPath);
  copyFileSync(schemaPath, path.join(cacheDir, label));
  const here = process.cwd();
  process.chdir(cacheDir);
  let code: number;
  try {
    code = await lib.main([label, '--narratives', path.basename(narrPath), '--out', outDir, '--fail-on', 'never', '--quiet']);
  } finally {
    process.chdir(here);
  }
  if (code !== 0) throw new Error(`reviewer exited ${code} on ${p.slug}`);

  const findings = new lib.Reviewer(tables, narratives).run();
  const model = lib.schema3dModel(tables, narratives, findings, label);
  const known = new Set(model.tables.map((t) => t.name));
  const stats = JSON.parse(readFileSync(path.join(outDir, 'schema.json'), 'utf8')).stats as Card['stats'];
  return {
    slug: p.slug, name: p.name, homepage: p.homepage, repo: p.repo, commit: p.commit, ref: p.ref, license: p.license,
    blurb: p.blurb, stress: Boolean(p.stress), domainsHow: how, stats,
    mini: {
      domains: model.domains.map((d) => ({ key: d.key, title: d.title, color: d.color })),
      tables: model.tables.map((t) => ({ name: t.name, domain: t.domain })),
      fks: model.fks.filter((fk) => known.has(fk.child) && known.has(fk.parent)).map((fk) => ({ child: fk.child, parent: fk.parent })),
      hubs: model.hubs,
    },
  };
}
