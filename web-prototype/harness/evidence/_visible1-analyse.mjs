#!/usr/bin/env node
/**
 * 🔎 **PRICE EVERY CANDIDATE BAND ON ONE RECORDED DRIVE** (`visible-1`, exploratory).
 *
 *   node harness/scenarios/... (records)  ->  node harness/evidence/_visible1-analyse.mjs
 *
 * `DAMAGE_BANDS` is a purely VISUAL mapping from the smoothed depth channel B to each layer's
 * tear — `DamageField._add()` never reads it — so a recorded B history answers "what would band
 * X have looked like" for every X without a second browser and without a build.
 *
 * Two numbers per candidate, and they pull against each other:
 *   BLIND   the fraction of blows that move nothing at the point of impact. The defect.
 *   FILL    the cyan's diameter as a fraction of the breach's, at the end of the drive.
 *           `critic-dig-4` asked for 83% and round 6 delivered it; a deep band spends it.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const IN = path.resolve(process.env.VIS1_OUT ?? 'progress/playtest/_visible1-drives.json');
const raw = JSON.parse(await readFile(IN, 'utf8'));
const pc = (n) => `${(100 * n).toFixed(1)}%`;

const clamp01 = (v) => (v <= 0 ? 0 : (v >= 1 ? 1 : v));
const band = (B, lo, hi) => clamp01((B - lo) / (hi - lo));

/**
 * The visible state of one texel, as the shader computes it: the skin's band, the shell front's
 * band, and the innermost layer's band. Layer 3 is only ON SCREEN where the layers in front of it
 * have gone — every band is a level set of ONE order field (round 6), so with `order` taken at its
 * median 0.5 that is exactly `shell >= 0.5`.
 */
function metrics(d, bands) {
  const N = d.cols * d.rows;
  const cellArea = d.cellW * d.cellH;
  const NEARX = 0.25 / d.cellW, NEARY = 0.25 / d.cellH;
  const WIDEX = 0.52 / d.cellW, WIDEY = 0.52 / d.cellH;
  const rows = [];
  let prev = null;
  for (let f = 0; f < d.frames.length; f++) {
    const F = d.frames[f];
    const s = new Float32Array(N), w = new Float32Array(N), k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const B = F[i] / 255;
      s[i] = band(B, bands[0][0], bands[0][1]);
      w[i] = band(B, bands[1][0], bands[1][1]);
      k[i] = w[i] >= 0.5 ? band(B, bands[3][0], bands[3][1]) : 0;
    }
    const now = { s, w, k };
    if (prev && f > 0) {
      const [u, v] = d.hits[f - 1];
      const cxh = u * d.cols, cyh = v * d.rows;
      let near = 0, wide = 0, all = 0, nearMax = 0;
      for (let cy = 0; cy < d.rows; cy++) {
        for (let cx = 0; cx < d.cols; cx++) {
          const i = cy * d.cols + cx;
          const dv = Math.max(Math.abs(now.s[i] - prev.s[i]),
            Math.abs(now.w[i] - prev.w[i]), Math.abs(now.k[i] - prev.k[i]));
          if (dv <= 0) continue;
          all += dv * cellArea;
          const ex = cx + 0.5 - cxh, ey = cy + 0.5 - cyh;
          if ((ex * ex) / (WIDEX * WIDEX) + (ey * ey) / (WIDEY * WIDEY) <= 1) wide += dv * cellArea;
          if ((ex * ex) / (NEARX * NEARX) + (ey * ey) / (NEARY * NEARY) <= 1) {
            near += dv * cellArea; if (dv > nearMax) nearMax = dv;
          }
        }
      }
      rows.push({ near, wide, all, nearMax });
    }
    prev = now;
  }
  // the legibility floor, calibrated off THIS drive's own first blows on pristine wall
  const first = rows.slice(0, 3).map((r) => r.wide).sort((a, b) => a - b);
  const full = first[Math.floor(first.length / 2)] || 1e-9;
  const floor = full * 0.10;
  const blindNear = rows.filter((r) => r.near < floor).length;
  const blindWide = rows.filter((r) => r.wide < floor).length;
  const dead = rows.filter((r) => r.nearMax < 0.02).length;

  // FILL — at the END of the drive, the cyan's diameter against the breach's. Areas, then
  // sqrt, because a diameter ratio is what `critic-dig-4` and round 6 both quote.
  const F = d.frames[d.frames.length - 1];
  let breach = 0, cyan = 0;
  for (let i = 0; i < N; i++) {
    const B = F[i] / 255;
    if (band(B, bands[0][0], bands[0][1]) > 0.5) breach++;
    if (band(B, bands[1][0], bands[1][1]) > 0.5 && band(B, bands[3][0], bands[3][1]) > 0.5) cyan++;
  }
  return {
    blows: rows.length, blindNear, blindWide, dead, full,
    fill: breach > 0 ? Math.sqrt(cyan / breach) : 0,
    breachArea: breach * cellArea, cyanArea: cyan * cellArea,
  };
}

const CANDIDATES = [
  ['SHIPPED           ', [0.050, 0.420]],
  ['deep [0.42, 1.00] ', [0.420, 1.000]],
  ['deep [0.36, 1.00] ', [0.360, 1.000]],
  ['deep [0.30, 1.00] ', [0.300, 1.000]],
  ['deep [0.36, 0.90] ', [0.360, 0.900]],
  ['deep [0.30, 0.85] ', [0.300, 0.850]],
  ['deep [0.25, 0.80] ', [0.250, 0.800]],
  ['deep [0.20, 0.75] ', [0.200, 0.750]],
  ['deep [0.15, 0.70] ', [0.150, 0.700]],
  ['deep [0.10, 0.60] ', [0.100, 0.600]],
  ['deep [0.05, 0.60] ', [0.050, 0.600]],
];

const modes = ['through', 'probe'];
console.log(`\n  ${raw.drives.length} drives · shipped bands ${JSON.stringify(raw.bands)}\n`);
for (const mode of modes) {
  const ds = raw.drives.filter((d) => d.mode === mode);
  if (!ds.length) continue;
  console.log(`  ${mode.toUpperCase()} — ${ds.map((d) => `${d.seed}:${d.blows}b`).join(' ')}`);
  console.log('    band 3 (the innermost layer)   blind@impact  blind@brush   dead   cyan fill');
  for (const [label, b3] of CANDIDATES) {
    const bands = [raw.bands[0], raw.bands[1], raw.bands[2], b3];
    let blows = 0, bn = 0, bw = 0, dd = 0, fill = 0;
    for (const d of ds) {
      const m = metrics(d, bands);
      blows += m.blows; bn += m.blindNear; bw += m.blindWide; dd += m.dead; fill += m.fill;
    }
    console.log(`    ${label}            ${pc(bn / blows).padStart(6)}       ${pc(bw / blows).padStart(6)}`
      + `   ${pc(dd / blows).padStart(6)}   ${pc(fill / ds.length).padStart(6)}`);
  }
  console.log('');
}
