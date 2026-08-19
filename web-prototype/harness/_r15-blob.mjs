/**
 * Critic scratch: connected-component rectangularity of debris vs r14 crops.
 * Floor khaki / robot white / cyc skipped. Leftover heaps vs this-prop plates.
 */
import { readFileSync } from 'node:fs';
import { decodePng } from './pxdiff.mjs';
import path from 'node:path';

const DIR = 'harness/out/furn-smash-critic';
const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => Math.max(...c) / 255 - Math.min(...c) / 255;

function mask(img) {
  const { width: W, height: H, channels: CH, data: px } = img;
  const m = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += CH) {
    const c = [px[p], px[p + 1], px[p + 2]];
    const L = luma(c), C = chroma(c);
    const floorKhaki = L > 0.40 && C < 0.14;
    const robotWhite = L > 0.72;
    const cycGrey = C < 0.05 && L > 0.12 && L < 0.55;
    const blackBg = L < 0.05 && C < 0.03;
    m[i] = (floorKhaki || robotWhite || cycGrey || blackBg) ? 0 : 1;
  }
  return m;
}

function components(m, W, H, minPx) {
  const seen = new Uint8Array(W * H);
  const out = [];
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = y * W + x;
      if (!m[s] || seen[s]) continue;
      let qh = 0, qt = 0;
      qx[qt] = x; qy[qt] = y; qt++;
      seen[s] = 1;
      let minx = x, maxx = x, miny = y, maxy = y, n = 0, peri = 0;
      while (qh < qt) {
        const cx = qx[qh], cy = qy[qh]; qh++;
        n++;
        if (cx < minx) minx = cx;
        if (cx > maxx) maxx = cx;
        if (cy < miny) miny = cy;
        if (cy > maxy) maxy = cy;
        const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of neigh) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) { peri++; continue; }
          const ni = ny * W + nx;
          if (!m[ni]) { peri++; continue; }
          if (seen[ni]) continue;
          seen[ni] = 1;
          qx[qt] = nx; qy[qt] = ny; qt++;
        }
      }
      if (n < minPx) continue;
      const bw = maxx - minx + 1, bh = maxy - miny + 1;
      const fill = n / (bw * bh);
      const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
      const compact = peri / Math.sqrt(n);
      out.push({ n, bw, bh, fill: +fill.toFixed(3), aspect: +aspect.toFixed(2), compact: +compact.toFixed(2), box: `${minx},${miny}` });
    }
  }
  out.sort((a, b) => b.n - a.n);
  return out.slice(0, 8);
}

function report(label, file) {
  const img = decodePng(readFileSync(path.join(DIR, file)));
  const m = mask(img);
  const blobs = components(m, img.width, img.height, 80);
  const meanFill = blobs.length ? blobs.reduce((s, b) => s + b.fill, 0) / blobs.length : 0;
  console.log(`\n=== ${label}  ${img.width}x${img.height}  blobs=${blobs.length}  meanFill=${meanFill.toFixed(3)} ===`);
  for (const b of blobs) {
    console.log(`  n=${String(b.n).padStart(5)}  ${b.bw}x${b.bh}  fill=${b.fill.toFixed(3)}  aspect=${b.aspect.toFixed(2)}  peri/sqrtA=${b.compact.toFixed(2)}  @${b.box}`);
  }
}

const pairs = [
  ['r14 leftover-left (table-round heap)', '_r14-wound-chaise-leftover-left.png'],
  ['r15 leftover-left (table-round heap)', '_r15-wound-chaise-leftover-left.png'],
  ['r14 leftover-right (settee/chaise heap)', '_r14-wound-settee-leftover-right.png'],
  ['r15 leftover-right (settee/chaise heap)', '_r15-wound-settee-leftover-right.png'],
  ['r14 chaise plates', '_r14-wound-chaise-plates.png'],
  ['r15 chaise plates', '_r15-wound-chaise-plates.png'],
  ['r14 settee plates', '_r14-wound-settee-plates.png'],
  ['r15 settee plates', '_r15-wound-settee-plates.png'],
  ['r14 desk plates', '_r14-wound-desk-plates.png'],
  ['r15 desk plates', '_r15-wound-desk-plates.png'],
  ['r14 crate plates', '_r14-wound-crate-plates.png'],
  ['r15 crate plates', '_r15-wound-crate-plates.png'],
  ['r14 table-round plates', '_r14-wound-table-round-plates.png'],
  ['r15 table-round plates', '_r15-wound-table-round-plates.png'],
  ['r14 fireplace base', '_r14-wound-fireplace-base.png'],
  ['r15 fireplace base', '_r15-wound-fireplace-base.png'],
  ['r14 fireplace right leftover', '_r14-wound-fireplace-right.png'],
  ['r15 fireplace right leftover', '_r15-wound-fireplace-right.png'],
  ['r15 table-round after', '_r15-wound-table-round-after.png'],
  ['r15 chaise leave', '_r15-wound-chaise-leave.png'],
  ['r15 desk leave', '_r15-wound-desk-leave.png'],
  ['r15 crate leave', '_r15-wound-crate-leave.png'],
  ['r15 fireplace leave', '_r15-wound-fireplace-leave.png'],
];

for (const [label, file] of pairs) {
  try { report(label, file); }
  catch (e) { console.log(`\n=== ${label} FAIL ${e.message} ===`); }
}
