/**
 * 🔬 **ROUND 10: WHICH MEASUREMENT IS MEASURING WHAT.**
 *
 * Round 9 claimed a sill/soffit ratio of 1.95-2.09 on the cut face; `critic-dig-6` could not
 * reproduce it on round 9's own nominated frames and read 0.66 / 0.98 / 1.14. Both tools are
 * honest and they measure DIFFERENT QUANTITIES, which this file demonstrates by running BOTH on
 * the SAME png:
 *
 *   · `col` — round 9's axis (`_chunks11-secab.mjs` `edgeStats`). Per COLUMN: the 14 px
 *     immediately ABOVE the topmost teal is the SOFFIT, the 14 px immediately BELOW the
 *     bottom-most teal is the SILL. Those are the two HORIZONTAL cut faces of the hole.
 *   · `row` — critic-dig-6's axis (`_critic6_secmeas2.mjs`). Per ROW, in the top 15% and bottom
 *     15% of the teal bbox: walk LEFT from the leftmost teal pixel. That samples the LEFT JAMB
 *     twice, once near the hole's top corner and once near its bottom corner.
 *
 * A jamb's cut face is VERTICAL, so `uSecLift`'s `_secUp` term is ~0 on it by construction and
 * the two bands must read the same. `row` cannot see the effect `col` measures; that is a
 * property of the tools, not of the build.
 *
 * Usage: node harness/_chunks12_axes.mjs <png> [png...]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const srcs = process.argv.slice(2);
const br = await chromium.launch();
const pg = await br.newPage();
const out = [];
for (const src of srcs) {
  const b = fs.readFileSync(src).toString('base64');
  const r = await pg.evaluate(async ([b64]) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const at = (x, y) => { const o = (y * bmp.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
    const isShell = (p) => p[0] > 118 && Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 38;

    const W = bmp.width, H86 = (bmp.height * 0.86) | 0;
    // ---- teal mask over the same region round 9 used
    const teal = new Uint8Array(W * H86);
    let tn = 0, x0 = W, x1 = -1, y0 = H86, y1 = -1;
    for (let y = 0; y < H86; y++) for (let x = 0; x < W; x++) {
      if (isTeal(at(x, y))) { teal[y * W + x] = 1; tn++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (tn < 200) return { tn, col: null, row: null };

    // ---- AXIS A: round 9's columns (vertical: real soffit / real sill)
    let soffN = 0, soffL = 0, sillN = 0, sillL = 0, cols = 0;
    for (let x = 2; x < W - 2; x += 2) {
      let ty = -1, by = -1;
      for (let y = 2; y < H86 - 2; y++) if (teal[y * W + x]) { ty = y; break; }
      for (let y = H86 - 3; y > 2; y--) if (teal[y * W + x]) { by = y; break; }
      if (ty < 16 || by < 0 || by - ty < 40 || by > H86 - 18) continue;
      cols++;
      for (let k = 1; k <= 14; k++) {
        const pa = at(x, ty - k);
        if (!isTeal(pa) && lum(pa) > 6) { soffL += lum(pa); soffN++; }
        const pb = at(x, by + k);
        if (!isTeal(pb) && lum(pb) > 6) { sillL += lum(pb); sillN++; }
      }
    }
    const soffit = soffN ? +(soffL / soffN).toFixed(1) : -1;
    const sill = sillN ? +(sillL / sillN).toFixed(1) : -1;

    // ---- AXIS B: critic-dig-6's rows (horizontal: the LEFT JAMB, sampled high and low)
    const Hb = y1 - y0;
    const soffitY1 = y0 + Math.round(Hb * 0.15);
    const sillY0 = y1 - Math.round(Hb * 0.15);
    const rowVals = { hi: [], lo: [] };
    for (let y = y0; y <= y1; y++) {
      const band = y <= soffitY1 ? 'hi' : (y >= sillY0 ? 'lo' : null);
      if (!band) continue;
      let tx = -1;
      for (let x = 1; x < W; x++) { if (isTeal(at(x, y))) { tx = x; break; } }
      if (tx < 2) continue;
      for (let k = 1; k <= 48; k++) {
        const x = tx - k;
        if (x < 0) break;
        const p = at(x, y);
        if (isShell(p) || isTeal(p)) break;
        rowVals[band].push(lum(p));
      }
    }
    const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : -1);

    return {
      tn, bbox: [x0, y0, x1, y1], cols,
      col: { soffit, sill, ratio: (soffit > 1 && sill > 0) ? +(sill / soffit).toFixed(2) : -1, nS: soffN, nL: sillN },
      row: {
        hi: mean(rowVals.hi), lo: mean(rowVals.lo),
        ratio: (rowVals.hi.length && rowVals.lo.length && mean(rowVals.hi) > 1)
          ? +(mean(rowVals.lo) / mean(rowVals.hi)).toFixed(2) : -1,
        nHi: rowVals.hi.length, nLo: rowVals.lo.length,
      },
    };
  }, [b]);
  out.push({ src: src.replace(/.*[\\/]/, ''), ...r });
}
await br.close();
console.log('frame                                    teal  cols | COL soffit  sill  ratio | ROW hi    lo    ratio');
for (const o of out) {
  if (!o.col) { console.log(`${o.src.padEnd(40)} ${String(o.tn).padStart(6)}  (too little teal)`); continue; }
  console.log(`${o.src.padEnd(40)} ${String(o.tn).padStart(6)} ${String(o.cols).padStart(5)} |`
    + ` ${String(o.col.soffit).padStart(10)} ${String(o.col.sill).padStart(5)} ${String(o.col.ratio).padStart(6)} |`
    + ` ${String(o.row.hi).padStart(7)} ${String(o.row.lo).padStart(5)} ${String(o.row.ratio).padStart(6)}`);
}
