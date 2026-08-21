/**
 * estate-owner-12: sweep GRADE patches in one boot and report BOTH the gate numbers and the
 * macro-variation numbers side by side.
 *
 * They pull against each other and nothing existed that could see both at once. Round 12
 * rebalanced the ballroom's light — the shell down, the shaped daylight up — which moved macro
 * 32-px block variation the right way and moved the grade gate the WRONG way (top-decile chroma
 * 0.127 -> 0.149 WARN, darkest decile 4.3 -> 2.0). Fixing one blind costs the other. So this
 * prints, per grade variant:
 *
 *   top-decile (r-b)/L, median L, darkest-decile L      exactly as harness/grade.mjs computes
 *   macro on four fixed floor rects                     exactly as _tmp_eo11_tells.mjs computes
 *
 * ⚠ THE DECILES ARE OVER RAW PIXELS, NOT OVER grade.mjs's DISPLAY GRID. The first version of
 * this tool binned into 24 px cells first — cell means average a blown sun patch together with
 * the shade beside it — and reported top-decile chroma 0.165 where `grade.mjs --img` on the
 * SAME PNG read 0.149. grade.mjs's `cells`/`grid` exist only for the warmest/coolest printout;
 * its deciles come from `px`, a flat pixel list subsampled by `--step`. Matched here, and
 * cross-checked against `grade.mjs --img` on the same capture.
 *
 *   node harness/evidence/_eo12_gradesweep.mjs "base:{}" "hot:{\"exposure\":1.3}" ...
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const OUT = opt('dir', 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad');
const SHOTS = argv.includes('--shots');
const EXTRA = opt('extra', '');
const SPECS = argv.filter((a) => !a.startsWith('--') && a.includes(':'));

const RECTS = [
  ['floorA', 300, 760, 896, 300],
  ['floorB', 560, 740, 672, 320],
  ['floorWIDE', 150, 700, 1600, 380],
  ['floorRIGHT', 1250, 780, 600, 288],
  ['frame', 0, 0, 1920, 1080],
];

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const base = await page.evaluate(() => {
  const e = window.__rrr.engine, s = e.scene;
  const spots = [], points = [], dirs = [];
  s.traverse((o) => {
    if (o.isSpotLight) spots.push(o);
    else if (o.isPointLight) points.push(o);
    else if (o.isDirectionalLight) dirs.push(o);
  });
  e.__L = { spots, points, dirs };
  e.__S = { spotI: spots.map((l) => l.intensity), envI: s.environmentIntensity };
  return JSON.parse(JSON.stringify(e.pipeline.grade));
});

console.log('label        topChroma  medianL  toeL  black%  clip%   '
  + RECTS.map(([n]) => ('macro.' + n).padEnd(14)).join(''));

for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const patch = JSON.parse(spec.slice(i + 1));
  // `__sunx` / `__env` are LIGHT patches, not grade fields — the gate and the macro numbers are
  // pulled by both and a tool that could only turn one of them cannot find the balance point.
  await page.evaluate(({ b, p }) => {
    const e = window.__rrr.engine, s = e.scene, L = e.__L, S = e.__S;
    L.spots.forEach((l, k) => { l.intensity = S.spotI[k] * (p.__sunx ?? 1); });
    s.environmentIntensity = p.__env ?? S.envI;
    const g = { ...b, ...p };
    delete g.__sunx; delete g.__env;
    window.__rrr.setGrade(g);
  }, { b: base, p: patch });
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const buf = await page.screenshot();
  if (SHOTS) writeFileSync(`${OUT}/eo12-g-${label}.png`, buf);
  const url = `data:image/png;base64,${buf.toString('base64')}`;

  const r = await page.evaluate(async ({ url, rects }) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const W = cv.width, H = cv.height;
    const all = cx.getImageData(0, 0, W, H).data;

    // ---- gate, grade.mjs's own construction: deciles over PIXELS (step 2, as grade.mjs) ----
    const lum = new Float64Array(W * H);
    const px = [];
    let black = 0, clip = 0, n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i2 = (y * W + x) * 4;
        const L = 0.2126 * all[i2] + 0.7152 * all[i2 + 1] + 0.0722 * all[i2 + 2];
        lum[y * W + x] = L;
        if ((y & 1) === 0 && (x & 1) === 0) {
          px.push({ L, r: all[i2], b: all[i2 + 2] });
          if (L <= 2.6) black++;
          if (L >= 250) clip++;
          n++;
        }
      }
    }
    px.sort((a, b) => a.L - b.L);
    const dec = (k) => {
      const lo = Math.floor(px.length * k / 10), hi = Math.floor(px.length * (k + 1) / 10);
      let L = 0, r2 = 0, b2 = 0;
      for (let j = lo; j < hi; j++) { L += px[j].L; r2 += px[j].r; b2 += px[j].b; }
      const c = hi - lo;
      return { L: L / c, chroma: (r2 / c - b2 / c) / Math.max(0.5, L / c) };
    };

    const out = { top: dec(9).chroma, median: px[px.length >> 1].L, toe: dec(0).L,
      black: black / n * 100, clip: clip / n * 100, macro: {} };

    for (const [name, X, Y, Wd, Ht] of rects) {
      const blocks = [];
      for (let by = 0; by + 32 <= Ht; by += 32) {
        for (let bx = 0; bx + 32 <= Wd; bx += 32) {
          let s = 0;
          for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += lum[(Y + by + y) * W + X + bx + x];
          blocks.push(s / 1024);
        }
      }
      let m = 0; for (const v of blocks) m += v; m /= blocks.length;
      let v2 = 0; for (const v of blocks) v2 += (v - m) * (v - m);
      out.macro[name] = Math.sqrt(v2 / blocks.length) / Math.max(1, m);
    }
    return out;
  }, { url, rects: RECTS });

  console.log(label.padEnd(12)
    + r.top.toFixed(3).padStart(9)
    + r.median.toFixed(1).padStart(9)
    + r.toe.toFixed(1).padStart(6)
    + r.black.toFixed(1).padStart(7)
    + r.clip.toFixed(2).padStart(7) + '   '
    + RECTS.map(([n2]) => r.macro[n2].toFixed(4).padEnd(14)).join(''));
}
await browser.close();
