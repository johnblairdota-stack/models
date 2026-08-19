#!/usr/bin/env node
/**
 * COLOUR-FIDELITY PROBE FOR THE FLAT-ALBEDO PASS (`?unlit=1`, see `src/materials/unlit.js`).
 *
 * THE QUESTION IT EXISTS TO ANSWER. A render can look flat and not be flat. `post/shaders.js`
 * applies ACES unconditionally in every grade, then lift/gamma/gain, saturation, contrast, a
 * vignette and a dither, so anything written to `outgoingLight` arrives somewhere else. The
 * unlit pass claims to bypass all of that and deliver the AUTHORED sRGB colour exactly. That
 * claim is only worth anything if it is checked against a hex somebody actually typed into
 * `surfaces/robot.js` — for example C.chrome, which is #B9BEC2.
 *
 *   node harness/_unlit1-colour.mjs <img.png> "x,y,w,h,label[,expectedHex]" ...
 *
 * Reports the MODE and the MEDIAN of each patch. The mode is the number that matters: a chrome
 * region is crossed by panel grooves and by the brushed streak, both of which darken the albedo
 * on purpose, so the median is dragged down by design and only the mode reports the underlying
 * authored value. Both are printed so that disagreement between them is visible rather than
 * hidden — if the mode and the median coincide, the patch was uniform.
 *
 * ⚠️ A patch that lands on the background reports the background's colour and looks like a
 * perfectly good measurement. `--dump` writes the patch rectangles into a copy of the image so
 * the placement can be SEEN before any number from it is believed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { decodePng } from './pxdiff.mjs';

const args = process.argv.slice(2);
const dumpAt = args.indexOf('--dump');
let dumpPath = null;
if (dumpAt !== -1) { dumpPath = args[dumpAt + 1]; args.splice(dumpAt, 2); }

const [imgPath, ...specs] = args;
if (!imgPath || !specs.length) {
  console.error('usage: _unlit1-colour.mjs <img.png> "x,y,w,h,label[,#RRGGBB]" ... [--dump out.png]');
  process.exit(2);
}

const img = decodePng(readFileSync(imgPath));
const { width: W, height: H, channels: CH } = img;
const px = img.data;
const at = (x, y) => {
  const i = (y * W + x) * CH;
  return [px[i], px[i + 1], px[i + 2]];
};

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
const parseHex = (s) => {
  const h = s.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

console.log(`${imgPath}  ${W}x${H}`);
console.log('patch                     mode              median            n      vs authored');
console.log('-'.repeat(88));

const rects = [];
for (const spec of specs) {
  const parts = spec.split(',');
  const [x, y, w, h] = parts.slice(0, 4).map(Number);
  const label = parts[4] ?? '?';
  const want = parts[5] ? parseHex(parts[5]) : null;
  rects.push({ x, y, w, h, label });

  const counts = new Map();
  const chans = [[], [], []];
  let n = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const c = at(xx, yy);
      const k = (c[0] << 16) | (c[1] << 8) | c[2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
      for (let i = 0; i < 3; i++) chans[i].push(c[i]);
      n++;
    }
  }
  if (!n) { console.log(`${label.padEnd(24)}  EMPTY / OUT OF FRAME`); continue; }

  let bestK = 0, bestN = -1;
  for (const [k, v] of counts) if (v > bestN) { bestN = v; bestK = k; }
  const mode = [(bestK >> 16) & 255, (bestK >> 8) & 255, bestK & 255];
  const median = chans.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });

  let verdict = '';
  if (want) {
    const d = mode.map((v, i) => v - want[i]);
    const maxAbs = Math.max(...d.map(Math.abs));
    verdict = `${hex(want)}  delta ${d.map((v) => (v > 0 ? '+' : '') + v).join('/')}`
      + `  max|d| ${maxAbs}${maxAbs === 0 ? '  EXACT' : ''}`;
  }
  const modeShare = ((bestN / n) * 100).toFixed(1);
  console.log(`${label.padEnd(24)}  ${hex(mode)} ${String(modeShare).padStart(5)}%  `
    + `${hex(median)}          ${String(n).padStart(6)}  ${verdict}`);
}

if (dumpPath) {
  const out = Buffer.from(px);
  const mark = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * CH;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  };
  for (const r of rects) {
    for (let xx = r.x; xx < r.x + r.w; xx++) { mark(xx, r.y, [255, 0, 0]); mark(xx, r.y + r.h - 1, [255, 0, 0]); }
    for (let yy = r.y; yy < r.y + r.h; yy++) { mark(r.x, yy, [255, 0, 0]); mark(r.x + r.w - 1, yy, [255, 0, 0]); }
  }
  // minimal PNG writer: one IDAT, filter 0 on every scanline
  const raw = Buffer.alloc((W * CH + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * CH + 1)] = 0;
    out.copy(raw, y * (W * CH + 1) + 1, y * W * CH, (y + 1) * W * CH);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = CH === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(dumpPath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(`\npatch rectangles drawn into ${dumpPath}`);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return crc ^ 0xffffffff;
}
