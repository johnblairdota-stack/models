/**
 * Critic scratch r22: crop leave wounds, sample cavity meat hex, count chip grain.
 * Claim: fireplace bite densest meat is one crumbled umber island through the volume (same hue, lip-band faces), not a terracotta/dust split.
 * Floor-khaki / robot-white / cyc-grey skipped. Near-black KEPT.
 * Leftover heaps left out of crop. Same boxes as r17–r20 for delta.
 * Do NOT sample 148s in this pass — look at our wounds first.
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

const extras = [
  { file: 's-fireplace-leave.png', x: 520, y: 220, w: 280, h: 280, tag: 'fireplace-cavity' },
  { file: 's-fireplace-leave.png', x: 560, y: 250, w: 180, h: 180, tag: 'fireplace-cavity-tight' },
  { file: 's-desk-leave.png', x: 500, y: 240, w: 280, h: 220, tag: 'desk-cavity' },
  { file: 's-desk-leave.png', x: 540, y: 270, w: 180, h: 140, tag: 'desk-cavity-tight' },
  { file: 's-chaise-leave.png', x: 500, y: 250, w: 240, h: 200, tag: 'chaise-cavity' },
  { file: 's-settee-leave.png', x: 520, y: 220, w: 240, h: 200, tag: 'settee-cavity' },
  { file: 's-table-round-leave.png', x: 520, y: 300, w: 240, h: 220, tag: 'table-round-wound' },
  { file: 's-crate-leave.png', x: 500, y: 240, w: 260, h: 220, tag: 'crate-cavity' },
  { file: 's-fireplace-leave.png', x: 430, y: 160, w: 500, h: 420, tag: 'fireplace-leave' },
  { file: 's-desk-leave.png', x: 400, y: 200, w: 520, h: 380, tag: 'desk-leave' },
  { file: 's-fireplace-leave.png', x: 640, y: 340, w: 80, h: 80, tag: 'fireplace-meat-window' },
  { file: 's-chaise-leave.png', x: 540, y: 280, w: 160, h: 140, tag: 'chaise-seat' },
  { file: 's-settee-leave.png', x: 560, y: 250, w: 160, h: 140, tag: 'settee-hole' },
  { file: 's-crate-leave.png', x: 560, y: 270, w: 160, h: 140, tag: 'crate-hole' },
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

function sampleBuf(W, H, CH, px) {
  const at = (xx, yy) => {
    const i = (yy * W + xx) * CH;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const buckets = new Map();
  let nKeep = 0, nSkip = 0, nCream = 0, nDark = 0, nMid = 0, nLip = 0, nPunch = 0;
  const hot = Buffer.alloc(W * H * 3);
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const c = at(xx, yy);
      const L = luma(c), C = chroma(c);
      const floorKhaki = L > 0.40 && C < 0.14;
      const robotWhite = L > 0.72;
      const cycGrey = C < 0.05 && L > 0.12 && L < 0.55;
      const ho = (yy * W + xx) * 3;
      if (floorKhaki || robotWhite || cycGrey) {
        nSkip++;
        continue;
      }
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
      if (L >= 0.35 && C < 0.22) { hot[ho] = 255; hot[ho + 1] = 0; hot[ho + 2] = 255; }
      else if (L >= 0.14 && L < 0.28) { hot[ho] = 0; hot[ho + 1] = 220; hot[ho + 2] = 220; }
      else if (L < 0.08) { hot[ho] = 80; hot[ho + 1] = 0; hot[ho + 2] = 0; }
      else { hot[ho] = 60; hot[ho + 1] = 60; hot[ho + 2] = 60; }
    }
  }
  const ranked = [...buckets.entries()]
    .map(([k, rec]) => {
      const mean = rec.sum.map((v) => Math.round(v / rec.n));
      return { q: k, n: rec.n, mean: hex(mean), L: rec.L / rec.n, C: rec.C / rec.n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  return { nKeep, nSkip, nCream, nDark, nMid, nLip, nPunch, ranked, hot };
}

function sample(img, x, y, w, h) {
  const { width: W, channels: CH, data: px } = img;
  const crop = Buffer.alloc(w * h * CH);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const i = ((y + yy) * W + (x + xx)) * CH;
      px.copy(crop, (yy * w + xx) * CH, i, i + CH);
    }
  }
  const s = sampleBuf(w, h, CH, crop);
  return { ...s, crop, ch: CH };
}

function logStats(tag, s) {
  const pct = (n) => (s.nKeep ? (100 * n / s.nKeep).toFixed(1) : 'na');
  console.log(`keep ${s.nKeep} skip ${s.nSkip}`);
  console.log(`  cream(L>=0.35,C<0.22)=${s.nCream} (${pct(s.nCream)}%)`);
  console.log(`  punch(L<0.08)=${s.nPunch} (${pct(s.nPunch)}%)`);
  console.log(`  dark(0.08-0.14)=${s.nDark} (${pct(s.nDark)}%)`);
  console.log(`  lip(0.14-0.28)=${s.nLip} (${pct(s.nLip)}%)`);
  console.log(`  mid=${s.nMid} (${pct(s.nMid)}%)`);
  for (const r of s.ranked) {
    console.log(`  ${r.mean}  n=${String(r.n).padStart(5)}  luma=${r.L.toFixed(3)}  chroma=${r.C.toFixed(3)}`);
  }
}

function meatAt(W, H, CH, px, xx, yy) {
  const i = (yy * W + xx) * CH;
  const c = [px[i], px[i + 1], px[i + 2]];
  const l = luma(c), chm = chroma(c);
  if (l > 0.40 && chm < 0.14) return false;
  if (l > 0.72) return false;
  return chm >= 0.08 && l >= 0.10 && l < 0.45;
}

function countGrain(W, H, CH, px, tag) {
  const L = (xx, yy) => {
    const i = (yy * W + xx) * CH;
    return luma([px[i], px[i + 1], px[i + 2]]);
  };
  const seen = new Uint8Array(W * H);
  const blobs = [];
  const qL = (xx, yy) => Math.floor(L(xx, yy) * 12);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (seen[i] || !meatAt(W, H, CH, px, x, y)) continue;
      const q = qL(x, y);
      let n = 0, minX = x, maxX = x, minY = y, maxY = y;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        const px_ = p % W, py = (p / W) | 0;
        n++;
        if (px_ < minX) minX = px_;
        if (px_ > maxX) maxX = px_;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        const nbs = [[px_ - 1, py], [px_ + 1, py], [px_, py - 1], [px_, py + 1]];
        for (const [nx, ny] of nbs) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || !meatAt(W, H, CH, px, nx, ny)) continue;
          if (qL(nx, ny) !== q) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      blobs.push({ n, bw, bh, area: bw * bh });
    }
  }
  const faces = blobs.filter((b) => b.n >= 8 && b.bw >= 3 && b.bh >= 3);
  const large = faces.filter((b) => b.n >= 80 || Math.max(b.bw, b.bh) >= 18);
  const small = faces.filter((b) => b.n < 80 && Math.max(b.bw, b.bh) < 18);
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[(s.length / 2) | 0];
  };
  console.log(`\nGRAIN ${tag}: meat-blobs total=${blobs.length} faces>=8px=${faces.length} large(n>=80|span>=18)=${large.length} small=${small.length}`);
  console.log(`  face median n=${median(faces.map((b) => b.n))} median maxspan=${median(faces.map((b) => Math.max(b.bw, b.bh)))}`);
  if (large.length) {
    const top = [...large].sort((a, b) => b.n - a.n).slice(0, 8);
    console.log(`  largest: ${top.map((b) => `${b.n}px ${b.bw}x${b.bh}`).join(', ')}`);
  }
  return { faces: faces.length, large: large.length, small: small.length };
}

function meanRun(W, H, CH, px, tag) {
  const L = (xx, yy) => {
    const i = (yy * W + xx) * CH;
    return luma([px[i], px[i + 1], px[i + 2]]);
  };
  const runs = [];
  for (let y = 0; y < H; y++) {
    let run = 0, lastQ = -1;
    const flush = () => {
      if (run >= 2) runs.push(run);
      run = 0; lastQ = -1;
    };
    for (let x = 0; x < W; x++) {
      if (!meatAt(W, H, CH, px, x, y)) { flush(); continue; }
      const q = Math.floor(L(x, y) * 12);
      if (q === lastQ) run++;
      else { flush(); run = 1; lastQ = q; }
    }
    flush();
  }
  const mean = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;
  const median = (() => {
    if (!runs.length) return 0;
    const s = [...runs].sort((a, b) => a - b);
    return s[(s.length / 2) | 0];
  })();
  console.log(`MEAN-RUN ${tag}: n=${runs.length} mean=${mean.toFixed(1)} median=${median} max=${runs.length ? Math.max(...runs) : 0}`);
  return mean;
}

function runOne(file, box, tag) {
  const src = path.join(DIR, file);
  const img = decodePng(readFileSync(src));
  console.log(`\n=== ${tag}  ${img.width}x${img.height}  crop ${box.x},${box.y} ${box.w}x${box.h} ===`);
  const s = sample(img, box.x, box.y, box.w, box.h);
  const out = path.join(DIR, `_r22-wound-${tag}.png`);
  const hotOut = path.join(DIR, `_r22-hot-${tag}.png`);
  writePng(out, box.w, box.h, s.ch, s.crop);
  writePng(hotOut, box.w, box.h, 3, s.hot);
  console.log(`wrote ${out}`);
  logStats(tag, s);
  return s;
}

for (const e of extras) {
  runOne(e.file, e, e.tag);
}

const tightPath = path.join(DIR, '_r22-wound-fireplace-cavity-tight.png');
const tight = decodePng(readFileSync(tightPath));
const z = nearestZoom(tight, 4);
writePng(path.join(DIR, '_r22-zoom-fireplace-hole.png'), z.w, z.h, z.ch, z.data);
console.log('\nwrote 4x zoom _r22-zoom-fireplace-hole.png');

{
  const meat = decodePng(readFileSync(path.join(DIR, '_r22-wound-fireplace-meat-window.png')));
  const mz = nearestZoom(meat, 5);
  writePng(path.join(DIR, '_r22-zoom-fireplace-meat-window.png'), mz.w, mz.h, mz.ch, mz.data);
  console.log('wrote 5x zoom _r22-zoom-fireplace-meat-window.png');
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

// densest 80x80 chromatic lip in tight crop
{
  const { width: W, height: H, channels: CH, data: px } = tight;
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
  console.log(`\ndensest 80x80 lip in tight: ${best.x},${best.y} lip=${best.n} punch=${best.punch}`);
  const hole = cropXY(tight, best.x, best.y, 80, 80);
  writePng(path.join(DIR, '_r22-wound-fireplace-hole-only.png'), 80, 80, hole.ch, hole.buf);
  const holeImg = { width: 80, height: 80, channels: hole.ch, data: hole.buf };
  const hz = nearestZoom(holeImg, 4);
  writePng(path.join(DIR, '_r22-zoom-fireplace-hole-tight.png'), hz.w, hz.h, hz.ch, hz.data);
  console.log('wrote hole-only + 4x');
  console.log('\n=== fireplace-hole-only ===');
  logStats('fireplace-hole-only', sampleBuf(80, 80, hole.ch, hole.buf));
  countGrain(80, 80, hole.ch, hole.buf, 'fireplace-hole-only');
  meanRun(80, 80, hole.ch, hole.buf, 'fireplace-hole-only');
}

// archived boxes from r19/r20 on THIS tight crop
{
  for (const [tag, x, y] of [['r19box', 69, 67], ['r20box', 38, 88]]) {
    const box = cropXY(tight, x, y, 80, 80);
    writePng(path.join(DIR, `_r22-wound-fireplace-${tag}.png`), 80, 80, box.ch, box.buf);
    console.log(`\n=== fireplace-${tag} (${x},${y}) on r22 tight ===`);
    logStats(tag, sampleBuf(80, 80, box.ch, box.buf));
    countGrain(80, 80, box.ch, box.buf, tag);
    meanRun(80, 80, box.ch, box.buf, tag);
  }
}

{
  const cav = decodePng(readFileSync(path.join(DIR, '_r22-wound-fireplace-cavity.png')));
  const { width: W, height: H, channels: CH, data: px } = cav;
  const hits = [];
  for (let yy = 0; yy < H; yy++) {
    let n = 0;
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) * CH;
      const c = [px[i], px[i + 1], px[i + 2]];
      const L = luma(c), C = chroma(c);
      if (C >= 0.08 && L >= 0.14 && L < 0.28) n++;
    }
    hits.push(n);
  }
  let peakY = 0;
  for (let y = 1; y < H; y++) if (hits[y] > hits[peakY]) peakY = y;
  const band = hits.map((n, y) => n > 20 ? y : -1).filter((y) => y >= 0);
  console.log(`\nfireplace-cavity chromatic lip-band peak row y=${peakY} hits=${hits[peakY]}`);
  if (band.length) console.log(`  rows with >20 chromatic lip px: ${band[0]}..${band[band.length - 1]} (n=${band.length})`);
  countGrain(W, H, CH, px, 'fireplace-cavity');
  meanRun(W, H, CH, px, 'fireplace-cavity');
}

{
  const meat = decodePng(readFileSync(path.join(DIR, '_r22-wound-fireplace-meat-window.png')));
  countGrain(meat.width, meat.height, meat.channels, meat.data, 'fireplace-meat-window');
  meanRun(meat.width, meat.height, meat.channels, meat.data, 'fireplace-meat-window');
}

{
  const tightNow = decodePng(readFileSync(tightPath));
  countGrain(tightNow.width, tightNow.height, tightNow.channels, tightNow.data, 'r22-tight');
  meanRun(tightNow.width, tightNow.height, tightNow.channels, tightNow.data, 'r22-tight');
}

{
  const r21 = decodePng(readFileSync(path.join(DIR, '_r21-wound-fireplace-cavity-tight.png')));
  console.log('\n=== DELTA archived r21 fireplace-cavity-tight ===');
  logStats('r21-tight', sampleBuf(r21.width, r21.height, r21.channels, r21.data));
  countGrain(r21.width, r21.height, r21.channels, r21.data, 'r21-tight');
  meanRun(r21.width, r21.height, r21.channels, r21.data, 'r21-tight');
}

{
  const r21 = decodePng(readFileSync(path.join(DIR, '_r21-wound-fireplace-meat-window.png')));
  console.log('\n=== DELTA archived r21 fireplace-meat-window ===');
  logStats('r21-meat-window', sampleBuf(r21.width, r21.height, r21.channels, r21.data));
  countGrain(r21.width, r21.height, r21.channels, r21.data, 'r21-meat-window');
  meanRun(r21.width, r21.height, r21.channels, r21.data, 'r21-meat-window');
}

{
  const r21h = decodePng(readFileSync(path.join(DIR, '_r21-wound-fireplace-hole-only.png')));
  console.log('\n=== DELTA archived r21 fireplace-hole-only ===');
  logStats('r21-hole-only', sampleBuf(r21h.width, r21h.height, r21h.channels, r21h.data));
  countGrain(r21h.width, r21h.height, r21h.channels, r21h.data, 'r21-hole-only');
  meanRun(r21h.width, r21h.height, r21h.channels, r21h.data, 'r21-hole-only');
}

{
  const r21d = decodePng(readFileSync(path.join(DIR, '_r21-wound-desk-cavity-tight.png')));
  console.log('\n=== DELTA archived r21 desk-cavity-tight ===');
  logStats('r21-desk-tight', sampleBuf(r21d.width, r21d.height, r21d.channels, r21d.data));
}
