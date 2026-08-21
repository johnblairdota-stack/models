/**
 * v2: fixes v1's rubble-pile contamination. For each row, find the teal boundary (first teal
 * pixel scanning inward), then walk backward from THAT point only, collecting "cut" pixels
 * immediately adjacent to teal up to a capped width -- so a debris pile sitting on the floor
 * well away from the wall's own break, which v1's run-scan happily counted, cannot get in.
 *
 * Usage: node _critic6_secmeas2.mjs <src.png> <out_prefix> [maxRun=48]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [src, outPrefix, maxRunS] = process.argv.slice(2);
const maxRun = +(maxRunS ?? 48);
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const r = await pg.evaluate(async ([b64, MAXRUN]) => {
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

  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) {
    if (isTeal(at(x, y))) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (n < 40) return { n, teal: null };

  const H = y1 - y0;
  const soffitY1 = y0 + Math.round(H * 0.15);
  const sillY0 = y1 - Math.round(H * 0.15);

  const bandVals = { soffit: [], sill: [] };
  const bandOf = (y) => (y <= soffitY1 ? 'soffit' : (y >= sillY0 ? 'sill' : null));

  for (let y = y0; y <= y1; y++) {
    const band = bandOf(y);
    if (!band) continue;
    // find leftmost teal in this row (holes here have teal on the right of white)
    let tx = -1;
    for (let x = 1; x < bmp.width; x++) { if (isTeal(at(x, y))) { tx = x; break; } }
    if (tx < 2) continue;
    // walk backward from tx-1, collect until we hit shell or MAXRUN or teal again (disjoint gap)
    const vals = [];
    for (let k = 1; k <= MAXRUN; k++) {
      const x = tx - k;
      if (x < 0) break;
      const p = at(x, y);
      if (isShell(p)) break;
      if (isTeal(p)) break; // shouldn't happen given tx is leftmost, but guard
      vals.push(lum(p));
    }
    if (vals.length) bandVals[band].push(...vals);
  }

  const stat = (arr) => {
    if (!arr.length) return { count: 0, mean: null, median: null };
    const s = [...arr].sort((a, b2) => a - b2);
    return { count: arr.length, mean: +(arr.reduce((s2, v) => s2 + v, 0) / arr.length).toFixed(1), median: +s[s.length >> 1].toFixed(1) };
  };
  const soffit = stat(bandVals.soffit);
  const sill = stat(bandVals.sill);

  const cropStrip = (Y0, Y1) => {
    const pad = 4;
    const cy0 = Math.max(0, Y0 - pad), cy1 = Math.min(bmp.height, Y1 + pad);
    const cx0 = Math.max(0, x0 - MAXRUN - 15), cx1 = Math.min(bmp.width, x1 + 15);
    const w = cx1 - cx0, h = cy1 - cy0;
    const oc = new OffscreenCanvas(w, h);
    oc.getContext('2d').drawImage(bmp, cx0, cy0, w, h, 0, 0, w, h);
    return oc;
  };
  const strips = {};
  for (const [label, Y0, Y1] of [['soffit', y0, soffitY1], ['sill', sillY0, y1]]) {
    const oc = cropStrip(Y0, Y1);
    const blob = await oc.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const v of buf) s += String.fromCharCode(v);
    strips[label] = btoa(s);
  }

  return {
    n, teal: [x0, y0, x1, y1], H,
    soffit, sill,
    ratio: (soffit.mean && sill.mean) ? +(sill.mean / soffit.mean).toFixed(2) : null,
    strips,
  };
}, [b, maxRun]);

if (r.strips) {
  fs.writeFileSync(outPrefix + '.soffit.png', Buffer.from(r.strips.soffit, 'base64'));
  fs.writeFileSync(outPrefix + '.sill.png', Buffer.from(r.strips.sill, 'base64'));
}
await br.close();
console.log(JSON.stringify({ src, n: r.n, teal: r.teal, H: r.H, soffit: r.soffit, sill: r.sill, ratio: r.ratio }, null, 2));
