// manifest.ts — products.json, read and checked. Everything else in the build takes a Manifest.
import { readFileSync } from 'node:fs';

export type SourceSpec =
  | { kind: 'sql'; paths: string[] }
  | { kind: 'go-raw-strings'; path: string }
  | { kind: 'prisma'; path: string };

export interface Product {
  slug: string;
  name: string;
  homepage: string;
  repo: string;          // GitHub owner/name
  commit: string;        // 40-character sha the files are fetched at
  ref: string;           // the human name of that commit: a tag, or a branch note
  license: string;
  blurb: string;
  source: SourceSpec;
  domains: 'curated' | 'prefix';
  stress?: boolean;
}

export interface Manifest {
  reviewer: { repo: string; tag: string };
  banner: string;        // slug of the product the README banner is recorded from
  products: Product[];
}

const KINDS = new Set(['sql', 'go-raw-strings', 'prisma']);

/** Reads and checks the manifest; a bad entry fails loudly with the slug named. */
export function loadManifest(file = 'products.json'): Manifest {
  return checkManifest(JSON.parse(readFileSync(file, 'utf8')));
}

export function checkManifest(m: Manifest): Manifest {
  const fail = (msg: string): never => { throw new Error(`products.json: ${msg}`); };
  if (!m.reviewer?.repo || !/^v\d+\.\d+\.\d+$/.test(m.reviewer?.tag ?? '')) fail('reviewer.repo and a reviewer.tag like v1.7.0 are required');
  if (!Array.isArray(m.products) || !m.products.length) fail('products must be a non-empty list');
  const slugs = new Set<string>();
  for (const p of m.products) {
    const where = `product ${p.slug ?? '(no slug)'}`;
    if (!/^[a-z0-9-]+$/.test(p.slug ?? '')) fail(`${where}: slug must be lowercase letters, digits and dashes`);
    if (slugs.has(p.slug)) fail(`${where}: duplicate slug`);
    slugs.add(p.slug);
    for (const k of ['name', 'homepage', 'repo', 'ref', 'license', 'blurb'] as const) {
      if (typeof p[k] !== 'string' || !p[k]) fail(`${where}: ${k} is required`);
    }
    if (!/^[0-9a-f]{40}$/.test(p.commit ?? '')) fail(`${where}: commit must be a 40-character sha`);
    if (!/^[\w.-]+\/[\w.-]+$/.test(p.repo)) fail(`${where}: repo must be owner/name`);
    if (!p.source || !KINDS.has(p.source.kind)) fail(`${where}: source.kind must be sql, go-raw-strings or prisma`);
    if (p.source.kind === 'sql' && !(Array.isArray(p.source.paths) && p.source.paths.length)) fail(`${where}: source.paths must list at least one file`);
    if (p.source.kind !== 'sql' && !p.source.path) fail(`${where}: source.path is required`);
    if (p.domains !== 'curated' && p.domains !== 'prefix') fail(`${where}: domains must be curated or prefix`);
  }
  if (!slugs.has(m.banner)) fail(`banner must name one of the products, not ${m.banner}`);
  return m;
}
