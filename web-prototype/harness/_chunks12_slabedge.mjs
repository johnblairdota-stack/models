/**
 * 📐 **THE SLAB EDGE, WITH AND WITHOUT THE CORE COUNTED — because round 10 moved a share of it
 * from white to teal and `chunk-thick`'s own gate can only see the white share.**
 *
 * `chunk-thick.mjs` `sectionWidth()` walks a scanline and counts the neutral mid-value run
 * between the last WHITE SHELL pixel and the first TEAL pixel. `uCore` paints the back slice of
 * the innermost layer's section in the structure's own colour, so those pixels stop being
 * neutral and start being teal — the run the gate measures gets shorter by exactly the width of
 * the thing that was added. That is a real cost to state, but it is not the same as the section
 * collapsing, and the two have to be told apart.
 *
 * So this reports BOTH, on the same scanlines:
 *
 *   · `white`  the exact quantity the gate measures — shell -> first teal-family pixel
 *   · `slab`   shell -> the FILL, i.e. the first teal pixel that is more than `RIM` px from any
 *              non-teal one. That is the whole cut edge: white section plus core section.
 *
 * Usage: node harness/_chunks12_slabedge.mjs <png> [png...]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const srcs = process.argv.slice(2);
const br = await chromium.launch();
const pg = await br.newPage();
const rows = [];
for (const src of srcs) {
  const b = fs.readFileSync(src).toString('base64');
  const r = await pg.evaluate(async ([b64]) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const W = bmp.width, Hh = bmp.height;
    const c = new OffscreenCanvas(W, Hh);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, W, Hh).data;
    const at = (x, y) => { const o = (y * W + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    // ⚠️ the three predicates are chunk-thick's, to the character, so the numbers stay comparable
    const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;
    const isShell = (p) => p[0] > 118 && Math.abs(p[0] - p[1]) < 30 && Math.abs(p[1] - p[2]) < 38;
    const isCut = (p) => { const L = lum(p); return L > 18 && L < 116 && p[2] <= p[0] * 1.45; };
    const isFam = (p) => p[2] >= 40 && p[2] > p[0] * 1.30 && p[1] > p[0] * 1.05;

    const RIM = 7;
    const fam = new Uint8Array(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (isFam(at(x, y))) fam[y * W + x] = 1;
    const isFill = (x, y) => {
      if (!fam[y * W + x]) return false;
      for (let dy = -RIM; dy <= RIM; dy += 2) for (let dx = -RIM; dx <= RIM; dx += 2) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) return false;
        if (!fam[yy * W + xx]) return false;
      }
      return true;
    };

    const white = [], slab = [];
    for (let k = 1; k < 48; k++) {
      const y = ((Hh * 0.86) * k / 48) | 0;
      let run = 0, armed = false;
      for (let x = 1; x < W; x++) {
        const p = at(x, y);
        if (isShell(p)) { armed = true; run = 0; }
        else if (armed && isCut(p)) run++;
        else if (armed && isTeal(p)) { if (run > 0) white.push(run); armed = false; run = 0; }
        else { armed = false; run = 0; }
      }
      // the whole cut edge: last shell -> the fill
      let run2 = 0, armed2 = false;
      for (let x = 1; x < W; x++) {
        const p = at(x, y);
        if (isShell(p)) { armed2 = true; run2 = 0; }
        else if (armed2 && isFill(x, y)) { if (run2 > 0) slab.push(run2); armed2 = false; run2 = 0; }
        else if (armed2 && (isCut(p) || fam[y * W + x])) run2++;
        else { armed2 = false; run2 = 0; }
      }
    }
    const stat = (a) => {
      a.sort((p, q) => p - q);
      return { n: a.length, median: a.length ? a[a.length >> 1] : 0, p90: a.length ? a[(a.length * 0.9) | 0] : 0, max: a.length ? a[a.length - 1] : 0 };
    };
    return { white: stat(white), slab: stat(slab) };
  }, [b]);
  rows.push({ src: src.replace(/.*[\\/]/, ''), ...r });
}
await br.close();
console.log('frame                                        | white section (gate)      | whole slab edge');
for (const o of rows) {
  console.log(`${o.src.padEnd(44)} | n ${String(o.white.n).padStart(3)} med ${String(o.white.median).padStart(3)} p90 ${String(o.white.p90).padStart(3)} `
    + `| n ${String(o.slab.n).padStart(3)} med ${String(o.slab.median).padStart(3)} p90 ${String(o.slab.p90).padStart(3)} max ${o.slab.max}`);
}
