// narratives.ts — the narratives.json the reviewer is given: a curated file, or domains generated
// from table-name prefixes and labelled as such.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Product } from './manifest.ts';

export interface Narratives {
  database: { title: string; blurb: string };
  domains: { key: string; title: string; blurb: string; tenant_scoped: boolean; tables: string[] }[];
  conventions?: string[];
  assertions?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * The token before the first underscore (`ci_builds` → `ci`), or for CamelCase names as Prisma
 * writes them the leading capitalised word (`EventTypeCustomInput` → `EventType` is too fine, so
 * `Event`; `BookingReference` → `Booking`), or the whole name (`users`).
 */
export function prefixOf(table: string): string {
  const bare = table.replace(/^_+/, '');
  if (bare.includes('_')) return bare.split('_')[0];
  const camel = bare.match(/^[A-Z][a-z0-9]+(?=[A-Z])/);
  return camel ? camel[0] : bare;
}

/**
 * One domain per leading token that claims two or more tables, in first-seen order; every token
 * that claims a single table goes to `misc`. Every table is claimed, so the reviewer's
 * domain-coverage gate passes and the explorer gets real islands.
 */
export function prefixNarratives(p: Product, tables: string[]): Narratives {
  const groups = new Map<string, string[]>();
  for (const t of tables) {
    const k = prefixOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const domains: Narratives['domains'] = [];
  const misc: string[] = [];
  for (const [k, ts] of groups) {
    if (ts.length >= 2) domains.push({ key: k, title: k, blurb: `Tables whose names start with ${k}_.`, tenant_scoped: false, tables: ts });
    else misc.push(...ts);
  }
  if (misc.length) domains.push({ key: 'misc', title: 'misc', blurb: 'Tables whose name prefix is theirs alone.', tenant_scoped: false, tables: misc });
  return {
    database: { title: p.name, blurb: `${p.blurb} Domains here are by table-name prefix, not by judgment.` },
    domains,
    conventions: [],
    assertions: {},
  };
}

/** Curated narratives from products/<slug>/narratives.json, or a prefix-generated set. */
export function narrativesFor(p: Product, tables: string[]): { narratives: Narratives; how: 'curated' | 'prefix' } {
  const file = path.join('products', p.slug, 'narratives.json');
  if (p.domains === 'curated') {
    if (!existsSync(file)) throw new Error(`${p.slug} says domains are curated but ${file} does not exist`);
    return { narratives: JSON.parse(readFileSync(file, 'utf8')) as Narratives, how: 'curated' };
  }
  return { narratives: prefixNarratives(p, tables), how: 'prefix' };
}
