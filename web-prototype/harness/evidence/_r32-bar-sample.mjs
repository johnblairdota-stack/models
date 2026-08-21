/**
 * Critic scratch r32 pass 2: 148s densest 80x80 vs r32 hole.
 * Overlay skipped — different cameras, different worlds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from '../pxdiff.mjs';
import zlib from 'node:zlib';
import path from 'node:path';

const DIR = 'harness/out/furn-smash-critic';
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => {
  const m = Math.max(...c) / 255, n = Math.min(...c) / 255;
  return m - n;
};

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

function nearestZoom(img, scale) {
  const { width: W, height: H, channels: CH, data: px } = img;
  const nw = W * scale, nh = H * scale;
  const out = Buffer.alloc(nw * nh * CH);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
      const si = (sy * W + sx) * CH;
      const di = (y * nw + x) * CH;
      px.copy(out, di, si, si + CH);
    }
  }
  return { w: nw, h: nh, ch: CH, data: out };
}

function sampleBuf(W, H, CH, px, skip = true) {
  const buckets = new Map();
  let nKeep = 0, nSkip = 0, nCream = 0, nDark = 0, nMid = 0, nLip = 0, nPunch = 0;
  for (let i = 0; i < W * H; i++) {
    const c = [px[i * CH], px[i * CH + 1], px[i * CH + 2]];
    const L = luma(c), C = chroma(c);
    const floorKhaki = L > 0.40 && C < 0.14;
    const robotWhite = L > 0.72;
    const cycGrey = C < 0.05 && L > 0.12 && L < 0.55;
    if (skip && (floorKhaki || robotWhite || cycGrey)) { nSkip++; continue; }
    nKeep++;
    if (L >= 0.35 && C < 0.22) nCream++;
    else if (L < 0.08) nPunch++;
    else if (L < 0.14) nDark++;
    else if (L < 0.28) nLip++;
    else nMid++;
    const q = c.map((v) => (v >> 3) << 3);
    const k = hex(q);
    const rec = buckets.get(k) || { n: 0, sum: [0, 0, 0], L: 0, C: 0 };
    rec.n++; rec.sum[0] += c[0]; rec.sum[1] += c[1]; rec.sum[2] += c[2]; rec.L += L; rec.C += C;
    buckets.set(k, rec);
  }
  const ranked = [...buckets.entries()]
    .map(([k, rec]) => {
      const mean = rec.sum.map((v) => Math.round(v / rec.n));
      return { q: k, n: rec.n, mean: hex(mean), L: rec.L / rec.n, C: rec.C / rec.n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  return { nKeep, nSkip, nCream, nDark, nMid, nLip, nPunch, ranked };
}

function logStats(tag, s) {
  const pct = (n) => (s.nKeep ? (100 * n / s.nKeep).toFixed(1) : 'na');
  console.log(`keep ${s.nKeep} skip ${s.nSkip}`);
  console.log(`  cream=${s.nCream} (${pct(s.nCream)}%) punch=${s.nPunch} (${pct(s.nPunch)}%) dark=${s.nDark} (${pct(s.nDark)}%) lip=${s.nLip} (${pct(s.nLip)}%) mid=${s.nMid} (${pct(s.nMid)}%)`);
  for (const r of s.ranked) {
    console.log(`  ${r.mean}  n=${String(r.n).padStart(5)}  luma=${r.L.toFixed(3)}  chroma=${r.C.toFixed(3)}`);
  }
}

function cropXY(src, x, y, w, h) {
  const { width: W, channels: CH, data: px } = src;
  const out = Buffer.alloc(w * h * CH);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const si = ((y + dy) * W + (x + dx)) * CH;
      px.copy(out, (dy * w + dx) * CH, si, si + CH);
    }
  }
  return { buf: out, ch: CH };
}

function densest(img, tag) {
  const { width: W, height: H, channels: CH, data: px } = img;
  const at = (xx, yy) => {
    const i = (yy * W + xx) * CH;
    return [px[i], px[i + 1], px[i + 2]];
  };
  let best = { n: 0, x: 0, y: 0, punch: 0 };
  for (let yy = 0; yy <= H - 80; yy++) {
    for (let xx = 0; xx <= W - 80; xx++) {
      let n = 0, punch = 0;
      for (let dy = 0; dy < 80; dy++) {
        for (let dx = 0; dx < 80; dx++) {
          const c = at(xx + dx, yy + dy);
          const L = luma(c), C = chroma(c);
          if (C >= 0.08 && L >= 0.14 && L < 0.28) n++;
          if (L < 0.08) punch++;
        }
      }
      if (n > best.n) best = { n, x: xx, y: yy, punch };
    }
  }
  console.log(`\ndensest 80x80 ${tag}: ${best.x},${best.y} lip=${best.n} punch=${best.punch}`);
  return best;
}

function hueSplit(tag, img) {
  const { width: W, height: H, channels: CH, data: px } = img;
  let nKeep = 0, terra = 0, umber = 0, dust = 0, espresso = 0;
  for (let i = 0; i < W * H; i++) {
    const c = [px[i * CH], px[i * CH + 1], px[i * CH + 2]];
    const L = luma(c), C = chroma(c);
    if (L > 0.40 && C < 0.14) continue;
    if (L > 0.72) continue;
    if (C < 0.05 && L > 0.12 && L < 0.55) continue;
    nKeep++;
    if (C >= 0.08 && L >= 0.08 && L < 0.14) espresso++;
    else if (C >= 0.08 && L >= 0.13 && L < 0.18) terra++;
    else if (C >= 0.08 && L >= 0.20 && L < 0.28) umber++;
    else if (C >= 0.08 && L >= 0.28 && L < 0.36) dust++;
  }
  const pct = (n) => (nKeep ? (100 * n / nKeep).toFixed(1) : 'na');
  console.log(`HUE-SPLIT ${tag} keep=${nKeep} espresso0.08-0.14=${pct(espresso)}% terra0.13-0.18=${pct(terra)}% umber0.20-0.28=${pct(umber)}% dust0.28-0.36=${pct(dust)}%`);
}

const bar = decodePng(readFileSync('refs/teardown/yt-house-148s-sledge-hole.png'));
console.log(`bar ${bar.width}x${bar.height}`);
const boxes = [
  { x: 640, y: 180, w: 280, h: 280, tag: '148s-right-hole' },
  { x: 700, y: 220, w: 180, h: 180, tag: '148s-hole-tight' },
];
for (const b of boxes) {
  const crop = cropXY(bar, b.x, b.y, b.w, b.h);
  writePng(path.join(DIR, `_r32-bar-${b.tag}.png`), b.w, b.h, crop.ch, crop.buf);
  console.log(`\n=== BAR ${b.tag} (no skip) ===`);
  logStats(b.tag, sampleBuf(b.w, b.h, crop.ch, crop.buf, false));
  console.log(`=== BAR ${b.tag} (skip khaki/white/cyc) ===`);
  logStats(b.tag + '-skip', sampleBuf(b.w, b.h, crop.ch, crop.buf, true));
}

{
  const tightBar = decodePng(readFileSync(path.join(DIR, '_r32-bar-148s-hole-tight.png')));
  const z = nearestZoom(tightBar, 4);
  writePng(path.join(DIR, '_r32-zoom-148s-hole-tight.png'), z.w, z.h, z.ch, z.data);
  const best = densest(tightBar, '148s-tight');
  const hole = cropXY(tightBar, best.x, best.y, 80, 80);
  writePng(path.join(DIR, '_r32-bar-148s-hole-only.png'), 80, 80, hole.ch, hole.buf);
  const hz = nearestZoom({ width: 80, height: 80, channels: hole.ch, data: hole.buf }, 4);
  writePng(path.join(DIR, '_r32-zoom-148s-hole-only.png'), hz.w, hz.h, hz.ch, hz.data);
  console.log('\n=== BAR 148s densest 80x80 (no skip) ===');
  logStats('148s-hole-only', sampleBuf(80, 80, hole.ch, hole.buf, false));
  hueSplit('148s-hole-only', { width: 80, height: 80, channels: hole.ch, data: hole.buf });
  hueSplit('148s-tight', tightBar);
}

{
  const r32h = decodePng(readFileSync(path.join(DIR, '_r32-wound-fireplace-hole-only.png')));
  console.log('\n=== r32 densest 80x80 re-sample ===');
  logStats('r32-hole', sampleBuf(r32h.width, r32h.height, r32h.channels, r32h.data));
  hueSplit('r32-hole-only', r32h);
}

{
  const r31h = decodePng(readFileSync(path.join(DIR, '_r31-wound-fireplace-hole-only.png')));
  console.log('\n=== archived r31 densest 80x80 ===');
  logStats('r31-hole', sampleBuf(r31h.width, r31h.height, r31h.channels, r31h.data));
  hueSplit('r31-hole-only', r31h);
}

{
  const r30h = decodePng(readFileSync(path.join(DIR, '_r30-wound-fireplace-hole-only.png')));
  console.log('\n=== archived r30 densest 80x80 ===');
  logStats('r30-hole', sampleBuf(r30h.width, r30h.height, r30h.channels, r30h.data));
  hueSplit('r30-hole-only', r30h);
}

{
  const r29h = decodePng(readFileSync(path.join(DIR, '_r29-wound-fireplace-hole-only.png')));
  console.log('\n=== archived r29 densest 80x80 ===');
  logStats('r29-hole', sampleBuf(r29h.width, r29h.height, r29h.channels, r29h.data));
  hueSplit('r29-hole-only', r29h);
}

{
  const r28h = decodePng(readFileSync(path.join(DIR, '_r28-wound-fireplace-hole-only.png')));
  console.log('\n=== archived r28 densest 80x80 ===');
  logStats('r28-hole', sampleBuf(r28h.width, r28h.height, r28h.channels, r28h.data));
  hueSplit('r28-hole-only', r28h);
}
