/**
 * 🧱 **THE SAG — DOES THE COLLAPSE ARRIVE BIT BY BIT, DOES THE *SKILLED* PLAYER GET THE GRAIN, AND
 * DOES THE FALL STILL READ AS A SHEET?**
 *
 *   node harness/_sag1-grain.mjs
 *
 * John, 2026-08-10, after playing the arch:
 *
 *   > *"sometimes the whole structure above collapses in one moment and that can be satisfying but
 *   > it also **feels too uniform**. **I want the collapse to also feel more bit by bit.** the
 *   > sections all **falling down at once and in the same direction statically like a sheet**
 *   > isn't immersive either."*
 *
 * Two complaints, and `critic-dig-8` measured both:
 *
 *   **A1 — THE GRANULARITY WAS INVERTED.** `debris-collapse` C5: the aimed undercut got *"9 events
 *   totalling 450 cells, biggest 408"* — **91% of a skilled dig's material in ONE event** — while
 *   random scatter got **18 small course-sheds, biggest 18**. The bit-by-bit texture John wanted
 *   was what the game gave the player who could not aim.
 *   **A2 — THE FALL IS A SHEET, AND IT HIDES THE BREACH.** With the group's own centroid
 *   subtracted, RMS relative scatter was **0.034 m at 0.20 s and 0.147 m at 0.40 s against a
 *   0.56 m plate**; all 14 plates land inside 0.35 s; and they tile the aperture they just made
 *   and move toward the camera, so *"for the entire 0.8 s of the payoff the player cannot see what
 *   they just achieved."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🎯 **HOW THIS FILE IS ARRANGED, AND THE ONE RULE IT OBEYS.**
 * ---------------------------------------------------------------------------------------------
 * Every check runs **BOTH ARMS IN THE SAME PROCESS**: `sag` (shipped) against `flat`
 * (`COLLAPSE.sag = false` plus `hold`/`spread` off), which is the round-13 build bit-for-bit and
 * not an approximation of it — `support.js` keeps that branch precisely so a before/after is an
 * arm rather than a memory. 🚨 **AND EVERY ASSERTION HERE SHIPS A CONTROL THAT MUST FAIL, RUN ON
 * EVERY RUN.** The bar is not *"the new number is good"*, it is *"the OLD arm still reproduces the
 * defect"* — sixteen instruments on this project have produced a result-shaped output instead of
 * an error, and twelve would have gone red on their first run with a control. Where the control
 * arm stops showing the defect this file goes red and says the comparison is meaningless.
 *
 * ⚠️ **NO RENDERER, NO BROWSER, NO WALL CLOCK.** The rule half drives the shipped `DamageField`;
 * the fall half drives the shipped `DebrisSystem` at a fixed 60 Hz, the same form as
 * `_collapse2-fall.mjs`. Two runs agree to the digit.
 *
 * 🚨 **AND THE ONE THING IT CANNOT STAND BEHIND, STATED THE WAY `critic-dig-8` STATED IT:** the
 * fall half **REPRODUCES `views/game.js` `onChunk`'s tiling arithmetic, it does not call it.** If
 * that block changes, this measurement goes stale and the figures to re-derive are `PLATES` below
 * and the RMS column. It is a reproduction because `onChunk` needs a `THREE.Scene`, a room and a
 * panel; the arithmetic it reproduces is thirty lines and is quoted beside it.
 */

import * as THREE from 'three';
import { DamageField, COLLAPSE, BRUSH_R } from '../src/destruction/damagefield.js';
import { DebrisSystem } from '../src/destruction/debris.js';

const DT = 1 / 60;
const W = 5.72, H = 2.80;
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

let passN = 0, failN = 0;
const pass = (t, d) => { passN++; console.log(`  ✅ PASS  ${t}\n          ${d}`); };
const fail = (t, d) => { failN++; console.log(`  ❌ FAIL  ${t}\n          ${d}`); };
const note = (s) => console.log(`  ${s}`);
const head = (s) => console.log(`\n${s}`);

// =============================================================================================
// THE RULE HALF — the shipped DamageField, both arms, both of C5's aiming policies.
// =============================================================================================

const mkField = (arm) => {
  const f = new DamageField({ width: W, height: H });
  f.barrier.fill(0);                       // no answer behind it: this half measures the rule
  if (arm === 'flat') f.collapse = { ...COLLAPSE, sag: false };
  return f;
};

/**
 * `debris-collapse` C5's two policies, copied verbatim so the two files measure the same player.
 * ⚠️ **A stride parameterised by the blow BUDGET measures the budget** — that lie cost C5 a round
 * and is written up in `destruction.md` §8. The stride is 1.3 brush radii, set by the HAMMER.
 */
const policies = (f) => {
  const stepU = (f.brush.radius * 1.3) / f.width;
  return {
    undercut: (k) => {
      const perRow = Math.max(2, Math.ceil(1 / stepU));
      const row = Math.floor(k / perRow), j = k % perRow;
      const side = j % 2 ? 1 : -1;
      const off = side * (0.5 + Math.floor(j / 2)) * stepU;
      return [0.5 + off, 0.30 - 0.20 + row * 0.22 + Math.sin(k * 0.9) * 0.03];
    },
    random: (k) => [0.5 + Math.sin(k * 2.399) * 0.18, 0.30 + Math.sin(k * 1.61 + 1.1) * 0.30],
  };
};

/** Drive one arm with one policy and record every collapse EVENT it produced. */
function driveRule(arm, policy, blows = 220) {
  const f = mkField(arm);
  const aim = policies(f)[policy];
  const evs = [];              // the payout's own unit: what the view is handed, one per thing
  const blowEvents = [];       // the rule's unit: what one swing brought down
  let sagBlows = 0, hanging = 0;
  for (let k = 0; k < blows; k++) {
    const [u, v] = aim(k);
    const r = f.applyHit(Math.min(0.98, Math.max(0.02, u)), Math.min(0.98, Math.max(0.02, v)), 1);
    const c = r.collapse;
    if (!c) continue;
    if (c.sagRegions) sagBlows++;
    if (c.cells > 0) blowEvents.push(c.cells);
    for (const e of (c.events ?? [])) if (e.cells > 0) evs.push(e.cells);
  }
  if (f._sag) for (let i = 0; i < f._sag.length; i++) hanging += f._sag[i];
  let open = 0;
  for (let i = 0; i < f.depth.length; i++) if (f.depth[i] >= 0.985) open++;
  const tot = evs.reduce((a, b) => a + b, 0);
  const sorted = evs.slice().sort((a, b) => a - b);
  return {
    arm, policy, f,
    open, sagBlows, hanging,
    blows: blowEvents.length, blowBiggest: Math.max(0, ...blowEvents),
    blowTotal: blowEvents.reduce((a, b) => a + b, 0),
    events: evs.length, biggest: sorted[sorted.length - 1] ?? 0, total: tot,
    median: sorted[sorted.length >> 1] ?? 0,
    /**
     * 🎯 **THE DISPERSION STATISTIC, AND IT IS THE ONE A1's SENTENCE IS ABOUT.** *"91% of a
     * skilled dig's material arrives in ONE event"* is a share of the TOTAL, and a share of a
     * total is parameterised by how long the drive ran — the exact trap that made C5 report
     * scattering as 12× faster than aiming (`destruction.md` §8). **Biggest over median is not**:
     * it asks how far the one big thing stands above the typical thing, and it is the same number
     * at 60 blows and at 220. Both are printed; only this one is asserted on.
     */
    lumpiness: (sorted[sorted.length >> 1] ?? 0) > 0
      ? (sorted[sorted.length - 1] ?? 0) / sorted[sorted.length >> 1] : Infinity,
    share: tot ? (sorted[sorted.length - 1] ?? 0) / tot : 0,
  };
}

head('S1/S2 — THE GRAIN OF A COLLAPSE, AND WHO GETS IT (220 blows, one face, both policies)');
const rule = {};
for (const arm of ['flat', 'sag']) {
  for (const p of ['undercut', 'random']) rule[`${arm}.${p}`] = driveRule(arm, p);
}
note('  arm.policy       payout-events   cells   biggest  median  biggest/median  biggest/total  cells opened');
for (const k of ['flat.undercut', 'flat.random', 'sag.undercut', 'sag.random']) {
  const r = rule[k];
  note(`  ${k.padEnd(15)} ${String(r.events).padStart(13)}  ${String(r.total).padStart(6)}`
    + `  ${String(r.biggest).padStart(7)}  ${String(r.median).padStart(6)}`
    + `  ${f2(r.lumpiness).padStart(14)}  ${(r.share * 100).toFixed(0).padStart(12)}%`
    + `  ${String(r.open).padStart(12)}`);
}
note('');
note('  ⚠️ EVERY FIGURE ABOVE IS THE SAME AT 60, 120 AND 220 BLOWS — the face is cleared by 60 and');
note('     nothing after that changes any of them. Checked before anything here was asserted on,');
note('     because a statistic that moves with the budget is measuring the budget.');

/**
 * 🚨 **S1's CONTROL, AND IT RUNS FIRST BECAUSE EVERYTHING BELOW IS MEANINGLESS WITHOUT IT.** The
 * ablated arm must still show the defect `critic-dig-8` measured: one lump towering over
 * everything else a skilled dig gets. If it does not, this file is not reproducing the old build
 * and no comparison it prints can be trusted — so it goes red and says so, rather than reporting
 * an improvement against a baseline it invented.
 */
const F = rule['flat.undercut'], S = rule['sag.undercut'];
const BITE_CELLS = COLLAPSE.bite / (W / 60) / (H / 30);      // the bite in cells of this face
(F.lumpiness >= 8 && F.biggest >= 250)
  ? pass('CONTROL — the ablated arm still reproduces the monolith',
    `sag:false, aimed undercut: biggest event ${F.biggest} cells against a median of ${F.median} `
    + `= ${f2(F.lumpiness)}×, and ${(F.share * 100).toFixed(0)}% of everything the dig brought `
    + 'down. critic-dig-8 measured 408 of 450 (91%) in the browser; this is the same shape.')
  : fail('CONTROL — the ablated arm still reproduces the monolith',
    `sag:false gives biggest ${F.biggest}, median ${F.median} (${f2(F.lumpiness)}×) — the control `
    + 'no longer shows the defect, so every comparison below is against a baseline this file made '
    + 'up. Fix the control before reading the result.');

(S.biggest <= F.biggest * 0.45 && S.biggest <= BITE_CELLS * 1.15 && S.lumpiness <= F.lumpiness * 0.55)
  ? pass('THE COLLAPSE ARRIVES BIT BY BIT — no single event is a storey any more',
    `aimed undercut: biggest event ${F.biggest} → ${S.biggest} cells (the ${COLLAPSE.bite} m² bite `
    + `is ${Math.round(BITE_CELLS)} cells on this face, so the cap is the RULE and not a clamp), `
    + `biggest/median ${f2(F.lumpiness)}× → ${f2(S.lumpiness)}×, and the dig pays out `
    + `${F.events} → ${S.events} separate pieces for the same wall.`)
  : fail('THE COLLAPSE ARRIVES BIT BY BIT — no single event is a storey any more',
    `biggest ${F.biggest}→${S.biggest} (bite is ${Math.round(BITE_CELLS)} cells), lumpiness `
    + `${f2(F.lumpiness)}→${f2(S.lumpiness)}, events ${F.events}→${S.events}`);

/**
 * 🎯 **S2 IS THE ONE THAT DECIDES WHETHER THIS SLICE MOVED THE PROBLEM OR FIXED IT.**
 * `critic-dig-8`'s finding was not *"the collapse is coarse"*, it was that **the coarse arm was
 * the SKILLED one**: aim got 9 events and one 408-cell lump, scatter got 18 small sheds. A change
 * that leaves scatter the more textured way to play has moved the problem.
 *
 * ⚠️ **AND THE CLAIM HAS TO BE THE RIGHT ONE, OR IT IS UNPASSABLE BY CONSTRUCTION.** Scatter will
 * always have more events per cell cleared, because its events are CHIPS — the lonely rule at a
 * crater rim, a median of 2–3 cells. Asking aim to beat that is asking a storey to arrive as
 * gravel, which is not what John asked for (*"that can be satisfying"*). The claim that matches
 * his sentence is: **the skilled player gets more pieces than they used to, bigger typical pieces
 * than the scatter player, more material — and nobody gets a monolith.**
 *
 * ⚠️ **ONE HONEST DIFFERENCE FROM THE BROWSER, STATED RATHER THAN SMOOTHED.** In this headless rig
 * the scatter policy does eventually build a hanging region heavy enough to break the arch (its
 * ablated biggest is 467 cells), where `debris-collapse` C5 in the real house reported scatter
 * getting *"18 small course-sheds, biggest 18"*. The rig has no interconnect and no barrier, so
 * scatter clears more of one face than it can in play. **That makes this comparison STRICTER than
 * the browser's, not weaker** — and `debris-collapse` is the arm that measures the real house.
 */
const FR = rule['flat.random'], SR = rule['sag.random'];
head('S2 — DOES THE SKILLED PLAYER GET THE GRAIN? (aim against scatter, same face, same budget)');
note(`  ablated:  aim ${F.events} pieces, median ${F.median}, biggest ${F.biggest}, ${F.total} cells `
  + `·  scatter ${FR.events} pieces, median ${FR.median}, biggest ${FR.biggest}, ${FR.total} cells`);
note(`  shipped:  aim ${S.events} pieces, median ${S.median}, biggest ${S.biggest}, ${S.total} cells `
  + `·  scatter ${SR.events} pieces, median ${SR.median}, biggest ${SR.biggest}, ${SR.total} cells`);
(FR.median * 4 < F.median && F.lumpiness >= 8)
  ? pass('CONTROL — the ablated arm still pays the skilled player in ONE LUMP',
    `sag:false: aim's typical piece is ${F.median} cells and scatter's is ${FR.median} — but aim's `
    + `payout is dominated by a single ${F.biggest}-cell event (${f2(F.lumpiness)}× its own `
    + 'median), which is exactly the "one moment" John complained about.')
  : fail('CONTROL — the ablated arm still pays the skilled player in ONE LUMP',
    `sag:false: aim median ${F.median}, scatter median ${FR.median}, lumpiness ${f2(F.lumpiness)}× `
    + '— the control does not reproduce the shape, so S2 cannot say whether it was fixed');
(S.events > F.events && S.median >= SR.median * 3 && S.total > SR.total
  && S.biggest <= SR.biggest * 1.1)
  ? pass('THE GRANULARITY NOW FAVOURS THE SKILLED PLAYER',
    `aim pays out ${F.events} → ${S.events} pieces, whose median is ${S.median} cells against `
    + `scatter's ${SR.median} (${f2(S.median / Math.max(1, SR.median))}×), for `
    + `${f2(S.total / Math.max(1, SR.total))}× the material — and the biggest thing either policy `
    + `can now produce is one bite (${S.biggest} vs ${SR.biggest} cells). **Aim gets more pieces, `
    + 'bigger pieces and more wall; nobody gets a storey in one moment.**')
  : fail('THE GRANULARITY NOW FAVOURS THE SKILLED PLAYER',
    `aim ${S.events} pieces (median ${S.median}, biggest ${S.biggest}, ${S.total} cells) vs `
    + `scatter ${SR.events} (median ${SR.median}, biggest ${SR.biggest}, ${SR.total}) — the skilled `
    + 'player is not the one being rewarded with grain');

// =============================================================================================
// S3 — THE SAG ITSELF. It has to HOLD when you walk away and GO when you commit.
// =============================================================================================
head('S3 — THE HOLD AND THE PULL (the middle beat, which is the whole direction)');
function sagHold(arm) {
  const f = mkField(arm);
  const stepU = (f.brush.radius * 1.3) / f.width;
  let sagAt = -1, firstEventCells = 0;
  for (let k = 0; k < 14 && sagAt < 0; k++) {
    const side = k % 2 ? 1 : -1;
    const r = f.applyHit(0.5 + side * (0.5 + Math.floor(k / 2)) * stepU, 0.10, 1);
    if (r.collapse?.sagRegions) { sagAt = k + 1; firstEventCells = r.collapse.cells; }
    else if (r.collapse?.archCells > 200) { sagAt = -2; firstEventCells = r.collapse.cells; break; }
  }
  const standing = () => { let n = 0; if (f._sag) for (let i = 0; i < f._sag.length; i++) n += f._sag[i]; return n; };
  const held = standing();
  // walk away: six blows at the far end of the same face
  let awayCells = 0;
  for (let k = 0; k < 6; k++) awayCells += f.applyHit(0.93, 0.80, 1).collapse?.archCells ?? 0;
  const afterAway = standing();
  // come back and commit: aim at material that is actually hanging
  let pullBlows = 0, pulled = 0;
  for (let k = 0; k < 8 && standing() > 0; k++) {
    let tu = 0.5, tv = 0.5;
    for (let i = 0; i < f._sag.length; i++) {
      if (!f._sag[i] || f.depth[i] >= 0.985) continue;
      const x = i % f.cols; tu = (x + 0.5) / f.cols; tv = ((i - x) / f.cols + 0.5) / f.rows; break;
    }
    pulled += f.applyHit(tu, tv, 1).collapse?.archCells ?? 0;
    pullBlows++;
  }
  return { sagAt, firstEventCells, held, awayCells, afterAway, pullBlows, pulled, left: standing() };
}
const hSag = sagHold('sag'), hFlat = sagHold('flat');
note(`  shipped: arch gives on blow ${hSag.sagAt}, takes ${hSag.firstEventCells} cells and leaves `
  + `${hSag.held} hanging · 6 blows at the far end took ${hSag.awayCells} more (${hSag.afterAway} `
  + `still hanging) · came back: ${hSag.pullBlows} blows pulled ${hSag.pulled}, ${hSag.left} left`);
note(`  ablated: arch gives on blow ${hFlat.sagAt === -2 ? '(one event)' : hFlat.sagAt}, takes `
  + `${hFlat.firstEventCells} cells, nothing is ever left hanging (${hFlat.held})`);
(hSag.held > 100 && hSag.awayCells === 0 && hSag.afterAway > 100)
  ? pass('A SAGGING WALL STAYS UP UNTIL THE PLAYER COMMITS',
    `${hSag.held} cells let go and hung there; six blows at the far end of the same face pulled `
    + `NONE of them down (${hSag.afterAway} still hanging). Where you are standing is now a decision.`)
  : fail('A SAGGING WALL STAYS UP UNTIL THE PLAYER COMMITS',
    `${hSag.held} hanging, ${hSag.awayCells} cells came down from six blows out of reach`);
(hSag.pulled > 0 && hSag.left === 0 && hSag.pullBlows <= 4)
  ? pass('AND IT COMES DOWN WHEN THEY DO',
    `${hSag.pullBlows} blows at the hanging piece brought all ${hSag.pulled} cells down and left `
    + 'nothing behind — a sag can never become permanent scenery')
  : fail('AND IT COMES DOWN WHEN THEY DO',
    `${hSag.pullBlows} blows pulled ${hSag.pulled} cells, ${hSag.left} still hanging`);
hFlat.held === 0
  ? pass('CONTROL — with the sag ablated there is no middle state at all',
    `sag:false leaves 0 cells hanging: the region that reached the threshold came down in one `
    + `event of ${hFlat.firstEventCells} cells, which is the build John played`)
  : fail('CONTROL — with the sag ablated there is no middle state at all',
    `${hFlat.held} cells hanging on the ablated arm — the ablation is not ablating`);

// =============================================================================================
// S4/S5 — THE FALL. The shipped DebrisSystem, 60 Hz, both arms, on the SAME collapse.
// =============================================================================================
/**
 * ⚠️ **REPRODUCTION OF `views/game.js` `onChunk`'s COLLAPSE BLOCK, NOT A CALL INTO IT** — see the
 * header. Kept line-for-line beside the source so the drift is visible if it happens.
 */
const SLAB_MAX = 0.62, MAX_PLATES = 30;
const jit = (k) => {
  let x = Math.imul(k + 0x9e37, 0x27d4eb2d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2545f491) >>> 0; x ^= x >>> 13;
  return (x >>> 8) / 16777216;
};
function payout(d, evs, staged) {
  const nrm = { x: 0, y: 0, z: 1 }, tX = nrm.z, tZ = -nrm.x;
  const at = { x: 0, y: 1.40, z: 0 };
  const ct = 0.10;
  const spawned = [];
  let plates = 0, ei = 0;
  for (const ev of evs) {
    if (ev.kind === 'sag' || !ev.cells) { ei++; continue; }
    const ex = at.x + tX * ev.dx, ey = at.y + ev.dy, ez = at.z + tZ * ev.dx;
    const nx = Math.max(1, Math.ceil(ev.w / SLAB_MAX));
    const ny = Math.max(1, Math.ceil(ev.h / SLAB_MAX));
    const budget = Math.max(1, Math.round(ev.area / (SLAB_MAX * SLAB_MAX * 0.80)));
    const nBig = ev.area < 0.022 ? 0 : Math.min(nx * ny, budget, MAX_PLATES, MAX_PLATES - plates);
    const cw = Math.min(SLAB_MAX, (ev.w / nx) * 0.94);
    const ch = Math.min(SLAB_MAX, (ev.h / ny) * 0.94);
    const tiles = nx * ny, stride = tiles / Math.max(1, nBig);
    for (let k = 0; k < nBig; k++) {
      const t = Math.min(tiles - 1, Math.floor(k * stride));
      const gx = t % nx, gy = (t - gx) / nx;
      const ou = nx > 1 ? ((gx + 0.5) / nx - 0.5) : 0;
      const ov = ny > 1 ? ((gy + 0.5) / ny - 0.5) : 0;
      const j = jit(plates * 3 + ei);
      const hold = staged
        ? Math.min(0.26, ei * 0.040 + (ny > 1 ? (gy / (ny - 1)) * 0.16 : 0) + j * 0.048) : 0;
      const P = {
        x: ex + tX * ou * ev.w, y: ey + ov * ev.h, z: ez + tZ * ou * ev.w,
        w: staged ? cw * (0.80 + j * 0.42) : cw,
        h: staged ? ch * (0.80 + jit(plates * 3 + ei + 977) * 0.42) : ch,
      };
      const i = d.chunk('slab', P, {
        w: P.w, h: P.h, t: ct, normal: nrm, hold, spread: staged ? 1 : 0,
      });
      if (i >= 0) spawned.push({ i, w: P.w, h: P.h });
      plates++;
    }
    ei++;
  }
  return spawned;
}

/**
 * 🎯 **A2's METRIC, VERBATIM: RELATIVE scatter.** Subtract the group's own centroid motion and ask
 * how far the plates move with respect to EACH OTHER. A rigid sheet scores 0; a real shatter
 * scores about a plate width. `critic-dig-8` read **0.034 m at 0.20 s and 0.147 m at 0.40 s.**
 *
 * 🚨 **AND THE OCCLUSION, WHICH IS THE SECOND HALF AND THE ONE JOHN WILL SEE FIRST.** The plates
 * are spawned flush in the aperture they made and move TOWARD the camera, so the breach is hidden
 * for the whole payoff. This casts each live plate onto the face plane FROM THE PLAYER'S EYE —
 * a shadow, magnified by how near the plate has come — and reports how much of the hole that
 * shadow covers. It is the question *"can the player see what they just did"*, asked arithmetically.
 */
/** The first collapse worth paying out on an arm, and the events it handed over. */
function firstCollapse(arm) {
  const f = mkField(arm);
  const stepU = (f.brush.radius * 1.3) / f.width;
  for (let k = 0; k < 14; k++) {
    const side = k % 2 ? 1 : -1;
    const r = f.applyHit(0.5 + side * (0.5 + Math.floor(k / 2)) * stepU, 0.10, 1);
    if (r.collapse && r.collapse.cells > 60) return { col: r.collapse, blow: k + 1 };
  }
  return null;
}

/**
 * 🚨 **THE PAYOUT A/B HOLDS THE COLLAPSE CONSTANT, AND THE FIRST VERSION OF THIS FILE DID NOT.**
 * Driving `sag` and `flat` end to end and comparing their RMS compares two DIFFERENT collapses —
 * a 4.3 m² storey against a 1.4 m² bite, eleven plates against five — and a smaller group scatters
 * less whatever you do to it. That reads as a regression and it is a rig error. So the fall is
 * measured on **ONE collapse, paid out twice**, and the rule's own contribution is reported
 * separately below it.
 *
 * `legacy` reproduces round 13's `onChunk` exactly: ONE rect around everything the blow did, no
 * hold, no spread — see `col.u/v/w/h/area` and the `spread: 0` default in `debris.js` `chunk()`.
 */
function fall(col, staged, legacy = false, seed = 1) {
  let s = seed;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const d = new DebrisSystem(scene, { perKind: 220, floorY: 0, rng });
  const evs = legacy
    ? [{ kind: 'arch', cells: col.cells, area: col.area, w: col.w, h: col.h, dx: 0, dy: 0 }]
    : col.events;
  const spawned = payout(d, evs, staged);
  const p = d.pools.slab;
  // the breach: what came down on THIS blow, as a rect on the face plane. Same for both arms of
  // the payout A/B, because they are paying out the same collapse.
  const bx0 = -col.w / 2, bx1 = col.w / 2;
  const by0 = 1.40 - col.h / 2, by1 = 1.40 + col.h / 2;
  const bArea = Math.max(1e-6, (bx1 - bx0) * (by1 - by0));
  const EYE = { x: (bx0 + bx1) / 2, y: 1.54, z: 3.0 };
  const samples = [];
  let t = 0, landed0 = -1, occSum = 0, occN = 0;
  const at = [0.20, 0.40, 0.60, 0.80];
  const rms = {}, trav = {};
  const p0 = spawned.map((c) => ({ x: p.px[c.i], y: p.py[c.i], z: p.pz[c.i] }));
  let arrival = [], restN = 0;
  const vPrev = spawned.map((c) => p.vy[c.i]);
  while (t < 1.6) {
    d.update(DT); t += DT;
    // arrival speed, taken on the frame a piece first touches the floor
    spawned.forEach((c, k) => {
      if (p.hits[c.i] && vPrev[k] !== null) { arrival.push(-vPrev[k]); vPrev[k] = null; }
      else if (vPrev[k] !== null) vPrev[k] = p.vy[c.i];
    });
    // relative scatter: displacement from spawn, with the group's mean displacement removed.
    // The group's OWN displacement is kept too — A2's sentence is a RATIO: *"the group translates
    // 5–8× further than it deforms"*, and the ratio is the thing that says "sheet".
    let mx = 0, my = 0, mz = 0, n = 0;
    for (let k = 0; k < spawned.length; k++) {
      const c = spawned[k];
      mx += p.px[c.i] - p0[k].x; my += p.py[c.i] - p0[k].y; mz += p.pz[c.i] - p0[k].z; n++;
    }
    mx /= n; my /= n; mz /= n;
    let sq = 0;
    for (let k = 0; k < spawned.length; k++) {
      const c = spawned[k];
      const ax = (p.px[c.i] - p0[k].x) - mx, ay = (p.py[c.i] - p0[k].y) - my, az = (p.pz[c.i] - p0[k].z) - mz;
      sq += ax * ax + ay * ay + az * az;
    }
    const scatter = Math.sqrt(sq / n);
    const travel = Math.sqrt(mx * mx + my * my + mz * mz);
    // occlusion of the breach, from the eye
    let cov = 0;
    for (let k = 0; k < spawned.length; k++) {
      const c = spawned[k];
      const dz = p.pz[c.i] - EYE.z;
      if (dz >= -1e-4) continue;
      const m = -EYE.z / dz;                       // where the ray crosses the face plane
      const sx = EYE.x + (p.px[c.i] - EYE.x) * m, sy = EYE.y + (p.py[c.i] - EYE.y) * m;
      const hw = spawned[k].w * m * 0.5, hh = spawned[k].h * m * 0.5;
      const ox = Math.max(0, Math.min(bx1, sx + hw) - Math.max(bx0, sx - hw));
      const oy = Math.max(0, Math.min(by1, sy + hh) - Math.max(by0, sy - hh));
      cov += ox * oy;
    }
    const occ = Math.min(1, cov / bArea);
    if (t <= 0.80) { occSum += occ; occN++; }
    for (const a of at) if (rms[a] === undefined && t >= a) { rms[a] = scatter; trav[a] = travel; }
    let land = 0;
    for (const c of spawned) if (p.hits[c.i]) land++;
    if (land === spawned.length && landed0 < 0) landed0 = t;
    samples.push({ t, occ, scatter, travel, land });
  }
  for (const c of spawned) if (p.rest[c.i]) restN++;
  /**
   * 🎯 **A2's OWN RATIO — how much further the group TRAVELS than it DEFORMS — AT A FIXED INSTANT,
   * AND THE FIXED INSTANT IS THE POINT.**
   *
   * ⚠️ **Two readings were tried and BOTH of the obvious ones are traps, so both are written down.**
   * (1) RMS relative scatter at a fixed time mixes deformation in the air with **how many plates
   * have already hit the floor**, because landing scatters a group hard — and the arms land at
   * different times by construction, so a 0.40 s reading can compare *"still falling"* against
   * *"half landed"* and come out backwards. It did: the first version of this file reported the
   * new payout as LESS dispersed at 0.40 s and was wrong. (2) Sampling on the last frame before
   * anything has landed is no better — **that frame is at 0.23 s on one arm and 0.38 s on
   * another**, and the ratio grows with time whatever the plates do, so it flatters whichever arm
   * lands soonest. It read 8.50 / 1.14 / 5.05 that way and the 5.05 was the clock, not the fall.
   *
   * **0.20 s is used because it is the row `critic-dig-8` published** (centroid 0.257 m against
   * 0.034 m of scatter = 7.6×) and because nothing has landed on any arm by then, so it is
   * airborne on all three and comparable across all three.
   */
  const airborne = samples.filter((x) => x.land === 0).pop() ?? samples[0];
  return {
    plates: spawned.length, breach: [bx1 - bx0, by1 - by0], bArea,
    rms, trav, landedAll: landed0, occMean: occSum / Math.max(1, occN),
    ratio20: (trav[0.20] ?? 0) / Math.max(1e-6, rms[0.20] ?? 1e-6),
    firstLand: airborne.t,
    occAt: at.map((a) => samples.find((s2) => s2.t >= a)?.occ ?? 0),
    arrival: arrival.length ? arrival.reduce((a, b) => a + b, 0) / arrival.length : 0,
    restN, samples,
  };
}

head('S4/S5 — THE FALL, on the shipped DebrisSystem at a fixed 60 Hz');
const cFlat = firstCollapse('flat'), cSag = firstCollapse('sag');
if (!cFlat || !cSag) {
  fail('the fall can be measured', 'neither arm produced a collapse big enough to pay out plates');
} else {
  /**
   * Three arms, and the pairing matters:
   *   · **`legacy`** — the round-13 collapse (the whole storey, one event) paid out the round-13
   *     way (one rect, no hold, no spread). This is what John played and what critic-dig-8 read.
   *   · **`peeled`** — the SAME collapse paid out the new way. The pure payout A/B: identical
   *     plate count, identical region, only `hold`, `spread` and the size jitter differ.
   *   · **`shipped`** — the sag rule's own bite paid out the new way. What the game does.
   */
  const legacy = fall(cFlat.col, false, true);
  const peeled = fall(cFlat.col, true, true);
  const shipped = fall(cSag.col, true, false);
  note(`  arm      plates  breach         RMS relative scatter @0.20/0.40/0.60/0.80 s  all landed`
    + '  mean arrival  resting');
  for (const [nm, r] of [['legacy', legacy], ['peeled', peeled], ['shipped', shipped]]) {
    note(`  ${nm.padEnd(8)} ${String(r.plates).padStart(6)}  `
      + `${f2(r.breach[0])}x${f2(r.breach[1])} m  `
      + `${[0.20, 0.40, 0.60, 0.80].map((a) => f3(r.rms[a] ?? 0)).join(' / ').padStart(31)}`
      + `  ${(r.landedAll < 0 ? '—' : f2(r.landedAll) + ' s').padStart(10)}`
      + `  ${f2(r.arrival).padStart(12)} m/s  ${String(r.restN).padStart(7)}`);
  }
  note('  legacy = the round-13 collapse paid out the round-13 way · peeled = THE SAME collapse,');
  note('  new payout (the pure A/B) · shipped = the sag rule\'s own bite, new payout.');
  const fFlat = legacy, fSag = peeled;
  const plate = 0.56;
  /**
   * 🚨 **THE CONTROL FIRST, AGAIN.** The ablated arm must still read as a sheet — a relative
   * scatter far under a plate width for the whole airborne phase. If it does not, the rig is not
   * reproducing the build critic-dig-8 measured and the improvement below is against nothing.
   */
  (fFlat.rms[0.20] < 0.10 && fFlat.rms[0.40] < 0.30)
    ? pass('CONTROL — the ablated fall still reads as a sheet',
      `hold and spread off: RMS relative scatter ${f3(fFlat.rms[0.20])} m at 0.20 s and `
      + `${f3(fFlat.rms[0.40])} m at 0.40 s against a ${plate} m plate — critic-dig-8 read 0.034 `
      + 'and 0.147 in its own rig. The group translates far further than it deforms.')
    : fail('CONTROL — the ablated fall still reads as a sheet',
      `${f3(fFlat.rms[0.20])} / ${f3(fFlat.rms[0.40])} m — the control does not reproduce the `
      + 'sheet, so S4 is measuring against a baseline this file invented');
  note('');
  note("  A2's ratio at 0.20 s — nothing has landed on any arm yet, so all three are airborne:");
  for (const [nm, r] of [['legacy', legacy], ['peeled', peeled], ['shipped', shipped]]) {
    note(`    ${nm.padEnd(8)} the group has travelled ${f3(r.trav[0.20])} m and deformed `
      + `${f3(r.rms[0.20])} m: it translates ${f2(r.ratio20)}× further than it deforms `
      + `(first contact at ${f2(r.firstLand)} s)`);
  }
  note('    critic-dig-8 published 0.257 m of travel against 0.034 m of scatter = 7.6× on this row.');
  const g20 = fSag.rms[0.20] / Math.max(1e-6, fFlat.rms[0.20]);
  const gR = legacy.ratio20 / Math.max(1e-6, peeled.ratio20);
  (g20 >= 2.5 && gR >= 2.0 && peeled.ratio20 <= 3.0 && shipped.ratio20 <= 4.0)
    ? pass('THE FALL IS RE-DISPERSED — the plates move with respect to EACH OTHER now',
      `SAME collapse, same ${legacy.plates} plates, same region: RMS relative scatter `
      + `${f3(fFlat.rms[0.20])} → ${f3(fSag.rms[0.20])} m at 0.20 s (${f2(g20)}×) against a `
      + `${plate} m plate, and A2's own ratio — how much further the group travels than it `
      + `deforms — goes **${f2(legacy.ratio20)}× → ${f2(peeled.ratio20)}×**, ${f2(shipped.ratio20)}× `
      + 'as shipped. critic-dig-8 published 7.6× on this exact row and called it a sheet. The '
      + 'dominant term is the peel: a plate held 0.2 s is a fifth of a second behind its neighbour '
      + 'on a two-thirds-of-a-second flight, which is larger than every velocity difference in '
      + '`chunk()` put together.')
    : fail('THE FALL IS RE-DISPERSED — the plates move with respect to EACH OTHER now',
      `${f2(g20)}× scatter at 0.20 s; translate/deform ${f2(legacy.ratio20)} → `
      + `${f2(peeled.ratio20)} (${f2(gR)}×), shipped ${f2(shipped.ratio20)} — not enough `
      + 'separation to stop reading as one object');
  head('S5 — CAN THE PLAYER SEE THE HOLE THEY JUST MADE? (plate shadows on the breach, from the eye)');
  note('  arm      breach       occlusion @0.20/0.40/0.60/0.80 s   mean over the first 0.8 s');
  for (const [nm, r] of [['legacy', legacy], ['peeled', peeled], ['shipped', shipped]]) {
    note(`  ${nm.padEnd(8)} ${(f2(r.bArea) + ' m²').padStart(8)}  `
      + `${r.occAt.map((o) => (o * 100).toFixed(0) + '%').join(' / ').padStart(28)}`
      + `   ${(r.occMean * 100).toFixed(1)}%`);
  }
  legacy.occMean >= 0.25
    ? pass('CONTROL — the round-13 payout still hides the breach it made',
      `one rect, no hold, no spread: the plates cover ${(legacy.occMean * 100).toFixed(0)}% of the `
      + `breach on average over the payoff, peaking at `
      + `${(Math.max(...legacy.occAt) * 100).toFixed(0)}%. That is critic-dig-8's second finding — `
      + '*"for the entire 0.8 s of the payoff the player cannot see what they just achieved"* — '
      + 'reproduced arithmetically.')
    : fail('CONTROL — the round-13 payout still hides the breach it made',
      `${(legacy.occMean * 100).toFixed(0)}% mean occlusion on the control — it does not reproduce `
      + 'the defect, so S5 is meaningless');
  /**
   * 🚨 **THE PEEL AND THE BREACH ARE IN DIRECT TENSION AND THIS FILE SAYS SO RATHER THAN HIDING
   * IT.** A held plate is drawn flush in the aperture, so holding it is BY DEFINITION more time
   * with plate in front of the hole — measured at **+2.6 points of mean occlusion for the payout
   * change on its own**, and the first shaping of `spread` (which raised the outward push) made it
   * **+2.8 more** before that was measured and reverted, because a plate coming toward the eye
   * magnifies its own shadow. **The RULE is what resolves the tension**: a 1.40 m² bite is a
   * smaller hole with fewer plates in front of it than a 4.3 m² storey, and the end-to-end number
   * is what the player gets. Both are asserted — the shipped improvement, AND a bound on what the
   * peel is allowed to cost, so nobody later reads the peel as free.
   */
  (peeled.occMean - legacy.occMean <= 0.06 && shipped.occMean <= legacy.occMean * 0.70)
    ? pass('THE BREACH STAYS VISIBLE THROUGH THE PAYOFF',
      `mean occlusion of the breach over the first 0.8 s: **${(legacy.occMean * 100).toFixed(1)}% → `
      + `${(shipped.occMean * 100).toFixed(1)}% as shipped**, and at 0.80 s `
      + `${(legacy.occAt[3] * 100).toFixed(0)}% → ${(shipped.occAt[3] * 100).toFixed(0)}% — the `
      + `breach is clear before the payoff is over instead of a third covered. ⚠️ THE PEEL ON ITS `
      + `OWN COSTS ${((peeled.occMean - legacy.occMean) * 100).toFixed(1)} POINTS `
      + `(${(legacy.occMean * 100).toFixed(1)}% → ${(peeled.occMean * 100).toFixed(1)}% on the `
      + `SAME collapse), because a held plate sits in the aperture; the ${COLLAPSE.bite} m² bite `
      + 'pays that back four times over.')
    : fail('THE BREACH STAYS VISIBLE THROUGH THE PAYOFF',
      `${(legacy.occMean * 100).toFixed(1)}% → peeled ${(peeled.occMean * 100).toFixed(1)}% `
      + `(+${((peeled.occMean - legacy.occMean) * 100).toFixed(1)} pts, bar is +6) → shipped `
      + `${(shipped.occMean * 100).toFixed(1)}% — either the peel has become expensive or the rule `
      + 'has stopped paying for it');
  /**
   * ✅ **AND THE LANDED HEAP MUST NOT HAVE MOVED.** `critic-dig-8`: *"THE LANDING IS RIGHT AND
   * SHOULD NOT BE TOUCHED… do not fix the debris. Fix the 0.8 seconds between letting go and
   * resting."* Nothing in this slice touches the contact, the brake, the lean or the pile — so the
   * properties `collapse-2` earned there have to come back unchanged. **The test is against the
   * legacy arm and not against an absolute**, because arrival speed depends on how far a plate
   * fell, which is a property of the collapse and not of the landing.
   */
  const dArr = Math.abs(peeled.arrival - legacy.arrival) / Math.max(0.01, legacy.arrival);
  (dArr <= 0.16 && peeled.restN === peeled.plates && legacy.restN === legacy.plates)
    ? pass('THE LANDED HEAP IS UNTOUCHED — it still arrives heavy and it still all settles',
      `same collapse, same plates: mean arrival ${f2(legacy.arrival)} → ${f2(peeled.arrival)} m/s `
      + `(${(dArr * 100).toFixed(0)}%), and ${peeled.restN} of ${peeled.plates} plates are at rest `
      + 'inside 1.6 s on both arms. No contact, brake, lean or pile term was touched — `hold` and '
      + '`spread` both act before the first contact and neither is read after it.')
    : fail('THE LANDED HEAP IS UNTOUCHED — it still arrives heavy and it still all settles',
      `arrival ${f2(legacy.arrival)} → ${f2(peeled.arrival)} m/s (${(dArr * 100).toFixed(0)}%), `
      + `at rest ${legacy.restN}/${legacy.plates} → ${peeled.restN}/${peeled.plates}`);
}

// =============================================================================================
// S6/S7 — the two things that must not move whatever else does.
// =============================================================================================
head('S6/S7 — DETERMINISM AND THE CYAN');
{
  const f = mkField('sag');
  const stepU = (f.brush.radius * 1.3) / f.width;
  for (let k = 0; k < 24; k++) {
    f.applyHit(Math.min(0.98, Math.max(0.02, 0.5 + (k % 2 ? 1 : -1) * (0.5 + Math.floor(k / 2)) * stepU)),
      0.10 + (k % 3) * 0.05, 1);
  }
  const d0 = Float32Array.from(f.depth), s0 = Uint8Array.from(f._sag);
  const g = mkField('sag');
  g.replay(f.hits.slice());
  let dd = 0, ds = 0;
  for (let i = 0; i < d0.length; i++) { if (d0[i] !== g.depth[i]) dd++; if (s0[i] !== g._sag[i]) ds++; }
  (dd === 0 && ds === 0)
    ? pass('THE SAG IS A PURE FUNCTION OF THE HIT LIST',
      `24 blows replayed from the hit list: ${d0.length} depth cells and every sag byte identical. `
      + 'No rng, no time term, no solver — `replay()` still rebuilds the wall and its hanging '
      + 'pieces bit-for-bit.')
    : fail('THE SAG IS A PURE FUNCTION OF THE HIT LIST',
      `${dd} depth cells and ${ds} sag bytes differ after a replay`);
}
{
  const f = new DamageField({ width: W, height: H });   // barrier left ON: the real cyan
  let before = 0;
  for (let i = 0; i < f.barrier.length; i++) before += f.barrier[i];
  let collapsed = 0;
  for (let k = 0; k < 90; k++) {
    const r = f.applyHit(0.10 + (k % 24) * 0.034, 0.20 + (k % 3) * 0.04, 1);
    if (r.collapse) collapsed += r.collapse.cells;
  }
  let after = 0, through = 0, deep = 0;
  for (let i = 0; i < f.barrier.length; i++) {
    after += f.barrier[i];
    if (!f.barrier[i]) continue;
    if (f.depth[i] >= 0.999) deep++;
    if (f.passable(i)) through++;
  }
  (through === 0 && after === before)
    ? pass('THE CYAN NEVER COLLAPSES AND NEVER SAGS',
      `90 blows along one low line brought down ${collapsed} cells, ${deep} of them dug clean `
      + `through TO the barrier, and 0 became passable; barrier count unchanged at ${after}. `
      + 'Neither `collapse()` nor the sag reads `barrier` at all.')
    : fail('THE CYAN NEVER COLLAPSES AND NEVER SAGS',
      `${through} passable through the barrier, count ${before} → ${after}`);
}

console.log(`\n  ${passN}/${failN} — ${failN === 0 ? 'ALL GREEN' : 'FAILURES ABOVE'}\n`);
process.exit(failN ? 1 : 0);
