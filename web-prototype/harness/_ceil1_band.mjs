#!/usr/bin/env node
/**
 * CEILING-1 — THE BAND METER.
 *
 * `critic-slice-1`'s finding is about ONE HORIZONTAL BAND of the frame, and a whole-frame
 * `grade.mjs` number cannot see it: the ceiling is ~20% of the pixels, so a band going from
 * pure black to a legible dark moves the whole-frame median by a couple of units and the band
 * itself by tens. So this reports both, with grade.mjs's OWN definitions so the numbers stay
 * comparable to every figure already on record:
 *
 *   luma       Rec.709 over sRGB BYTES (0.2126r + 0.7152g + 0.0722b)  — grade.mjs line 81
 *   median     the middle of the sorted population                    — grade.mjs line 130
 *   blackShare share of pixels at L <= 2.6                            — grade.mjs line 134
 *   topChroma  (r-b)/L of the TOP decile                              — grade.mjs's `chroma`
 *   step 2     sample every 2nd pixel in each axis                    — grade.mjs's STEP
 *
 *   node harness/_ceil1_band.mjs progress/light1-ceilA-*.png
 *   node harness/_ceil1_band.mjs --band 0.22 --json a.png b.png
 *
 * ⚠️ The band is the TOP `--band` fraction of the frame, not "wherever the ceiling is". A band
 * that chases the ceiling per station is a different measurement at every station and cannot be
 * differenced. Every capture here is 1920x1080 from the same five parked stations, so a fixed
 * fraction is the same architecture in the before and the after shot — which is the only
 * property the delta needs.
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BAND = +opt('band', 0.20);
const JSON_OUT = argv.includes('--json');
/**
 * 🆕 `--rect x0,y0,x1,y1` (FRACTIONS) replaces the top-band region, and `--under N` reports the
 * share of the region below luma N as well as the share at grade.mjs's black threshold.
 * `dig-side-1` states its finding as *"70% of the frame under luma 24"*, so that exact statistic
 * has to be reproducible here or the two rounds are measuring different things.
 */
const RECT = (opt('rect', '') || '').split(',').filter((s) => s !== '').map(Number);
const UNDER = +opt('under', 24);
const files = argv.filter((a) => !a.startsWith('--') && /\.png$/i.test(a));
if (!files.length) {
  console.error('usage: node harness/_ceil1_band.mjs [--band 0.20] [--json] <png...>');
  process.exit(2);
}

function stats(img, y0, y1, x0 = 0, x1 = img.width) {
  const { width: W, channels: ch, data } = img;
  const L = [], R = [], G = [], B = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      L.push(0.2126 * r + 0.7152 * g + 0.0722 * b); R.push(r); G.push(g); B.push(b);
    }
  }
  const n = L.length;
  const idx = L.map((v, i) => i).sort((a, b) => L[a] - L[b]);
  const median = L[idx[n >> 1]];
  const mean = L.reduce((a, b) => a + b, 0) / n;
  const blackShare = L.filter((v) => v <= 2.6).length / n;
  const underShare = L.filter((v) => v < UNDER).length / n;
  // top decile, grade.mjs's definition: the highest-luma tenth of the population
  const top = idx.slice(Math.floor(n * 0.9));
  let tl = 0, tr = 0, tb = 0;
  for (const i of top) { tl += L[i]; tr += R[i]; tb += B[i]; }
  const k = top.length;
  const topChroma = tl / k > 0 ? (tr / k - tb / k) / (tl / k) : 0;
  return { n, median, mean, blackShare, underShare, topChroma };
}

const rows = [];
for (const f of files) {
  const img = decodePng(readFileSync(f));
  const H = img.height, W = img.width;
  const band = RECT.length === 4
    ? stats(img, Math.round(H * RECT[1]), Math.round(H * RECT[3]),
      Math.round(W * RECT[0]), Math.round(W * RECT[2]))
    : stats(img, 0, Math.round(H * BAND));
  const full = stats(img, 0, H);
  rows.push({ file: f.replace(/\\/g, '/').split('/').pop(), band, full });
}

if (JSON_OUT) { console.log(JSON.stringify({ band: BAND, rows }, null, 2)); process.exit(0); }

const f1 = (v) => v.toFixed(1).padStart(6);
const p1 = (v) => (v * 100).toFixed(1).padStart(5) + '%';
const c3 = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
console.log(RECT.length === 4
  ? `region = x ${RECT[0]}..${RECT[2]}, y ${RECT[1]}..${RECT[3]} of frame   (under = L < ${UNDER})\n`
  : `band = top ${(BAND * 100).toFixed(0)}% of frame   (under = L < ${UNDER})\n`);
console.log('file'.padEnd(46) + '  regMed  regBlk regUndr regChr |  fullMed fullBlk fullChr');
for (const r of rows) {
  console.log(r.file.padEnd(46) + '  ' + f1(r.band.median) + ' ' + p1(r.band.blackShare)
    + '  ' + p1(r.band.underShare) + ' ' + c3(r.band.topChroma).padStart(7)
    + ' | ' + f1(r.full.median) + ' '
    + p1(r.full.blackShare) + ' ' + c3(r.full.topChroma).padStart(7));
}
