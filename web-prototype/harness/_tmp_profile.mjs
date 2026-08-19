/**
 * 🔬 **A SCANLINE, IN PIXELS, OFF A DELIVERED FRAME.**
 *
 *   node harness/_tmp_profile.mjs <png> <y-fraction> [x0] [x1]
 *
 * Round 7 needs to know how many PIXELS wide the "white rim fades into the brown" transition
 * actually is before it can claim to have hardened it. `chunk-thick.mjs`'s `scanline` prints 17
 * samples across the whole frame, which cannot resolve a 40 px shoulder. This prints every
 * pixel's luma and rgb across a requested span, plus the classified band it falls in, so the
 * boiserie -> pale -> white -> section -> cyan sequence is a table rather than an impression.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [src, yf = '0.35', x0s, x1s] = process.argv.slice(2);
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const out = await pg.evaluate(async ([b64, YF, X0, X1]) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const y = (bmp.height * YF) | 0;
  const d = g.getImageData(0, y, bmp.width, 1).data;
  const x0 = X0 === null ? 0 : X0, x1 = X1 === null ? bmp.width : X1;
  const rows = [];
  const cls = (r, gg, bb) => {
    if (bb >= 34 && bb > r * 1.55 && gg > r * 1.20) return 'CYAN';
    if (r > 150 && Math.abs(r - gg) < 30 && Math.abs(gg - bb) < 40) return 'white';
    if (r > 90 && r > bb * 1.25) return 'warm';
    const L = 0.299 * r + 0.587 * gg + 0.114 * bb;
    return L < 40 ? 'dark' : 'mid';
  };
  for (let x = x0; x < x1; x++) {
    const o = x * 4;
    rows.push([x, d[o], d[o + 1], d[o + 2], cls(d[o], d[o + 1], d[o + 2])]);
  }
  // run-length the classification so the table is readable
  const runs = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (last && last.k === r[4]) { last.n++; last.end = r[0]; last.last = [r[1], r[2], r[3]]; }
    else runs.push({ k: r[4], n: 1, start: r[0], end: r[0], first: [r[1], r[2], r[3]], last: [r[1], r[2], r[3]] });
  }
  return { w: bmp.width, h: bmp.height, y, runs, rows: rows.filter((_, i) => i % 4 === 0) };
}, [b, +yf, x0s === undefined ? null : +x0s, x1s === undefined ? null : +x1s]);
await br.close();
console.log(`${src}  ${out.w}x${out.h}  row y=${out.y}`);
for (const r of out.runs) {
  if (r.n < 3) continue;
  console.log(`  ${String(r.k).padEnd(6)} x ${String(r.start).padStart(4)}..${String(r.end).padStart(4)}`
    + ` (${String(r.n).padStart(4)} px)  ${r.first.join(',')} -> ${r.last.join(',')}`);
}
