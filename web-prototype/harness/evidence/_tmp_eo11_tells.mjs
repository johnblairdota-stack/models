/**
 * estate-owner-11: the "does this read as a render" battery, as NUMBERS.
 *
 * Every critic for weeks has closed with "still identifiable as a render on close inspection"
 * and nobody has ever measured what that sentence points at. This measures five things over a
 * rectangle of any PNG, so a render region and a reference-art region can be compared directly:
 *
 *   grain      std of (pixel - 3x3 box mean), i.e. the sensor/film noise floor. A render with
 *              no grain reads as synthetic; this is the cheapest tell there is.
 *   band k=1..5  Laplacian-pyramid energy per octave: how much CONTRAST lives at 2, 4, 8, 16,
 *              32 px. A render is typically strong at 1-2 px (texture detail, aliasing) and
 *              weak at 16-32 px (the big soft blotches real surfaces have). The SHAPE of this
 *              profile is the closest thing to a fingerprint of "synthetic".
 *   acut       mean |Sobel| / mean luma — edge energy normalised for exposure.
 *   edge10-90  median 10-90% rise distance in px over the strongest 2% of edges: lens/sensor
 *              MTF. A pinhole render steps in 1 px; a photographed or lens-simulated frame
 *              takes 2-3.
 *   macro      std of 32x32 block means / mean — large-scale albedo/lighting variation.
 *   chroma     mean and std of (r-b)/max(L,1).
 *
 * Usage:
 *   node harness/evidence/_tmp_eo11_tells.mjs <img> "x,y,w,h,label" ["x,y,w,h,label" ...]
 */
import { toDataURL, openCanvasPage, resolveImg } from '../imglib.mjs';
import { statSync } from 'node:fs';

const [, , file, ...regions] = process.argv;
if (!file || !regions.length) {
  console.error('usage: node harness/evidence/_tmp_eo11_tells.mjs <img> "x,y,w,h,label" ...');
  process.exit(2);
}
const st = statSync(resolveImg(file));
const url = await toDataURL(file);
const { browser, page } = await openCanvasPage();
await page.setContent('<body style="margin:0"></body>');

const rows = await page.evaluate(async ({ url, regions }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height;
  const all = cx.getImageData(0, 0, W, H).data;
  const out = [];

  for (const spec of regions) {
    const [xs, ys, ws, hs, label] = spec.split(',');
    const X = +xs, Y = +ys, Wd = +ws, Ht = +hs;
    const L = new Float64Array(Wd * Ht);
    const CH = new Float64Array(Wd * Ht);
    for (let dy = 0; dy < Ht; dy++) {
      for (let dx = 0; dx < Wd; dx++) {
        const i = ((Y + dy) * W + (X + dx)) * 4;
        const r = all[i], g = all[i + 1], b = all[i + 2];
        L[dy * Wd + dx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        CH[dy * Wd + dx] = (r - b) / Math.max(1, 0.2126 * r + 0.7152 * g + 0.0722 * b);
      }
    }
    const at = (a, x, y, w, h) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
    const std = (a) => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };

    // ---- grain: residual after a 3x3 box ----------------------------------
    const res = [];
    for (let y = 1; y < Ht - 1; y++) {
      for (let x = 1; x < Wd - 1; x++) {
        let s = 0;
        for (let j = -1; j <= 1; j++) for (let i2 = -1; i2 <= 1; i2++) s += L[(y + j) * Wd + (x + i2)];
        res.push(L[y * Wd + x] - s / 9);
      }
    }
    const grain = std(res);

    // ---- Laplacian pyramid energy per octave -------------------------------
    // Successive 2x box-downsamples; the band energy is the std of (level - upsampled next).
    let cur = L, cw = Wd, ch = Ht;
    const bands = [];
    for (let k = 0; k < 5 && cw > 8 && ch > 8; k++) {
      const nw = cw >> 1, nh = ch >> 1;
      const next = new Float64Array(nw * nh);
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          next[y * nw + x] = 0.25 * (cur[(2 * y) * cw + 2 * x] + cur[(2 * y) * cw + 2 * x + 1]
            + cur[(2 * y + 1) * cw + 2 * x] + cur[(2 * y + 1) * cw + 2 * x + 1]);
        }
      }
      const det = [];
      for (let y = 0; y < nh * 2; y++) {
        for (let x = 0; x < nw * 2; x++) {
          det.push(cur[y * cw + x] - next[Math.min(nh - 1, y >> 1) * nw + Math.min(nw - 1, x >> 1)]);
        }
      }
      bands.push(+std(det).toFixed(2));
      cur = next; cw = nw; ch = nh;
    }

    // ---- Sobel acutance + edge rise ---------------------------------------
    const gm = new Float64Array(Wd * Ht);
    for (let y = 1; y < Ht - 1; y++) {
      for (let x = 1; x < Wd - 1; x++) {
        const gx = -at(L, x - 1, y - 1, Wd, Ht) - 2 * at(L, x - 1, y, Wd, Ht) - at(L, x - 1, y + 1, Wd, Ht)
          + at(L, x + 1, y - 1, Wd, Ht) + 2 * at(L, x + 1, y, Wd, Ht) + at(L, x + 1, y + 1, Wd, Ht);
        const gy = -at(L, x - 1, y - 1, Wd, Ht) - 2 * at(L, x, y - 1, Wd, Ht) - at(L, x + 1, y - 1, Wd, Ht)
          + at(L, x - 1, y + 1, Wd, Ht) + 2 * at(L, x, y + 1, Wd, Ht) + at(L, x + 1, y + 1, Wd, Ht);
        gm[y * Wd + x] = Math.hypot(gx, gy) / 8;
      }
    }
    const meanL = mean(L);
    const acut = mean(gm) / Math.max(1, meanL);

    // 10-90 rise: walk horizontally across the strongest gradient pixels
    const sorted = Array.from(gm).sort((a, b) => b - a);
    const thr = sorted[Math.floor(sorted.length * 0.02)] || 1e9;
    const rises = [];
    for (let y = 4; y < Ht - 4; y++) {
      for (let x = 4; x < Wd - 4; x++) {
        if (gm[y * Wd + x] < thr) continue;
        // local min/max over +-4 px horizontally
        let lo = 1e9, hi = -1e9;
        for (let d = -4; d <= 4; d++) { const v = L[y * Wd + x + d]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (hi - lo < 12) continue;
        const t10 = lo + 0.1 * (hi - lo), t90 = lo + 0.9 * (hi - lo);
        let a = null, b = null;
        for (let d = -4; d <= 4; d++) {
          const v = L[y * Wd + x + d];
          if (a === null && (v >= t10 && v <= t90)) a = d;
          if (v >= t10 && v <= t90) b = d;
        }
        if (a !== null && b !== null) rises.push(b - a + 1);
      }
    }
    rises.sort((a, b) => a - b);
    const edge = rises.length ? rises[rises.length >> 1] : null;

    // ---- macro variation: 32x32 block means -------------------------------
    const blocks = [];
    for (let by = 0; by + 32 <= Ht; by += 32) {
      for (let bx = 0; bx + 32 <= Wd; bx += 32) {
        let s = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += L[(by + y) * Wd + bx + x];
        blocks.push(s / 1024);
      }
    }
    const macro = blocks.length > 1 ? std(blocks) / Math.max(1, mean(blocks)) : null;

    const ls = Array.from(L).sort((a, b) => a - b);
    out.push({
      label, rect: [X, Y, Wd, Ht],
      meanL: +meanL.toFixed(2),
      p5: +ls[Math.floor(ls.length * 0.05)].toFixed(1),
      p50: +ls[Math.floor(ls.length * 0.5)].toFixed(1),
      p95: +ls[Math.floor(ls.length * 0.95)].toFixed(1),
      stdL: +std(L).toFixed(2),
      grain: +grain.toFixed(3),
      bands,
      acut: +acut.toFixed(4),
      edge1090: edge,
      edgeN: rises.length,
      macro: macro === null ? null : +macro.toFixed(4),
      chroma: +mean(CH).toFixed(4),
      chromaStd: +std(CH).toFixed(4),
    });
  }
  return out;
}, { url, regions });

console.log(`# ${file}  (${(st.size / 1024).toFixed(0)} KB, ${st.mtime.toISOString()})`);
console.log('label            meanL   p5/p50/p95    stdL  grain  bands(2,4,8,16,32px)        acut   edge  macro  chroma+-sd');
for (const r of rows) {
  console.log(
    `${r.label.padEnd(16)} ${String(r.meanL).padStart(6)} `
    + `${String(r.p5).padStart(5)}/${String(r.p50).padStart(5)}/${String(r.p95).padStart(5)} `
    + `${String(r.stdL).padStart(6)} ${String(r.grain).padStart(6)} `
    + `[${r.bands.join(', ').padEnd(26)}] ${String(r.acut).padStart(6)} `
    + `${String(r.edge1090).padStart(4)} ${String(r.macro).padStart(6)} `
    + `${String(r.chroma).padStart(7)}+-${r.chromaStd}`);
}
await browser.close();
