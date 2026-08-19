/**
 * HEADLESS DIG-BAND SIM — the tuning loop for `damagefield.js`'s brush, without a browser.
 *
 * Reproduces `harness/scenarios/dig-free.mjs`'s F3 (a probe) and F4 (open the answer) drives
 * against the real `DamageField`, so `BRUSH_R` / `STRENGTH` / the new lobe knobs can be swept
 * in seconds instead of in browser rounds. The seconds it prints are the same arithmetic
 * `dig-free.mjs` prints, so the two are comparable by construction.
 *
 *   node harness/_tmp_lobesim.mjs [--lobe 0.42] [--strength 0.31] [--radius 0.52] [--seeds 8]
 */
import { DamageField, CELL } from '../src/destruction/damagefield.js';
import { chooseFreeInterconnect, freePanels } from '../src/game/dig.js';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? +process.argv[i + 1] : d;
};
const SWING = 0.95;
const PROBE_STEP = 1.5;
const IC_W = 1.55, IC_H = 2.60, DIG_H = 2.80;
const SPANS = [2.96, 5.72, 2.56];

const over = {};
if (process.argv.includes('--lobe')) over.lobe = arg('lobe', 0);
if (process.argv.includes('--grain')) over.grain = arg('grain', 0);
if (process.argv.includes('--lobeCell')) over.lobeCell = arg('lobeCell', 0.55);
if (process.argv.includes('--strength')) over.strength = arg('strength', 0.31);
if (process.argv.includes('--radius')) over.radius = arg('radius', 0.52);
if (process.argv.includes('--rim')) over.rim = arg('rim', 0.62);
const SEEDS = arg('seeds', 8);

const mk = (w) => new DamageField({ width: w, height: DIG_H, cell: CELL, brush: over });

/** one probe at (u, v): blows until the spot is dug through */
function probe(g, u, v = 0.40, cap = 60) {
  let n = 0;
  for (let i = 0; i < cap; i++) {
    g.applyHit(u, v, 1);
    n++;
    if (g.depthAt(u, v) >= 0.999) break;
  }
  return n;
}

/** dig-free.mjs's aim: the shallowest cell inside a body-wide window on the barrier-free band */
function aim(g) {
  const cy0 = 0;
  const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
  const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
  let bestA = -1, bestN = 0, runA = -1, run = 0;
  for (let cx = 0; cx <= g.cols; cx++) {
    let clear = cx < g.cols;
    for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
    if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
    else run = 0;
  }
  if (bestN === 0) return null;
  const needed = Math.ceil(0.80 / g.cellW);
  const mid = bestA + bestN / 2;
  const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
  const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
  let bx = cx0, by = cy0, bd = 2;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const d = g.depth[g.idx(cx, cy)];
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
  }
  return [(bx + 0.5) / g.cols, (by + 0.5) / g.rows];
}

let probeSum = 0, breakSum = 0, secsSum = 0, perBlowSum = 0, nOk = 0;
const NSEED = () => Math.min(SEEDS, CASES.length);
const rows = [];
/**
 * 🚨 **THE INTERCONNECT IS THE REAL SEEDED ONE, AND THE FIRST VERSION OF THIS SIM INVENTED IT.**
 *
 * It ran a synthetic blob on the 5.72 m span, on the reasoning that `chooseFreeInterconnect`
 * weights the draw by width. But `dig-free.mjs` walks the census IN TABLE ORDER, so on seed s4 it
 * opens the answer on `f.svc_w.0.a`, which is **2.96 m** — and the synthetic blob was the wrong
 * size there besides (460 free cells against the real 364). The sim read 66 s where the browser
 * read 74 s for the same build, which is this project's standing hazard: an instrument that
 * agrees with the thing it was calibrated on and diverges the moment the build moves.
 *
 * So the regions come from `dig.js` itself, on named seeds, and every seeded edge is driven.
 */
const SEED_NAMES = ['s4', 'search-b', 'search-c', 'seed-d', 'seed-e', 'seed-f'];
const CASES = [];
for (const name of SEED_NAMES) {
  const faces = new Map(freePanels().filter((p) => p.side === 'a').map((p) => [p.id, p.w]));
  for (const [, r] of chooseFreeInterconnect(name)) {
    CASES.push({ name, w: faces.get(r.panel), u0: r.u, ru: r.ru, rv: r.rv, salt: r.salt });
  }
}

for (let s = 0; s < Math.min(SEEDS, CASES.length); s++) {
  const { w, u0, ru, rv, salt } = CASES[s];

  // --- one blow on pristine wall: the figure `dig-free.mjs` F1 prints
  const g0 = mk(w);
  const one = g0.applyHit(0.5, 0.42, 1).removed;
  perBlowSum += one;

  // --- a probe (F3), on a dud spot
  const gp = mk(w);
  const pb = probe(gp, 0.5, 0.40);

  // --- open the answer (F4)
  const g = mk(w);
  g.setInterconnect(u0, 0.5, ru, rv, salt);
  let blows = 0;
  // the probe that finds it: a player probing at the region's centre
  blows += probe(g, u0, 0.40);
  let opened = false;
  for (let i = 0; i < 400; i++) {
    const a = aim(g);
    if (!a) break;
    g.applyHit(a[0], a[1], 1);
    blows++;
    if (g.channel(0.34, 1.70, 0.30, 0).open) { opened = true; break; }
  }
  const spots = SPANS.reduce((n, x) => n + Math.max(1, Math.round(x / PROBE_STEP)), 0);
  const duds = (spots - 1) / 2;
  const search = duds * pb + blows;
  const secs = search * SWING;
  rows.push({ s, w, one: +one.toFixed(4), probe: pb, breakBlows: blows, opened, search, secs: +secs.toFixed(0) });
  if (opened) { probeSum += pb; breakSum += blows; secsSum += secs; nOk++; }
}
const bySpan = {};
for (const r of rows) {
  bySpan[r.w] = bySpan[r.w] || [];
  bySpan[r.w].push(r.secs);
}
console.log(JSON.stringify({
  brush: mk(SPANS[1]).brush,
  perBlowPristine: +(perBlowSum / NSEED()).toFixed(4),
  probeBlows: +(probeSum / Math.max(1, nOk)).toFixed(1),
  breakBlows: +(breakSum / Math.max(1, nOk)).toFixed(1),
  seconds: +(secsSum / Math.max(1, nOk)).toFixed(1),
  worstSpanSeconds: Math.max(...rows.map((r) => r.secs)),
  perSpanSeconds: Object.fromEntries(Object.entries(bySpan)
    .map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)])),
  opened: `${nOk}/${NSEED()}`,
}, null, 1));
