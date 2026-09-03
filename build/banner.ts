// banner.ts — a few seconds of one explorer turning, as banner.gif and banner.webp for READMEs.
// Needs Playwright's Chromium (software WebGL is fine) and ffmpeg; skipped with a message otherwise.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CACHE } from './fetch.ts';

const FRAMES = 48;
const WIDTH = 1200;
const HEIGHT = 500;

export async function recordBanner(siteDir: string, slug: string): Promise<boolean> {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('banner: ffmpeg not found, skipped'); return false; }
  let pw: typeof import('playwright');
  try { pw = await import('playwright'); } catch { console.log('banner: playwright not installed, skipped'); return false; }

  const frames = path.join(CACHE, 'banner-frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(siteDir, slug, 'schema-3d.html')).href);
    await page.waitForTimeout(3000);
    // Drag slowly across the scene: OrbitControls turns the schema, and every frame is one step.
    await page.mouse.move(WIDTH / 2 - 150, HEIGHT / 2);
    await page.mouse.down();
    for (let i = 0; i < FRAMES; i += 1) {
      await page.mouse.move(WIDTH / 2 - 150 + i * 6, HEIGHT / 2 + Math.sin(i / 8) * 3);
      await page.waitForTimeout(40);
      await page.screenshot({ path: path.join(frames, `f${String(i).padStart(3, '0')}.png`) });
    }
    await page.mouse.up();
  } finally {
    await browser.close();
  }
  const input = ['-y', '-framerate', '12', '-i', path.join(frames, 'f%03d.png')];
  const gif = spawnSync('ffmpeg', [...input, '-vf', 'split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop', '0', path.join(siteDir, 'banner.gif')], { encoding: 'utf8' });
  if (gif.status !== 0) throw new Error(`ffmpeg gif failed: ${gif.stderr.slice(-400)}`);
  // The GIF is what READMEs embed; the WebP is a smaller extra when this ffmpeg has libwebp.
  const webp = spawnSync('ffmpeg', [...input, '-c:v', 'libwebp', '-loop', '0', '-q:v', '75', path.join(siteDir, 'banner.webp')], { encoding: 'utf8' });
  if (webp.status !== 0) console.log('banner: this ffmpeg has no libwebp, banner.webp skipped');
  return true;
}
