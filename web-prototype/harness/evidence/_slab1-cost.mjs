/**
 * 🧱 **THE SLAB SPIKE — WHAT ONE FACE PER WALL COSTS, WHAT IT DOES TO THE COLLAPSE, AND WHAT IT
 * DOES TO THE SEARCH.**
 *
 *   node harness/evidence/_slab1-cost.mjs
 *
 * John, 2026-08-10: *"I want to test if we can make one single wall instead of the current wall
 * tiles… when we build the procedural map rooms I want each entire wall to be one single
 * destructive wall without any seams… for a test, let's make the service passage on the test slice
 * one single piece wall on each side."*
 *
 * ⚠️ **NO RENDERER, NO BROWSER, NO WALL CLOCK IN ANY ASSERTION.** Every rule figure drives the
 * shipped `DamageField` / `support.js` headless, so it is bit-identical under any GPU load — the
 * property `dig-band.mjs` records as what makes a dig measurement survive a busy board. Wall-clock
 * numbers ARE printed (they are the whole of hazard 3) but they are reported and never asserted
 * on; the asserted forms are cells, bytes and taps, which are exact.
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, ON EVERY RUN.** Where a control stops
 * showing the thing it is supposed to show, the file goes RED and says the comparison is
 * meaningless rather than reporting a result against a baseline it invented.
 *
 * ⚠️ **AND THE CONTROL HAS TO BE ABLE TO EXPRESS THE THING BEING ASKED** — `two-sided.mjs`'s own
 * first control failed on a good tree because it asserted something that could not rise from its
 * floor. Each control below states, in its own message, the floor it has to clear.
 */

import { DamageField, COLLAPSE, CELL } from '../../src/destruction/damagefield.js';
import { DIG_EDGES, SLAB_EDGES, freePanels, chooseFreeInterconnect, DIG_H, IC_W }
  from '../../src/game/dig.js';
import { PANELS } from '../../src/game/spaces.js';
import { isExitSite } from '../../src/game/connectors.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);
const kb = (n) => `${f1(n / 1024)} kB`;

let passN = 0, failN = 0;
const pass = (t, d) => { passN++; console.log(`  ✅ PASS  ${t}\n          ${d}`); };
const fail = (t, d) => { failN++; console.log(`  ❌ FAIL  ${t}\n          ${d}`); };
const note = (s) => console.log(`  ${s}`);
const head = (s) => console.log(`\n${s}`);

/** `DamageField`'s own sizing rule, reproduced so a table can be built without allocating. */
const even = (v) => Math.max(4, 2 * Math.round(v / 2));
const gridOf = (w, h = DIG_H) => {
  const cols = even(w / CELL), rows = even(h / CELL);
  return { cols, rows, cells: cols * rows };
};

/**
 * 📐 **THE PER-FACE MEMORY BILL, AND IT IS NOT ONLY THE TEXTURE.** The `DataTexture` is `n × 4`
 * bytes and is what crosses the bus; the CPU side is nine more arrays the constructor allocates,
 * and they are what a slab multiplies in main memory. Counted from the constructor, field by
 * field, rather than estimated:
 *
 *   data      Uint8Array   n × 4   ← THE UPLOAD
 *   depth     Float32Array n × 4     grain Float32 n × 4    plate Int32 n × 4
 *   barrier   Uint8Array   n × 1     _blurA/_blurB n × 4 each
 *   _sag      Uint8Array   n × 1 (allocated lazily by support.js)
 *   _shedA/_shedB Float32Array n × 4 each
 */
const BYTES_TEX = 4;
const BYTES_CPU = 4 + 4 + 4 + 1 + 4 + 4 + 4 + 4 + 1;   // 30 B/cell, excluding the texture mirror

// =============================================================================================
head('═══ A — THE GRID: CELLS AND BYTES, TILED ARM AGAINST SLAB ARM ═══');
// =============================================================================================

const faceTable = (edges, only) => freePanels(edges)
  .filter((p) => !only || only.has(p.edge))
  .map((p) => ({ id: p.id, w: p.w, ...gridOf(p.w) }));

const SVC = new Set(['svc_w', 'svc_e']);
const tiled = faceTable(DIG_EDGES, SVC);
const slab = faceTable(SLAB_EDGES, SVC);
const sum = (t, k) => t.reduce((a, r) => a + r[k], 0);

note('  the two service-passage edges, both sides — this is the whole of what the flag changes');
note('  arm     faces   widths                              cols×rows            cells   texture   CPU');
note(`  tiled   ${String(tiled.length).padStart(5)}   ${[...new Set(tiled.map((r) => f2(r.w)))].join(' / ').padEnd(34)}`
  + `${[...new Set(tiled.map((r) => `${r.cols}×${r.rows}`))].join(' ').padEnd(20)}`
  + `${String(sum(tiled, 'cells')).padStart(6)}  ${kb(sum(tiled, 'cells') * BYTES_TEX).padStart(8)}  ${kb(sum(tiled, 'cells') * BYTES_CPU)}`);
note(`  slab    ${String(slab.length).padStart(5)}   ${[...new Set(slab.map((r) => f2(r.w)))].join(' / ').padEnd(34)}`
  + `${[...new Set(slab.map((r) => `${r.cols}×${r.rows}`))].join(' ').padEnd(20)}`
  + `${String(sum(slab, 'cells')).padStart(6)}  ${kb(sum(slab, 'cells') * BYTES_TEX).padStart(8)}  ${kb(sum(slab, 'cells') * BYTES_CPU)}`);
note('');
note('  ⚠️ THE SLAB IS 15.40 m, NOT 11.24. The three authored spans total 11.24 m of DIGGABLE wall;');
note('     the 4.16 m between them is the two shipped BREACHABLE connectors. A single piece of wall');
note('     is the whole run — see dig.js SLAB — so the extra cells are the doors becoming wall.');

/**
 * 🚨 **HAZARD 3, EXTRAPOLATED — WHERE DOES IT STOP BEING AFFORDABLE?** `genspike-1`'s packing
 * emits free-form shared walls at mean **13.82 m**, p95 **34.80 m**, max **85.90 m**. A face is
 * `even(w / CELL) × 30` cells and every per-frame cost in this system is linear in that.
 */
head('  extrapolation — one face at the widths the generator can actually produce');
note('  width          cols×rows      cells    texture upload   CPU arrays   _smooth taps/frame');
for (const w of [2.56, 2.96, 5.72, 11.24, 15.40, 13.82, 34.80, 85.90]) {
  const g = gridOf(w);
  // `_smooth` is 3 taps × 3 separable passes × 2 axes; `_shed` and `_strain` are further O(n)
  // sweeps in the same `flush()`. This counts the blur alone, as the cheapest honest lower bound.
  const taps = g.cells * 3 * 3 * 2;
  note(`  ${f2(w).padStart(6)} m   ${`${g.cols}×${g.rows}`.padEnd(12)} ${String(g.cells).padStart(6)}   `
    + `${kb(g.cells * BYTES_TEX).padStart(13)}   ${kb(g.cells * BYTES_CPU).padStart(10)}   ${String(taps).padStart(9)}`);
}

// =============================================================================================
head('═══ B — THE COLLAPSE ON A LONG FACE (hazard 2: the threshold is an AREA) ═══');
// =============================================================================================

/**
 * 🎯 **THE QUESTION, STATED SO THE ANSWER CANNOT BE MISREAD.** `COLLAPSE.fail` is 3.40 m² of
 * hanging wall, chosen *because* a fraction-of-face rule dropped small walls on one hit. On an
 * 11.24 m or 15.40 m slab, 3.40 m² is a much smaller SHARE of the face. Two things could go wrong
 * and they are opposite:
 *
 *   · **the arch fires almost immediately** — it does not, and the reason is that the threshold is
 *     an area and a blow hangs the same area whatever wall it is cut into; or
 *   · **the connected hanging region becomes the whole wall**, so one bite is a storey.
 *
 * Both are measured below, on the shipped rule, at seven widths, with the same player.
 */
const stride = (f) => (f.brush.radius * 1.3) / f.width;

/** `_sag1-grain`'s `undercut` policy, verbatim in shape: a marching low cut, the skilled dig. */
const undercutAim = (f) => {
  const stepU = stride(f);
  return (k) => {
    const perRow = Math.max(2, Math.ceil(1 / stepU));
    const row = Math.floor(k / perRow), j = k % perRow;
    const side = j % 2 ? 1 : -1;
    const off = side * (0.5 + Math.floor(j / 2)) * stepU;
    return [0.5 + off, 0.30 - 0.20 + row * 0.22 + Math.sin(k * 0.9) * 0.03];
  };
};

function driveWidth(w, blows, opts = {}) {
  const f = new DamageField({ width: w, height: DIG_H });
  f.barrier.fill(0);
  if (opts.collapse) f.collapse = { ...COLLAPSE, ...opts.collapse };
  const aim = undercutAim(f);
  const cellArea = (w / f.cols) * (DIG_H / f.rows);
  const faceArea = w * DIG_H;
  let firstArch = -1, firstArchLoad = 0, biggest = 0, events = 0, totalCells = 0;
  let peakSag = 0, peakLoadSeen = 0;
  const flushMs = [], hitMs = [];
  for (let k = 0; k < blows; k++) {
    const [u, v] = aim(k);
    const th0 = process.hrtime.bigint();
    const r = f.applyHit(Math.min(0.995, Math.max(0.005, u)), Math.min(0.98, Math.max(0.02, v)), 1);
    const hitNs = Number(process.hrtime.bigint() - th0) / 1e6;
    // same filter as `flush()` below: a blow that removed nothing is timing an early-out.
    if (r.removedCells > 0) hitMs.push(hitNs);
    const c = r.collapse;
    if (c) {
      /**
       * ⚠️ **`kind: 'sag'` CARRIES `cells: 0` BY CONSTRUCTION** — it is the announcement that a
       * region has LET GO, not a payout — so a loop that skips zero-cell events cannot see the
       * arch fire at all. The first version of this file did exactly that and reported "never"
       * on all seven widths, which is the shape of a probe that observes nothing and prints a
       * result anyway. `support.js`'s own `@returns` block says it in one clause.
       */
      for (const e of (c.events ?? [])) {
        if ((e.kind === 'sag' || e.kind === 'arch') && firstArch < 0) {
          firstArch = k + 1; firstArchLoad = e.load ?? 0;
        }
        if ((e.load ?? 0) > peakLoadSeen) peakLoadSeen = e.load ?? 0;
        if (e.cells <= 0) continue;
        events++; totalCells += e.cells;
        if (e.cells > biggest) biggest = e.cells;
      }
    }
    if (f._sag) {
      let n = 0; for (let i = 0; i < f._sag.length; i++) n += f._sag[i] ? 1 : 0;
      if (n > peakSag) peakSag = n;
    }
    /**
     * ⚠️ **ONLY THE FLUSHES THAT DID WORK ARE TIMED, AND THE FIRST VERSION OF THIS DID NOT DO
     * THAT.** A narrow face is fully cleared inside ~20 of the 90 blows, after which `applyHit`
     * removes nothing, `dirty` stays false and `flush()` returns on its first line — so the
     * MEDIAN blow on a 2.56 m face was timing an early-out and read 0.000 ms while the 85.90 m
     * face, still being worked at blow 90, read 1.75. That is a 700× "cost of width" that is
     * entirely an artefact of which faces the drive had finished.
     */
    const t0 = process.hrtime.bigint();
    const did = f.flush();
    if (did) flushMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  flushMs.sort((a, b) => a - b);
  hitMs.sort((a, b) => a - b);
  if (!flushMs.length) flushMs.push(0);
  if (!hitMs.length) hitMs.push(0);
  return {
    w, cols: f.cols, cells: f.cols * f.rows, cellArea, faceArea,
    firstArch, firstArchLoad, biggest, biggestArea: biggest * cellArea,
    events, totalCells, peakSag, peakSagFrac: peakSag / (f.cols * f.rows),
    flushMedMs: flushMs[flushMs.length >> 1], flushMaxMs: flushMs[flushMs.length - 1],
    hitMedMs: hitMs[hitMs.length >> 1], hitMaxMs: hitMs[hitMs.length - 1],
  };
}

const WIDTHS = [2.56, 2.96, 5.72, 11.24, 15.40, 34.80, 85.90];
const BLOWS = 90;
const runs = WIDTHS.map((w) => driveWidth(w, BLOWS));

note(`  the same marching undercut, ${BLOWS} blows, on seven faces. THE THRESHOLD IS 3.40 m².`);
note('  width     face m²   3.40 as %   1st ARCH   load at it   biggest event    events   peak SAGGING');
note('                       of face     (blow)        m²        cells    m²              % of face');
for (const r of runs) {
  note(`  ${f2(r.w).padStart(6)} m  ${f1(r.faceArea).padStart(7)}   ${f1(100 * COLLAPSE.fail / r.faceArea).padStart(8)}%  `
    + `${(r.firstArch > 0 ? String(r.firstArch) : 'never').padStart(9)}   ${f2(r.firstArchLoad).padStart(8)}   `
    + `${String(r.biggest).padStart(6)}  ${f2(r.biggestArea).padStart(5)}   ${String(r.events).padStart(7)}   `
    + `${f1(100 * r.peakSagFrac).padStart(9)}%`);
}

const short = runs[0], long11 = runs[3], long15 = runs[4], huge = runs[6];

/**
 * 🚨 **THE HEADLINE ASSERTION.** If the threshold really is an area, the blow at which the arch
 * first lets go must be **the same on every width** — the mass over a 1.04 m hole is the mass over
 * a 1.04 m hole. If instead it moved with the face, the slab would be a different mechanic.
 */
const archBlows = runs.filter((r) => r.firstArch > 0).map((r) => r.firstArch);
const archSpread = Math.max(...archBlows) - Math.min(...archBlows);
(archBlows.length === runs.length && archSpread <= 2)
  ? pass('THE ARCH FIRES AT THE SAME BLOW ON A 2.56 m FACE AND AN 85.90 m ONE',
    `first arch event at blow ${archBlows.join(' / ')} across widths ${WIDTHS.map(f2).join(' / ')} m `
    + `— a spread of ${archSpread}. 3.40 m² is ${f1(100 * COLLAPSE.fail / short.faceArea)}% of the `
    + `short face and ${f1(100 * COLLAPSE.fail / huge.faceArea)}% of the 85.90 m one, and the rule `
    + 'does not notice: the load hanging over a 1.04 m brush is a property of the brush.')
  : fail('THE ARCH FIRES AT THE SAME BLOW ON A 2.56 m FACE AND AN 85.90 m ONE',
    `first arch at ${runs.map((r) => `${f2(r.w)}m:${r.firstArch}`).join(' ')} — spread ${archSpread}. `
    + 'A slab changes WHEN the wall lets go, which is the finding that decides viability.');

/**
 * 🚨 **THE CONTROL, AND IT IS THE REJECTED RULE PUT BACK.** `destruction.md` §7 records that a
 * fraction-of-face threshold was measured and refused because *"one bottom blow would drop a small
 * wall"*. Reintroduce it — `fail = 0.26 × faceArea`, the fraction quoted there — and the same
 * seven drives MUST disagree wildly across widths. If they do not, this file is not reading the
 * threshold at all and the PASS above means nothing.
 *
 * ⚠️ **THE FLOOR THIS CONTROL HAS TO CLEAR IS STATED: a spread of more than 2 blows.** That is the
 * same bar the assertion above passes on, so the two arms are asked the identical question.
 */
const ctrl = WIDTHS.map((w) => driveWidth(w, BLOWS, { collapse: { fail: 0.26 * w * DIG_H } }));
const ctrlBlows = ctrl.map((r) => r.firstArch);
const ctrlSpread = Math.max(...ctrlBlows) - Math.min(...ctrlBlows);
note('');
note(`  CONTROL — the refused fraction-of-face rule (fail = 26% of the face) on the same drives:`);
note(`     ${ctrl.map((r) => `${f2(r.w)}m→${r.firstArch > 0 ? `blow ${r.firstArch}` : 'never'}`).join(' · ')}`);
(ctrlSpread > 2 || ctrlBlows.some((b) => b < 0))
  ? pass('CONTROL — a fraction-of-face threshold DOES move with the width, so the probe can see it',
    `spread ${ctrlSpread === -Infinity ? 'n/a' : ctrlSpread} blows against the area rule's `
    + `${archSpread}, with ${ctrlBlows.filter((b) => b < 0).length} width(s) never firing at all. `
    + 'The instrument can express "the threshold moved"; the shipped rule simply does not move.')
  : fail('CONTROL — a fraction-of-face threshold DOES move with the width, so the probe can see it',
    `the refused rule gives spread ${ctrlSpread}, i.e. this file cannot tell the two rules apart `
    + 'and its headline PASS is vacuous. Fix the control before reading anything above.');

/**
 * 🎯 **THE SECOND HALF OF HAZARD 2: DOES THE CONNECTED HANGING REGION BECOME THE WHOLE WALL?**
 * A sagging region is still solid and still on `pathPortals`, but it is the unit beat 3 pays out
 * in bites of `COLLAPSE.bite` = 1.40 m². If a slab lets one region grow to cover the face, one
 * committed pull is a storey and John's *"bit by bit"* is undone at scale.
 */
const bigSag = runs.filter((r) => r.w >= 11).map((r) => r.peakSagFrac);
(Math.max(...bigSag) <= 0.60 && huge.biggestArea <= COLLAPSE.bite * 1.25)
  ? pass('ONE BITE IS STILL ONE BITE — a slab does not turn a region into a storey',
    `peak sagging material on the ≥11 m faces is ${bigSag.map((x) => `${f1(100 * x)}%`).join(' / ')} `
    + `of the face, and the biggest single event on the 85.90 m slab is ${huge.biggest} cells `
    + `= ${f2(huge.biggestArea)} m² against the ${COLLAPSE.bite} m² bite. The sag caps the event; `
    + 'the width does not reach past it.')
  : fail('ONE BITE IS STILL ONE BITE — a slab does not turn a region into a storey',
    `peak sagging ${bigSag.map((x) => f1(100 * x)).join('/')}%, biggest event on 85.90 m `
    + `${f2(huge.biggestArea)} m² against a ${COLLAPSE.bite} m² bite.`);

/**
 * ⏱️ **THE PER-FRAME COST, AND A CORRECTION TO THE HAZARD AS IT IS WRITTEN DOWN.** The brief for
 * this spike says *"the damage grid is a per-face texture uploaded once per frame"*. The code says
 * otherwise and it matters: `flush()`'s first line is `if (!this.dirty) return false`, so a face
 * that took no hit this frame costs **nothing at all** — no upload, no `_smooth`, no `_shed`, no
 * `_strain`. At a 0.95 s swing that is one paid frame in ~57. **So a slab's grid cost is a
 * per-BLOW hitch on one face, not a per-frame tax on the house**, and the number to judge is the
 * spike on the blow frame against the 2.00 ms CPU budget `walls-perf.md` records.
 *
 * ⚠️ Node against a browser is not a like-for-like clock and these are REPORTED, never asserted.
 * The exact quantity is the cell count; ms/1000 cells is printed so the ratio can be re-derived.
 */
note('');
note('  ⏱️ WALL CLOCK — REPORTED, NEVER ASSERTED ON (load-dependent; the cells are not). Node, not a browser.');
note('     ⚠️ flush() early-outs on !dirty, so this is the cost of a BLOW FRAME, ~1 frame in 57 at a 0.95 s swing.');
note('     width      cells   applyHit med/worst      flush med/worst     blow-frame total    ms / 1000 cells');
for (const r of runs) {
  const tot = r.hitMedMs + r.flushMedMs;
  note(`     ${f2(r.w).padStart(6)} m ${String(r.cells).padStart(7)}   `
    + `${f3(r.hitMedMs).padStart(6)} / ${f3(r.hitMaxMs).padStart(6)} ms   `
    + `${f3(r.flushMedMs).padStart(6)} / ${f3(r.flushMaxMs).padStart(6)} ms   `
    + `${f3(tot).padStart(10)} ms   ${f3(1000 * tot / r.cells).padStart(10)}`);
}
note('     budget for scale: walls-perf.md records cpu ≤ 2.00 ms, gpu ≤ 1.389 ms per FRAME.');

/**
 * 🏠 **AND THE WHOLE-HOUSE FORM, WHICH IS THE ONE THAT DECIDES THE ROLLOUT.** `genspike-1`, 512
 * seeds: shared internal wall **288.21 m**, of which **266.48 m** diggable, emitted as **46.02 dig
 * spans** → 92 free-face panels. Slabbed, the same house is one face per boundary per side, and
 * the boundary count follows from the mean: 266.48 / 13.82 ≈ 19.3 diggable boundaries.
 */
head('  the whole generated house, both ways — TOTAL grid is nearly conserved; GRANULARITY is not');
const HOUSE = { internal: 288.21, diggable: 266.48, spans: 46.02, meanBoundary: 13.82 };
const cellsFor = (metres) => Math.round(metres / CELL) * even(DIG_H / CELL);
const tiledHouse = cellsFor(HOUSE.diggable * 2);
const slabHouse = cellsFor(HOUSE.internal * 2);
note(`  tiled   ${(HOUSE.spans * 2).toFixed(0).padStart(4)} faces of mean ${f2(HOUSE.diggable / HOUSE.spans)} m`
  + `   ${String(tiledHouse).padStart(7)} cells   ${kb(tiledHouse * (BYTES_TEX + BYTES_CPU))} resident`);
note(`  slab    ${(HOUSE.diggable / HOUSE.meanBoundary * 2).toFixed(0).padStart(4)} faces of mean ${f2(HOUSE.meanBoundary)} m`
  + `   ${String(slabHouse).padStart(7)} cells   ${kb(slabHouse * (BYTES_TEX + BYTES_CPU))} resident`);
note(`  Δ total cells ${((slabHouse / tiledHouse - 1) * 100).toFixed(1)}% — because a slab covers the`);
note('  non-diggable metres too (doors, slivers), and NOTHING ELSE. Total grid ≈ wall area / cell², which');
note('  the floor plan fixes. 🎯 **What a slab multiplies is the WORST SINGLE FACE, and that is the term');
note('  every per-blow cost above is linear in: 1800 cells at 5.72 m → 27420 at 85.90 m, a 15.2× hitch.**');

// =============================================================================================
head('═══ C — THE SEARCH (hazard 6: the probe model and IC_W sit on SPANS) ═══');
// =============================================================================================

/**
 * `digcover-1`'s model, quoted rather than re-derived: a probe costs ~6.2 blows, `N` is probe spots
 * (`round(span / PROBE_STEP)` per face), **`K` is winners and `chooseFreeInterconnect` puts exactly
 * ONE region on EVERY edge**, expected duds `= (N − K) / (K + 1)`, FIND `= duds × 6.2` blows.
 */
const PROBE_STEP = 1.5, PROBE_BLOWS = 6.2;
const searchFor = (edges, spaceId) => {
  const faces = freePanels(edges).filter((p) => p.a === spaceId || p.b === spaceId);
  const byEdge = new Map();
  for (const p of faces) {
    if (!byEdge.has(p.edge)) byEdge.set(p.edge, []);
    byEdge.get(p.edge).push(p);
  }
  // one face per side per span: the room only ever sees the faces whose owning room is `spaceId`
  const mine = faces.filter((p) => p.a === spaceId);
  const N = mine.reduce((n, p) => n + Math.round(p.w / PROBE_STEP), 0);
  const K = new Set(mine.map((p) => p.edge)).size;
  const duds = (N - K) / (K + 1);
  return { faces: mine.length, metres: mine.reduce((m, p) => m + p.w, 0), N, K, duds,
    findBlows: duds * PROBE_BLOWS, edges: new Set(mine.map((p) => p.edge)).size };
};

note('  the SERVICE passage, whose two walls the flag changes (its other edges are unchanged):');
note('  arm     faces   dig metres    probe spots N   winners K   expected duds   FIND (blows)');
for (const [name, edges] of [['tiled', DIG_EDGES], ['slab', SLAB_EDGES]]) {
  const s = searchFor(edges, 'service');
  note(`  ${name.padEnd(6)}  ${String(s.faces).padStart(5)}   ${f2(s.metres).padStart(9)}   `
    + `${String(s.N).padStart(13)}   ${String(s.K).padStart(9)}   ${f2(s.duds).padStart(13)}   ${f1(s.findBlows).padStart(12)}`);
}

const sTiled = searchFor(DIG_EDGES, 'service');
const sSlab = searchFor(SLAB_EDGES, 'service');

note('');
note(`  IC_W is ${IC_W} m of a face. As a share of the face it lands on:`);
for (const [name, edges] of [['tiled', DIG_EDGES], ['slab', SLAB_EDGES]]) {
  const ws = [...new Set(freePanels(edges).filter((p) => p.edge === 'svc_w').map((p) => p.w))];
  note(`     ${name.padEnd(6)} ${ws.map((w) => `${f2(w)} m → ${f1(100 * IC_W / w)}%`).join(' · ')}`);
}

/**
 * 🎯 **THE SEARCH SURVIVES AS A SEARCH, AND THE DIRECTION IS THE SURPRISE.** `digcover-1`'s rule —
 * *"an extra edge makes a room FASTER, not slower; the knob is wall-per-edge"* — is a statement
 * about EDGES, and a slab does not change how many edges a room has. What it changes is `N`: the
 * 4.16 m of connector on each wall becomes diggable wall, so the room gains probe spots without
 * gaining winners, and `(N − K) / (K + 1)` goes UP. The slab makes the service passage SLOWER to
 * dig out of, by the same rule, for the same reason.
 */
(sSlab.K === sTiled.K && sSlab.duds > sTiled.duds && sSlab.N > sTiled.N)
  ? pass('THE SEARCH IS STILL A SEARCH, AND THE SLAB MAKES IT LONGER, NOT SHORTER',
    `winners K unchanged at ${sSlab.K} (one region per EDGE, and a slab does not change how many `
    + `edges a room has), probe spots N ${sTiled.N} → ${sSlab.N} because the two doorways became `
    + `diggable wall, so expected duds ${f2(sTiled.duds)} → ${f2(sSlab.duds)} and FIND `
    + `${f1(sTiled.findBlows)} → ${f1(sSlab.findBlows)} blows. digcover-1's "the knob is `
    + 'wall-per-EDGE" is intact — a slab is purely more wall on the same edge.')
  : fail('THE SEARCH IS STILL A SEARCH, AND THE SLAB MAKES IT LONGER, NOT SHORTER',
    `K ${sTiled.K}→${sSlab.K}, N ${sTiled.N}→${sSlab.N}, duds ${f2(sTiled.duds)}→${f2(sSlab.duds)}`);

/**
 * 🚨 **THE CONTROL FOR C, AND IT IS THE PART OF THE PICKER THAT A SLAB MAKES VACUOUS.**
 * `chooseFreeInterconnect` weights its face pick by span length *"so a long wall is proportionally
 * more likely to hold the answer than a short one"*. On a slab an edge has exactly ONE face, so
 * the weighting has nothing to choose between and the salt draw is spent on a foregone conclusion.
 * The control is the tiled arm: it MUST show the pick actually moving between faces across seeds,
 * or "the weighting became vacuous" is not a claim this file is entitled to make.
 */
const SEEDS = ['s4', 'search-b', 'search-c', 's1', 's7', 'slab-a', 'slab-b', 'slab-c'];
const picksFor = (edges) => {
  const seen = new Set();
  /**
   * ⚠️ **PER-ROOM KEYING SINCE 2026-08-12 — and the obvious repair changed what this measures.**
   * `.get('svc_w')` was an EDGE id and is now undefined. Taking every region instead made the
   * slab arm report **10 distinct faces where the check requires exactly 1**, which looked like a
   * finding and was an artefact of the probe: it was counting one region per ROOM across the whole
   * house rather than the picks for ONE WALL across seeds. This check is about whether the
   * span-length weighting has anything to choose between **on a single wall**, so the region set
   * is filtered back to that wall's own faces.
   */
  const wall = edges.find((e) => e.id === 'svc_w') ?? edges[0];
  const mine = new Set(freePanels([wall]).map((p) => p.id));
  for (const s of SEEDS) {
    for (const r of chooseFreeInterconnect(s, edges).values()) if (mine.has(r.panel)) seen.add(r.panel);
  }
  return seen;
};
const pTiled = picksFor(DIG_EDGES), pSlab = picksFor(SLAB_EDGES);
note('');
note(`  which face carries the answer on svc_w, over ${SEEDS.length} seeds:`);
note(`     tiled → ${[...pTiled].join(', ')}`);
note(`     slab  → ${[...pSlab].join(', ')}`);
(pTiled.size > 1 && pSlab.size === 1)
  ? pass('CONTROL + FINDING — the span-length weighting is real on the tiled arm and VACUOUS on a slab',
    `the tiled arm's picker lands on ${pTiled.size} different faces over ${SEEDS.length} seeds `
    + `(so the weighting is a live mechanism this file can observe), and the slab arm lands on `
    + `${pSlab.size} — there is only one face to choose. The seed still moves the region's `
    + 'POSITION `u` along the wall; what it stops choosing is WHICH wall. On a slab the answer is '
    + 'a coordinate, not a coordinate plus a face.')
  : fail('CONTROL + FINDING — the span-length weighting is real on the tiled arm and VACUOUS on a slab',
    `tiled picks ${pTiled.size} distinct faces (needs >1 for the control to mean anything), slab `
    + `picks ${pSlab.size} (needs exactly 1).`);

// =============================================================================================
head('═══ D — THE IDS, AND WHAT MOVES (hazard 1) ═══');
// =============================================================================================

const idsOf = (edges) => freePanels(edges).filter((p) => SVC.has(p.edge)).map((p) => p.id);
const idT = idsOf(DIG_EDGES), idS = idsOf(SLAB_EDGES);
note(`  tiled  ${idT.join(' ')}`);
note(`  slab   ${idS.join(' ')}`);
const kept = idS.filter((i) => idT.includes(i));
note(`  ⚠️ ${kept.length} id(s) SURVIVE THE CHANGE AND MEAN SOMETHING ELSE: ${kept.join(' ')}`);
note(`     — ${f2(freePanels(DIG_EDGES).find((p) => p.id === 'f.svc_w.0.a').w)} m on the tiled arm, `
  + `${f2(freePanels(SLAB_EDGES).find((p) => p.id === 'f.svc_w.0.a').w)} m on the slab arm.`);

/**
 * ✅ **THE ONE PROPERTY THAT HAD TO SURVIVE: NO RECORDED SEED MOVES, ON EITHER ARM.**
 * `run.js` `chooseExit()` derives the live exit from `EXIT_SITES = PANELS.filter(isExitSite)`, so
 * the question is not "did `PANELS` change" but "did the EXIT POOL change". The slab arm drops
 * four `BREACHABLE` rows; every one of them is filtered out of the pool anyway.
 */
const DROPPED = ['p.svc_w.n', 'p.svc_w.s', 'p.svc_e.n', 'p.svc_e.s'];
const authoredPool = PANELS.filter(isExitSite).map((p) => p.id);
const slabPool = PANELS.filter((p) => !DROPPED.includes(p.id)).filter(isExitSite).map((p) => p.id);
const droppedAreExits = DROPPED.filter((id) => isExitSite(PANELS.find((p) => p.id === id) ?? {}));
(authoredPool.length === slabPool.length
  && authoredPool.every((id, i) => id === slabPool[i])
  && droppedAreExits.length === 0)
  ? pass('NO SEED MOVES ON EITHER ARM — the exit pool is element-for-element identical',
    `${authoredPool.length} exit sites, same ids in the same order with the four p.svc_* rows `
    + 'present and absent. None of the four is an exit site, so chooseExit(seed, sites) cannot '
    + 'observe the flag and every seed quoted in every document still means what it said.')
  : fail('NO SEED MOVES ON EITHER ARM — the exit pool is element-for-element identical',
    `pool ${authoredPool.length} → ${slabPool.length}; dropped-but-exit: ${droppedAreExits.join(',') || 'none'}`);

/**
 * 🚨 **CONTROL FOR D. If dropping a row that IS an exit site does not move the pool, the check
 * above is not reading the pool at all.** The floor it must clear: the pool must shrink by one.
 */
const anExit = PANELS.find(isExitSite).id;
const brokenPool = PANELS.filter((p) => p.id !== anExit).filter(isExitSite).map((p) => p.id);
(brokenPool.length === authoredPool.length - 1)
  ? pass('CONTROL — the pool check CAN see a row leaving',
    `dropping ${anExit} (an EXIT row) takes the pool ${authoredPool.length} → ${brokenPool.length}, `
    + 'so the identity above is a measurement and not a tautology.')
  : fail('CONTROL — the pool check CAN see a row leaving',
    `dropping the exit row ${anExit} left the pool at ${brokenPool.length} of ${authoredPool.length}`);

// =============================================================================================
head('═══ E — APERTURE GROUPS (hazard 4: wallinstances.js groups by WIDTH) ═══');
// =============================================================================================

const groupsOf = (edges) => new Set(freePanels(edges)
  .map((p) => `${p.w.toFixed(4)}x${DIG_H.toFixed(4)}x${p.t.toFixed(4)}`));
const gT = groupsOf(DIG_EDGES), gS = groupsOf(SLAB_EDGES);
note(`  tiled  ${gT.size} free-face aperture groups: ${[...gT].join('  ')}`);
note(`  slab   ${gS.size} free-face aperture groups: ${[...gS].join('  ')}`);
note(`  Δ = ${gS.size - gT.size} group(s) → ${2 * (gS.size - gT.size)} more InstancedMesh(es), i.e. AT MOST `
  + `${2 * (gS.size - gT.size)} more draw calls, and only where a face of that width is on screen and pristine.`);
note('  ⚠️ The three authored widths SURVIVE on the slab arm because five other edges still use them —');
note('     a rollout that slabbed EVERY edge would replace three shared groups with one group PER');
note('     DISTINCT WALL LENGTH, which on a generated house is ~one per boundary. That is the real bill.');

// =============================================================================================
console.log(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
