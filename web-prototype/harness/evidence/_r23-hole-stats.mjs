/**
 * r23 pass 1b: hole-only / park cream numbers the wound-sample log truncated.
 * Still not opening 148s.
 */
import { readFileSync } from 'node:fs';
import { decodePng } from '../pxdiff.mjs';
import path from 'node:path';

const DIR = 'harness/out/furn-smash-critic';
const luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const chroma = (c) => {
  const m = Math.max(...c) / 255, n = Math.min(...c) / 255;
  return m - n;
};

function sampleBuf(W, H, CH, px) {
  let nKeep = 0, nSkip = 0, nCream = 0, nDark = 0, nMid = 0, nLip = 0, nPunch = 0;
  for (let i = 0; i < W * H; i++) {
    const c = [px[i * CH], px[i * CH + 1], px[i * CH + 2]];
    const L = luma(c), C = chroma(c);
    const floorKhaki = L > 0.40 && C < 0.14;
    const robotWhite = L > 0.72;
    const cycGrey = C < 0.05 && L > 0.12 && L < 0.55;
    if (floorKhaki || robotWhite || cycGrey) { nSkip++; continue; }
    nKeep++;
    if (L >= 0.35 && C < 0.22) nCream++;
    else if (L < 0.08) nPunch++;
    else if (L < 0.14) nDark++;
    else if (L < 0.28) nLip++;
    else nMid++;
  }
  const pct = (n) => (nKeep ? (100 * n / nKeep).toFixed(1) : 'na');
  return { nKeep, nSkip, cream: `${nCream} (${pct(nCream)}%)`, punch: `${nPunch} (${pct(nPunch)}%)`, dark: `${nDark} (${pct(nDark)}%)`, lip: `${nLip} (${pct(nLip)}%)`, mid: `${nMid} (${pct(nMid)}%)`, nLip, nPunch, nCream };
}

const files = [
  '_r23-wound-fireplace-hole-only.png',
  '_r23-wound-fireplace-meat-window.png',
  '_r23-wound-fireplace-cavity-tight.png',
  '_r23-wound-settee-hole.png',
  '_r23-wound-chaise-seat.png',
  '_r23-wound-crate-hole.png',
  '_r23-wound-table-round-wound.png',
  '_r22-wound-fireplace-hole-only.png',
  '_r22-wound-settee-hole.png',
  '_r22-wound-chaise-seat.png',
  '_r22-wound-crate-hole.png',
];
for (const f of files) {
  const img = decodePng(readFileSync(path.join(DIR, f)));
  const s = sampleBuf(img.width, img.height, img.channels, img.data);
  console.log(`\n${f} ${img.width}x${img.height}`);
  console.log(`  keep ${s.nKeep} skip ${s.nSkip}`);
  console.log(`  cream=${s.cream} punch=${s.punch} dark=${s.dark} lip=${s.lip} mid=${s.mid}`);
}
