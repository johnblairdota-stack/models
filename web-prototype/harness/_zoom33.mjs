/**
 * Round-33 scratch: crop + upscale one or more regions and tile them.
 *
 * Uses `imglib`'s data: URL loader rather than a `file://` <img>, because every render in
 * this project writes back to the same path and Chromium caches `file://` by URL — the
 * existing `_tmp_zoom_any.mjs` has that trap in it and returns the PREVIOUS capture.
 *
 *   node harness/_zoom33.mjs --out X.png --scale 4 \
 *     --src <path> --crop x,y,w,h [--crop ...] [--src <path2> --crop ...]
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const OUT = argv[argv.indexOf('--out') + 1];
const si = argv.indexOf('--scale');
const SCALE = si >= 0 ? +argv[si + 1] : 4;
const GAPI = argv.indexOf('--gap');
const GAP = GAPI >= 0 ? +argv[GAPI + 1] : 8;

const jobs = [];
let cur = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--src') cur = argv[++i];
  else if (argv[i] === '--crop') {
    const [x, y, w, h] = argv[++i].split(',').map(Number);
    jobs.push({ src: cur, x, y, w, h });
  }
}

const { page, browser } = await openCanvasPage();
const srcs = [...new Set(jobs.map((j) => j.src))];
const urls = {};
for (const s of srcs) urls[s] = await toDataURL(s);

const dataUrl = await page.evaluate(async ({ jobs, urls, SCALE, GAP }) => {
  const imgs = {};
  for (const [k, u] of Object.entries(urls)) {
    const im = new Image();
    im.src = u;
    await im.decode();
    imgs[k] = im;
  }
  const W = Math.max(...jobs.map((j) => j.w * SCALE));
  const H = jobs.reduce((a, j) => a + j.h * SCALE + GAP, 0) - GAP;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#202428'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  let y = 0;
  for (const j of jobs) {
    ctx.drawImage(imgs[j.src], j.x, j.y, j.w, j.h, 0, y, j.w * SCALE, j.h * SCALE);
    y += j.h * SCALE + GAP;
  }
  return cv.toDataURL('image/png');
}, { jobs, urls, SCALE, GAP });

writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`-> ${OUT}`);
await browser.close();
process.exit(0);
