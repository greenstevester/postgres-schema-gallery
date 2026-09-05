// banner.ts — recordings from the explorers: a short MP4 clip per product for cards in browsers
// without WebGL, and the wide animated banner for READMEs. Needs Playwright's Chromium (software
// WebGL is fine) and ffmpeg with libx264; skipped with a message when either is missing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CACHE } from './fetch.ts';

type Browser = Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>;

const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** The explorer's controls, panel and footer, hidden while a card clip records so only the schema shows. */
const HIDE_UI = '.ov, .panel, footer, #tip { display: none !important; }';

function ffmpeg(args: string[], what: string, optional = false): boolean {
  const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (run.status !== 0) {
    console.log(optional ? `banner: ${what} skipped (this ffmpeg cannot encode it)` : `banner: ffmpeg failed for ${what}: ${run.stderr.trim().slice(-300)}`);
    return false;
  }
  return true;
}

/** Opens one explorer, drags it slowly for `frames` frames, and screenshots each into `dir`. */
async function recordFrames(browser: Browser, explorer: string, dir: string, width: number, height: number, frames: number, hideUi: boolean): Promise<void> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(path.resolve(explorer)).href);
    if (hideUi) await page.addStyleTag({ content: HIDE_UI });
    await page.waitForTimeout(2500);
    const y = height / 2;
    await page.mouse.move(width / 2 - 150, y);
    await page.mouse.down();
    for (let i = 0; i < frames; i += 1) {
      await page.mouse.move(width / 2 - 150 + i * 6, y + Math.sin(i / 8) * 3);
      await page.waitForTimeout(40);
      await page.screenshot({ path: path.join(dir, `f${String(i).padStart(3, '0')}.png`) });
    }
    await page.mouse.up();
  } finally {
    await page.close();
  }
}

export interface Recordings { clips: Set<string>; banner: boolean }

/**
 * For every product, `site/<slug>/clip.mp4` (800×450, three seconds, looping in the card when the
 * browser has no WebGL); for the banner product, `site/banner.gif` and `banner.webp` at 1200×500
 * with the explorer's controls visible, as READMEs embed it.
 */
export async function recordAll(siteDir: string, slugs: string[], bannerSlug: string): Promise<Recordings> {
  const none: Recordings = { clips: new Set(), banner: false };
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('banner: ffmpeg not found, clips and banner skipped'); return none; }
  let pw: typeof import('playwright');
  try { pw = await import('playwright'); } catch { console.log('banner: playwright not installed, clips and banner skipped'); return none; }

  const out: Recordings = { clips: new Set(), banner: false };
  const browser = await pw.chromium.launch({ args: CHROMIUM_ARGS });
  try {
    for (const slug of slugs) {
      const explorer = path.join(siteDir, slug, 'schema-3d.html');
      if (!existsSync(explorer)) continue;
      const frames = path.join(CACHE, 'clips', slug);
      await recordFrames(browser, explorer, frames, 800, 450, 36, true);
      const ok = ffmpeg(['-framerate', '12', '-i', path.join(frames, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-crf', '28', '-movflags', '+faststart', path.join(siteDir, slug, 'clip.mp4')], `${slug} clip`);
      if (ok) out.clips.add(slug);
    }
    const explorer = path.join(siteDir, bannerSlug, 'schema-3d.html');
    if (existsSync(explorer)) {
      const frames = path.join(CACHE, 'banner-frames');
      await recordFrames(browser, explorer, frames, 1200, 500, 48, false);
      const input = ['-framerate', '12', '-i', path.join(frames, 'f%03d.png')];
      out.banner = ffmpeg([...input, '-vf', 'split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
        '-loop', '0', path.join(siteDir, 'banner.gif')], 'banner.gif');
      // The WebP is a smaller extra when this ffmpeg has libwebp; its absence is not a failure.
      ffmpeg([...input, '-c:v', 'libwebp', '-loop', '0', '-q:v', '75', path.join(siteDir, 'banner.webp')], 'banner.webp', true);
    }
  } finally {
    await browser.close();
  }
  return out;
}
