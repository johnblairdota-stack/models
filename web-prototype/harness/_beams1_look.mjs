#!/usr/bin/env node
/**
 * BEAMS-1 — LOOK AT THE PIXELS BEFORE BOOTING ANYTHING.
 *
 * `ceiling-1` reports the beams at "mean L 1". This asks the only question that separates the
 * two ways a region can be at L 1:
 *
 *   A) it is RENDERED at a very low value        -> the histogram is a smooth hump near 1-3
 *      and the region has spatial STRUCTURE (a beam edge, a shading gradient)
 *   B) it is CLAMPED TO EXACTLY ZERO and what remains is the grade's own grain + dither
 *      -> the histogram is a huge spike at 0 with a short uniform tail, and there is no
 *         structure at all: the "beams" and the gaps between them are the same population
 *
 * The grade adds `grain 0.024` (uniform +/- 0.012 = +/- 3.1 bytes, luminance-weighted) and a
 * +/- 0.5 byte ordered dither AFTER the toe crush and then clamps at 0. A region whose true
 * value is 0 therefore photographs with a POSITIVE mean of roughly +0.6..0.9 and a zero-spike
 * of roughly half its pixels. That is a signature, not a guess.
 *
 *   node harness/_beams1_look.mjs <png> --rect 0.30,0.02,0.70,0.20
 *   node harness/_beams1_look.mjs <png> --raster            # ASCII luma map of the top band
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const files = argv.filter((a) => !a.startsWith('--') && /\.png$/i.test(a));
const RECT = (opt('rect', '0,0,1,0.22') || '').split(',').map(Number);
const RASTER = argv.includes('--raster');
const COLS = +opt('cols', 96);
const ROWS = +opt('rows', 26);

const RAMP = ' .:-=+*#%@';

for (const f of files) {
  const img = decodePng(readFileSync(f));
  const { width: W, height: H, channels: ch, data } = img;
  const lum = (x, y) => {
    const i = (y * W + x) * ch;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  const x0 = Math.round(W * RECT[0]), y0 = Math.round(H * RECT[1]);
  const x1 = Math.round(W * RECT[2]), y1 = Math.round(H * RECT[3]);

  const L = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) L.push(lum(x, y));
  const n = L.length;
  const mean = L.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(L.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const hist = new Array(12).fill(0);
  for (const v of L) hist[Math.min(11, Math.round(v))]++;
  const zeroExact = L.filter((v) => v < 0.05).length / n;
  const sorted = [...L].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];

  console.log(`\n${f.replace(/\\/g, '/').split('/').pop()}  ${W}x${H}`);
  console.log(`  rect px x ${x0}..${x1}  y ${y0}..${y1}   n=${n}`);
  console.log(`  mean ${mean.toFixed(2)}  sd ${sd.toFixed(2)}  p05 ${q(0.05).toFixed(1)}` +
    `  med ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  max ${sorted[n - 1].toFixed(1)}`);
  console.log(`  share at EXACTLY 0 : ${(zeroExact * 100).toFixed(1)}%`);
  console.log('  L=  ' + hist.map((v, i) => `${i}:${(v / n * 100).toFixed(1)}%`).join('  '));

  if (RASTER) {
    // block-mean raster over the rect, so a beam (if it is drawing anything) shows as bands
    const bw = (x1 - x0) / COLS, bh = (y1 - y0) / ROWS;
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let s = '';
      const vals = [];
      for (let c = 0; c < COLS; c++) {
        let acc = 0, k = 0;
        for (let y = Math.round(y0 + r * bh); y < Math.round(y0 + (r + 1) * bh); y += 2)
          for (let x = Math.round(x0 + c * bw); x < Math.round(x0 + (c + 1) * bw); x += 2) { acc += lum(x, y); k++; }
        const v = acc / Math.max(1, k);
        vals.push(v);
        s += RAMP[Math.min(9, Math.floor(Math.sqrt(v / 64) * 9))];
      }
      rows.push({ s, mean: vals.reduce((a, b) => a + b, 0) / vals.length });
    }
    console.log('  raster (sqrt ramp, " "=0 .. "@"=64+):');
    for (const [i, r] of rows.entries())
      console.log(`   y${String(Math.round(y0 + (i + 0.5) * bh)).padStart(4)} |${r.s}| ${r.mean.toFixed(1)}`);
  }
}
