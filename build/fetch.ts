// fetch.ts — bring each product's schema to .cache/<slug>/schema.sql at its pinned commit.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Product } from './manifest.ts';

export const CACHE = '.cache';

const rawUrl = (p: Product, file: string): string => `https://raw.githubusercontent.com/${p.repo}/${p.commit}/${file}`;

async function download(url: string, to: string): Promise<void> {
  if (existsSync(to)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

/**
 * Go migrations keep their SQL in backtick strings beside plain Go strings (column names, regexes).
 * Keep every backtick string that starts with a SQL verb, end it with a semicolon, drop the rest.
 */
export function sqlFromGoRawStrings(go: string): string {
  const out: string[] = [];
  const parts = go.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    const s = parts[i].trim();
    if (/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|WITH)\b/i.test(s)) out.push(s.endsWith(';') ? s : `${s};`);
  }
  return `${out.join('\n\n')}\n`;
}

/** DDL from a Prisma schema, with no database: what `prisma migrate dev` would run first. */
function sqlFromPrisma(schemaPath: string, cwd: string): string {
  const run = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script'],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`prisma migrate diff failed for ${schemaPath}: ${run.stderr}`);
  return run.stdout;
}

/** The schema file for one product, fetched and derived; returns its path. Idempotent per commit. */
export async function fetchSchema(p: Product): Promise<string> {
  const dir = path.join(CACHE, p.slug);
  const stamp = path.join(dir, 'commit');
  const out = path.join(dir, 'schema.sql');
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === p.commit) return out;
  mkdirSync(dir, { recursive: true });
  let sql: string;
  if (p.source.kind === 'sql') {
    const pieces: string[] = [];
    for (const file of p.source.paths) {
      const local = path.join(dir, 'src', file);
      await download(rawUrl(p, file), local);
      pieces.push(`-- ${file}\n${readFileSync(local, 'utf8')}`);
    }
    sql = pieces.join('\n\n');
  } else if (p.source.kind === 'go-raw-strings') {
    const local = path.join(dir, 'src', p.source.path);
    await download(rawUrl(p, p.source.path), local);
    sql = sqlFromGoRawStrings(readFileSync(local, 'utf8'));
  } else {
    const local = path.join(dir, 'src', p.source.path);
    await download(rawUrl(p, p.source.path), local);
    sql = sqlFromPrisma(path.resolve(local), process.cwd());
  }
  writeFileSync(out, sql);
  writeFileSync(stamp, `${p.commit}\n`);
  return out;
}
