/**
 * Scratch (hunter-owner): navy-ink cluster finder + box RGB/luminance stats.
 *
 * Two questions this round needed and no existing tool answered together:
 *  1. "Does the 4Humanity wordmark reach the screen on this stage?" — the `keepSeparate`
 *     scaling bug is invisible by eye at figure distance, so it is settled by clustering
 *     every navy-ish pixel in the frame and seeing whether the hunter's chest owns one.
 *  2. "How dirty is this shell against the reference's own rows?" — a mean over a box.
 *
 *   node harness/_tmp_hunterpx.mjs <img> [x,y,w,h ...]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const [, , srcPath, ...boxes] = process.argv;
const b64 = readFileSync(path.resolve(srcPath)).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"></body>`);
await page.waitForFunction(() => {
  const im = document.getElementById('im');
  return im.complete && im.naturalWidth > 0;
});

const out = await page.evaluate((boxes) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height;
  const d = ctx.getImageData(0, 0, W, H).data;

  const cells = new Map();
  let navyPx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (b > r + 28 && b > g + 12 && b > 55 && b < 215 && r < 145) {
      navyPx++;
      const k = `${Math.floor(x / 40)},${Math.floor(y / 40)}`;
      cells.set(k, (cells.get(k) ?? 0) + 1);
    }
  }
  const top = [...cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, n]) => { const [cx, cy] = k.split(',').map(Number); return `${cx * 40},${cy * 40} n=${n}`; });

  /*
   * A box prefixed `fig:` measures only the FIGURE inside it: pixels that are neither the
   * near-white cyc nor one of the character's own signature colours. Sampling a fixed
   * rectangle instead was giving numbers that depended entirely on whether the rectangle
   * happened to land on a soot streak, a panel line or the wordmark — the three stages do not
   * share a camera distance (`fitCamera` refits per stage) so no fixed box is the same feature
   * on all three. Excluded: background (bright and neutral), the navy brand ink, the mint caps
   * and the red eyes. What is left is shell + chrome, which is what "grime" actually drives.
   */
  const stats = boxes.map((bs) => {
    const fig = bs.startsWith('fig:');
    const [x0, y0, w, h] = (fig ? bs.slice(4) : bs).split(',').map(Number);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4;
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (fig) {
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx > 205 && mx - mn < 14) continue;          // cyc
        if (B > R + 24 && B > G + 10) continue;          // navy wordmark / blue faceplate
        if (G > R + 12 && G > B + 4) continue;           // mint caps
        if (R > G + 30) continue;                        // red eyes
      }
      r += R; g += G; b += B; n++;
    }
    if (!n) return { box: bs, rgb: [0, 0, 0], lum: 0, px: 0 };
    const rgb = [r / n, g / n, b / n];
    return { box: bs, px: n, rgb: rgb.map((v) => +v.toFixed(1)),
      lum: +(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]).toFixed(1) };
  });
  return { size: [W, H], navyPx, top, stats };
}, boxes);

console.log(path.basename(srcPath), JSON.stringify(out));
await browser.close();
