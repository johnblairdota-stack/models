import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';
import zlib from 'node:zlib';
import path from 'node:path';

const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => Math.max(...c) / 255 - Math.min(...c) / 255;
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

function writePng(outPath, w, h, ch, data) {
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    data.copy(raw, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(outPath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function stats(label, img, x, y, w, h, skip = true) {
  const { width: W, channels: CH, data: px } = img;
  const buckets = new Map();
  let n = 0, nCream = 0, nPunch = 0, nDark = 0, nLip = 0, nMid = 0;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const i = ((y + yy) * W + (x + xx)) * CH;
      const c = [px[i], px[i + 1], px[i + 2]];
      const L = luma(c), C = chroma(c);
      if (skip) {
        if (L > 0.72) continue;
        if (L > 0.40 && C < 0.14) continue;
        if (C < 0.05 && L > 0.12 && L < 0.55) continue;
      }
      n++;
      if (L >= 0.35 && C < 0.22) nCream++;
      else if (L < 0.08) nPunch++;
      else if (L < 0.14) nDark++;
      else if (L < 0.28) nLip++;
      else nMid++;
      const k = hex(c.map((v) => (v >> 3) << 3));
      const rec = buckets.get(k) || { n: 0, sum: [0, 0, 0], L: 0 };
      rec.n++; rec.sum[0] += c[0]; rec.sum[1] += c[1]; rec.sum[2] += c[2]; rec.L += L;
      buckets.set(k, rec);
    }
  }
  const ranked = [...buckets.entries()]
    .map(([, rec]) => ({ mean: hex(rec.sum.map((v) => Math.round(v / rec.n))), n: rec.n, L: rec.L / rec.n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const pct = (x) => (n ? (100 * x / n).toFixed(1) : 'na');
  console.log(`\n=== ${label} keep=${n} cream=${pct(nCream)} punch=${pct(nPunch)} dark=${pct(nDark)} lip=${pct(nLip)} mid=${pct(nMid)}`);
  for (const r of ranked) console.log(`  ${r.mean} n=${String(r.n).padStart(5)} L=${r.L.toFixed(3)}`);
}

const r16f = decodePng(readFileSync('harness/out/furn-smash-critic/_r16-wound-fireplace-cavity-tight.png'));
const r17f = decodePng(readFileSync('harness/out/furn-smash-critic/_r17-wound-fireplace-cavity-tight.png'));
stats('r16 fireplace tight', r16f, 0, 0, r16f.width, r16f.height);
stats('r17 fireplace tight', r17f, 0, 0, r17f.width, r17f.height);

const r16d = decodePng(readFileSync('harness/out/furn-smash-critic/_r16-wound-desk-cavity-tight.png'));
const r17d = decodePng(readFileSync('harness/out/furn-smash-critic/_r17-wound-desk-cavity-tight.png'));
stats('r16 desk tight', r16d, 0, 0, r16d.width, r16d.height);
stats('r17 desk tight', r17d, 0, 0, r17d.width, r17d.height);

const bar = decodePng(readFileSync('refs/teardown/yt-house-148s-sledge-hole.png'));
console.log(`\nbar ${bar.width}x${bar.height}`);
// hole is right of hammer; typical 1280 youtube frame. Probe a few boxes.
const boxes = [
  { x: 640, y: 180, w: 280, h: 280, tag: '148s-right-hole' },
  { x: 700, y: 220, w: 180, h: 180, tag: '148s-hole-tight' },
  { x: 520, y: 200, w: 240, h: 240, tag: '148s-mid' },
];
for (const b of boxes) {
  if (b.x + b.w > bar.width || b.y + b.h > bar.height) {
    console.log(`skip ${b.tag} out of range`);
    continue;
  }
  stats(b.tag, bar, b.x, b.y, b.w, b.h, false);
  const crop = Buffer.alloc(b.w * b.h * bar.channels);
  for (let yy = 0; yy < b.h; yy++) {
    for (let xx = 0; xx < b.w; xx++) {
      const i = ((b.y + yy) * bar.width + (b.x + xx)) * bar.channels;
      crop.set(bar.data.subarray(i, i + bar.channels), (yy * b.w + xx) * bar.channels);
    }
  }
  writePng(`harness/out/furn-smash-critic/_r17-bar-${b.tag}.png`, b.w, b.h, bar.channels, crop);
}

// hole-only fireplace: search lip-band bbox in r17 tight
{
  const { width: W, height: H, channels: CH, data: px } = r17f;
  let minX = W, minY = H, maxX = 0, maxY = 0, nLip = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * CH;
      const c = [px[i], px[i + 1], px[i + 2]];
      const L = luma(c), C = chroma(c);
      if (L >= 0.14 && L < 0.28 && C > 0.08) {
        nLip++;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  console.log(`\nlip-band chroma>0.08 bbox ${minX},${minY} ${maxX - minX + 1}x${maxY - minY + 1} n=${nLip}`);
}
