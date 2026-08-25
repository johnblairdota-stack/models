#!/usr/bin/env node
/**
 * CLIP — the fraction of the frame that has run out of headroom, per image.
 *
 * `critic-eye-sweep` (round 17) filed "every surface in direct sun clips to 255" as the
 * piece's top defect, and grade.mjs cannot see it: a decile ladder reports the TOP decile's
 * mean L, which is ~250 whether that decile is a rolled-off highlight or a solid white
 * plateau with no detail left in it. This counts the plateau directly.
 *
 *   node harness/_eye17_clip.mjs --img progress/shots/sweep/floor.png --img refs/bf1/bf1-ballroom-01.png
 *
 *   white%   pixels with min(r,g,b) >= 250 — no detail left in ANY channel
 *   clip%    pixels with max(r,g,b) >= 254 — at least one channel has run out
 *   L>240%   how much of the frame sits in the top sixteenth of the range
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgs = [];
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--img') imgs.push(process.argv[++i]);
if (!imgs.length) { console.error('need --img'); process.exit(2); }

const { page, browser } = await openCanvasPage();
for (const rel of imgs) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const url = await toDataURL(abs);
  const r = await page.evaluate(async (u) => {
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let white = 0, clip = 0, hi = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (Math.min(R, G, B) >= 250) white++;
      if (Math.max(R, G, B) >= 254) clip++;
      if (0.2126 * R + 0.7152 * G + 0.0722 * B > 240) hi++;
    }
    // ---- detail retention inside the bright half ----------------------------------------
    // The percentage above is not the complaint on its own: the BAR clips too (its windows
    // are blown, as a real photograph's would be). What separates the bar from this piece is
    // that the bar's sunlit FLOOR still has parquet grain inside the patch, and this piece's
    // is a flat plateau with only the pattern outline surviving. So measure the local contrast
    // of the bright pixels: mean |centre - 4-neighbour mean| over every pixel with L > 190,
    // which is high for a textured highlight and collapses toward zero for a solid one.
    let sum = 0, cnt = 0;
    const W = c.width, H = c.height;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    for (let y = 2; y < H - 2; y++) {
      for (let xx = 2; xx < W - 2; xx++) {
        const i = (y * W + xx) * 4;
        const Lc = lum(i);
        if (Lc <= 190) continue;
        const nb = (lum(i - 8) + lum(i + 8) + lum(i - W * 4 * 2) + lum(i + W * 4 * 2)) / 4;
        sum += Math.abs(Lc - nb); cnt++;
      }
    }
    return { w: im.width, h: im.height, white: white / n, clip: clip / n, hi: hi / n,
             detail: cnt ? sum / cnt : 0, brightFrac: cnt / n };
  }, url);
  console.log(`${path.basename(rel).padEnd(28)} ${r.w}x${r.h}  white ${(r.white * 100).toFixed(2)}%  clip ${(r.clip * 100).toFixed(2)}%  L>240 ${(r.hi * 100).toFixed(2)}%  bright ${(r.brightFrac * 100).toFixed(2)}%  detail ${r.detail.toFixed(2)}`);
}
await browser.close();
