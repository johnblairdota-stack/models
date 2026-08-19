/**
 * Critic scratch: crop leave-shot wound zones and sample body vs plate hex.
 * Floor-grey / robot-white / bg-grey skipped. Leftover heaps left out of crop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';
import zlib from 'node:zlib';
import path from 'node:path';

const DIR = 'harness/out/furn-smash-critic';
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => {
  const m = Math.max(...c) / 255, n = Math.min(...c) / 255;
  return m - n;
};

const crops = {
  // 1280x720 leave frames. Crops hug THIS prop's wound, not leftover heaps.
  's-chaise-leave.png': { x: 380, y: 220, w: 520, h: 360 },
  's-settee-leave.png': { x: 420, y: 200, w: 480, h: 380 },
  's-fireplace-leave.png': { x: 430, y: 160, w: 500, h: 420 },
  's-desk-leave.png': { x: 400, y: 200, w: 520, h: 380 },
  's-table-round-leave.png': { x: 430, y: 180, w: 480, h: 400 },
  's-table-round-after.png': { x: 430, y: 200, w: 500, h: 400 },
  's-crate-leave.png': { x: 400, y: 200, w: 520, h: 380 },
};

const extras = [
  { file: 's-fireplace-leave.png', x: 820, y: 360, w: 360, h: 280, tag: 'fireplace-right' },
  { file: 's-fireplace-leave.png', x: 520, y: 220, w: 280, h: 280, tag: 'fireplace-cavity' },
  { file: 's-chaise-leave.png', x: 500, y: 280, w: 220, h: 180, tag: 'chaise-plates' },
  { file: 's-settee-leave.png', x: 540, y: 380, w: 220, h: 180, tag: 'settee-plates' },
  { file: 's-desk-leave.png', x: 560, y: 380, w: 240, h: 180, tag: 'desk-plates' },
  { file: 's-table-round-leave.png', x: 520, y: 340, w: 240, h: 200, tag: 'table-round-plates' },
  { file: 's-crate-leave.png', x: 620, y: 340, w: 280, h: 220, tag: 'crate-plates' },
  { file: 's-fireplace-leave.png', x: 560, y: 400, w: 280, h: 200, tag: 'fireplace-base' },
  { file: 's-chaise-leave.png', x: 80, y: 380, w: 280, h: 220, tag: 'chaise-leftover-left' },
  { file: 's-settee-leave.png', x: 980, y: 380, w: 280, h: 240, tag: 'settee-leftover-right' },
];

function writePng(outPath, w, h, ch, data) {
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    data.copy(raw, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch);
  }
  const crc32 = (buf) => zlib.crc32(buf);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(outPath, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

function sample(label, img, x, y, w, h) {
  const { width: W, height: H, channels: CH, data: px } = img;
  const at = (xx, yy) => {
    const i = (yy * W + xx) * CH;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const buckets = new Map();
  let nKeep = 0, nSkip = 0;
  const crop = Buffer.alloc(w * h * CH);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx, sy = y + yy;
      const i = (sy * W + sx) * CH;
      const o = (yy * w + xx) * CH;
      px.copy(crop, o, i, i + CH);
      const c = at(sx, sy);
      const L = luma(c), C = chroma(c);
      // Floor khaki is ~#8d8374 luma 0.52 chroma 0.10. Robot white is high luma.
      // Plates/body we care about sit darker and/or more chromatic than the cyc.
      const floorKhaki = L > 0.40 && C < 0.14;
      const robotWhite = L > 0.72;
      const cycGrey = C < 0.05 && L > 0.12 && L < 0.55;
      const blackBg = L < 0.05 && C < 0.03;
      if (floorKhaki || robotWhite || cycGrey || blackBg) { nSkip++; continue; }
      nKeep++;
      const q = c.map((v) => (v >> 3) << 3);
      const k = hex(q);
      const rec = buckets.get(k) || { n: 0, sum: [0, 0, 0], L: 0, C: 0 };
      rec.n++; rec.sum[0] += c[0]; rec.sum[1] += c[1]; rec.sum[2] += c[2]; rec.L += L; rec.C += C;
      buckets.set(k, rec);
    }
  }
  const ranked = [...buckets.entries()]
    .map(([k, rec]) => {
      const mean = rec.sum.map((v) => Math.round(v / rec.n));
      return { q: k, n: rec.n, mean: hex(mean), L: rec.L / rec.n, C: rec.C / rec.n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  return { nKeep, nSkip, ranked, crop, ch: CH };
}

function runOne(file, box, tag) {
  const src = path.join(DIR, file);
  const img = decodePng(readFileSync(src));
  console.log(`\n=== ${tag}  ${img.width}x${img.height}  crop ${box.x},${box.y} ${box.w}x${box.h} ===`);
  const s = sample(file, img, box.x, box.y, box.w, box.h);
  const out = path.join(DIR, `_r15-wound-${tag}.png`);
  writePng(out, box.w, box.h, s.ch, s.crop);
  console.log(`keep ${s.nKeep} skip ${s.nSkip}  wrote ${out}`);
  for (const r of s.ranked) {
    console.log(`  ${r.mean}  n=${String(r.n).padStart(5)}  luma=${r.L.toFixed(3)}  chroma=${r.C.toFixed(3)}`);
  }
}

for (const [file, box] of Object.entries(crops)) {
  runOne(file, box, file.replace('s-', '').replace('.png', ''));
}
for (const e of extras) {
  runOne(e.file, e, e.tag);
}
