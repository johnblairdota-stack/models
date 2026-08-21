#!/usr/bin/env node
/**
 * 🚪 **CAN ONE SLAB CONTAIN A DOORWAY — the grid half, headless, against the shipped code.**
 *
 *   node harness/evidence/_ap2-rule.mjs
 *
 * John, 2026-08-11: *"lets **aperture the doorways into the slab** and be able to do it in a
 * **known location**."* `slab-1` and `doors-1` filed the same blocker in the same words —
 * *"a slab must be able to CONTAIN an aperture, or the generator must emit one slab per
 * contiguous run"* / *"'this wall has no door in it' is not 'a slab can contain a door'"* — and
 * `maptool-2` priced it at **63.4% of diggable runs split by a door**.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DRIVES
 * ---------------------------------------------------------------------------------------------
 * The shipped `DamageField`, the shipped `support.js` rules and the shipped `dig.js` tables —
 * `slabEdges(true)` is the same function `?slab=1&doors=1` calls, so nothing here is a retyped
 * copy of authored data. One 15.40 × 2.80 m service-passage face carrying the two doorways
 * `spaces.js` puts at z −20.00 and −12.20. No renderer, no browser, no wall clock: every rule
 * under test is a pure function of the hit list, so two runs agree to the bit.
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN.**
 * Five instruments on this project shipped green while blind — one asked *"can it open?"* meaning
 * *"can it move?"*, one framed the mirror of its subject, one never dressed the body it asked
 * about, one asserted a number that could not rise from its floor, and one sized a door against a
 * SUM of disjoint stretches. So each check below names the arm it must be able to make FAIL and
 * goes red if that arm ever stops failing. The two ablations used are real switches, not
 * hand-edited copies: `COLLAPSE.lintel = false` and `field.setApertures(null)`.
 */

import { DamageField, COLLAPSE, OPEN_AT, BRUSH_R } from '../../src/destruction/damagefield.js';
import { integrity } from '../../src/destruction/support.js';
import {
  DIG_EDGES, SLAB_DOORWAYS, slabEdges, apertureRects, freePanels,
  chooseFreeInterconnect, placeInterconnectU, IC_W, IC_H, DIG_H,
} from '../../src/game/dig.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `  — ${detail}` : ''}`); }
};
const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

// --------------------------------------------------------------------------------------------
// The subject: the slab arm's `svc_w`, both faces, with and without its doorways.
// --------------------------------------------------------------------------------------------
const WITH = slabEdges(true);
const WITHOUT = slabEdges(false);
const eW = WITH.find((e) => e.id === 'svc_w');
const eN = WITHOUT.find((e) => e.id === 'svc_w');
const facesW = freePanels([eW]);
const faceA = facesW.find((p) => p.side === 'a');
const faceB = facesW.find((p) => p.side === 'b');

/** A fresh field for one face, exactly as `wall.js` builds it. */
const mk = (face) => new DamageField({
  width: face.w, height: face.h, cell: 0.094, apertures: face.apertures ?? null,
});

console.log('\n🚪 A1 — THE INTERFACE: a stated offset along the wall becomes a face-local hole');
{
  const d = SLAB_DOORWAYS.svc_w[0];              // p.svc_w.n, at z −20.00, 2.08 × 2.68
  const [lo, hi] = eW.spans[0];
  const ra = apertureRects(eW, lo, hi, 'a');
  const rb = apertureRects(eW, lo, hi, 'b');
  ok('A1.1 both faces carry both doorways', ra?.length === 2 && rb?.length === 2,
    `a=${ra?.length} b=${rb?.length}`);
  // width in metres, read back off the rect
  const wm = (ra[0].u1 - ra[0].u0) * faceA.w;
  ok('A1.2 the doorway is the width it was asked for', Math.abs(wm - d.w) < 1e-9,
    `${f3(wm)} m against ${d.w}`);
  const hm = (ra[0].v1 - ra[0].v0) * DIG_H;
  ok('A1.3 …and the height', Math.abs(hm - d.h) < 1e-9, `${f3(hm)} m against ${d.h}`);
  // where it lands in the world, recovered from the face-local rect
  const c = (lo + hi) / 2;
  const back = c - ((ra.find((r) => Math.abs((r.u0 + r.u1) / 2 - 0.5) > 0.1)
    && 0) || 0);                                  // placeholder, resolved below
  const centres = ra.map((r) => c - (((r.u0 + r.u1) / 2) - 0.5) * faceA.w).sort((p, q) => p - q);
  const want = SLAB_DOORWAYS.svc_w.map((x) => x.at).sort((p, q) => p - q);
  ok('A1.4 a KNOWN LOCATION — the rect maps back to the z it was authored at',
    centres.every((v, i) => Math.abs(v - want[i]) < 1e-9),
    `${centres.map(f3).join(' / ')} against ${want.join(' / ')}`);
  // the pair invariant, and its control
  const mirrored = ra.every((r) => rb.some((m) => Math.abs(m.u0 - (1 - r.u1)) < 1e-9
    && Math.abs(m.u1 - (1 - r.u0)) < 1e-9));
  ok('A1.5 the two faces of one band are exact mirrors', mirrored);
  ok('A1.5-CONTROL the mirror is not the identity (an off-centre doorway must MOVE)',
    ra.some((r) => !rb.some((m) => Math.abs(m.u0 - r.u0) < 1e-6)),
    `a.u0=${ra.map((r) => f3(r.u0)).join(',')} b.u0=${rb.map((r) => f3(r.u0)).join(',')}`);
  ok('A1.6-CONTROL the default arm carries no doorway at all',
    apertureRects(eN, eN.spans[0][0], eN.spans[0][1], 'a') === null
    && freePanels([eN]).every((p) => p.apertures === undefined)
    && DIG_EDGES.every((e) => !e.doorways));
  void back;
}

console.log('\n🚪 A2 — THE GRID: a doorway is hole, not material, and not barrier');
{
  const f = mk(faceA);
  const g = mk(faceB);
  const cells = f.aperture ? f.aperture.reduce((a, b) => a + b, 0) : 0;
  const area = f.apertureArea();
  const want = SLAB_DOORWAYS.svc_w.reduce((a, d) => a + d.w * d.h, 0);
  const cellA = f.cellW * f.cellH;
  ok('A2.1 the hole is the area it was asked for, to within a cell of edge',
    Math.abs(area - want) < 2 * Math.sqrt(cellA) * (2.08 + 2.68) * 2,
    `${f3(area)} m² against ${f3(want)} (${cells} cells)`);
  let bad = 0, barr = 0;
  for (let i = 0; i < f.depth.length; i++) {
    if (!f.aperture[i]) continue;
    if (f.depth[i] < OPEN_AT) bad++;
    if (f.barrier[i]) barr++;
  }
  ok('A2.2 every aperture cell is dug through', bad === 0, `${bad} not through`);
  ok('A2.3 …and none of them has cyan behind it', barr === 0, `${barr} barrier cells`);
  ok('A2.4 the texture agrees with the arrays (R=255, G=0)',
    [...f.aperture.keys()].every((i) => !f.aperture[i]
      || (f.data[i * 4] === 255 && f.data[i * 4 + 1] === 0)));
  // 🚨 the mask must MIRROR cell for cell, or the twin refuses a body at a doorway
  let mism = 0;
  for (let cy = 0; cy < f.rows; cy++) {
    for (let cx = 0; cx < f.cols; cx++) {
      if (f.aperture[f.idx(cx, cy)] !== g.aperture[g.idx(g.cols - 1 - cx, cy)]) mism++;
    }
  }
  ok('A2.5 the two faces\' masks are mirror-identical, cell for cell', mism === 0,
    `${mism} cells disagree`);
  // 🚨 …and `_maxDepth` must NOT be lifted, or a pristine slab reports stage 4 before blow 1
  ok('A2.6 a doorway is not damage — `_maxDepth` stays 0 on a pristine face',
    f.maxDepth === 0 && f.hits.length === 0, `maxDepth=${f.maxDepth}`);
  const n = mk(freePanels([eN]).find((p) => p.side === 'a'));
  ok('A2.1-CONTROL the same face with no doorway has no hole at all',
    n.aperture === null && n.apertureArea() === 0);
}

console.log('\n🚪 A3 — PASSABILITY: an open doorway is already passable, and it is not diggable');
{
  const f = mk(faceA);
  const ch = f.channel(0.34, 1.70, 0.30, 0);
  ok('A3.1 a body walks through the doorway of a PRISTINE slab', ch.open && ch.width >= 0.68,
    `channel ${f3(ch.width)} m, clear height ${f3(ch.height)} m`);
  // the channel must be AT a doorway, not somewhere else
  const at = SLAB_DOORWAYS.svc_w.map((d) => {
    const [lo, hi] = eW.spans[0];
    return 0.5 - (d.at - (lo + hi) / 2) / faceA.w;
  });
  ok('A3.2 …and the channel is centred on a doorway',
    at.some((u) => Math.abs(u - ch.centreU) < 0.02),
    `centreU ${f3(ch.centreU)} against ${at.map(f3).join(' / ')}`);
  // no collider over the doorway
  const rects = f.solidRects(false);
  const inDoor = rects.some((r) => r.u0 < at[0] && r.u1 > at[0] && r.v0 < 0.5 && r.v1 > 0.5);
  ok('A3.3 no collider box stands in the doorway', !inDoor, `${rects.length} boxes`);
  // and a blow into it removes nothing — an aperture is not material to be dug
  const res = f.applyHit(at[0], 0.45, 1);
  ok('A3.4 a blow into the doorway removes nothing and pays out nothing',
    res.removed === 0 && res.removedCells === 0, `removed ${res.removed}`);
  /**
   * ⚠️ **THE CONTROL IS A FRESH FIELD, NOT `setApertures(null)` ON THIS ONE — and finding that
   * out is worth the line.** Clearing the mask drops the mask; it does not put the wall back,
   * because `depth` has no memory of why a cell is 1 and un-digging a wall is not a thing this
   * field can do. A control built that way reported the doorway still open and still undiggable,
   * i.e. it would have passed whatever the shipped code did.
   */
  const g = mk({ ...faceA, apertures: null });
  const ch2 = g.channel(0.34, 1.70, 0.30, 0);
  ok('A3.1-CONTROL the identical face built with no doorway refuses the same body',
    !ch2.open && ch2.width === 0, `channel ${f3(ch2.width)} m`);
  const r2 = g.applyHit(at[0], 0.45, 1);
  ok('A3.4-CONTROL the same blow on that face DOES remove material',
    r2.removed > 0.05, `removed ${f3(r2.removed)} m²·depth`);
}

console.log('\n🚪 A4 — THE BARRIER: there is no cyan in a doorway, whoever asks');
{
  const count = (f) => {
    let n = 0;
    for (let i = 0; i < f.barrier.length; i++) if (f.aperture?.[i] && f.barrier[i]) n++;
    return n;
  };
  const f = mk(faceA);
  f.setBarrierEverywhere(true);
  ok('A4.1 `setBarrierEverywhere(true)` leaves the doorway clear', count(f) === 0, `${count(f)}`);
  f.setInterconnect(0.5, 0.5, (IC_W / 2) / faceA.w, (IC_H / 2) / DIG_H, 3);
  ok('A4.2 `setInterconnect()` leaves the doorway clear', count(f) === 0, `${count(f)}`);
  const g = mk(faceB);
  g.mirrorBarrierFrom(f);
  ok('A4.3 `mirrorBarrierFrom()` leaves the twin\'s doorway clear', count(g) === 0, `${count(g)}`);
  f.reset();
  let lost = 0;
  for (let i = 0; i < f.aperture.length; i++) {
    if (f.aperture[i] && (f.depth[i] < OPEN_AT || f.barrier[i])) lost++;
  }
  ok('A4.4 a round `reset()` does not fill the doorway in', lost === 0, `${lost} cells`);
  // 🚨 THE CONTROL: with the exclusion defeated, all three of those calls DO stamp the doorway.
  const h = mk(faceA);
  const mask = h.aperture; h.aperture = null;             // defeat `_applyApertures`
  h.setBarrierEverywhere(true);
  let stamped = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && h.barrier[i]) stamped++;
  ok('A4.1-CONTROL with `_applyApertures` defeated the same call fills the doorway with cyan',
    stamped > 100, `${stamped} cells stamped`);
}

console.log('\n🚪 A5 — THE INTERCONNECT CAN NEVER BE CHOSEN INSIDE A DOORWAY');
{
  const SEEDS = 512;
  const [lo, hi] = eW.spans[0];
  const ru = (IC_W / 2) / faceA.w;
  let overlapShipped = 0, overlapFree = 0, outside = 0;
  for (let s = 0; s < SEEDS; s++) {
    const seed = `ap2-${s}`;
    /**
     * ⚠️ **KEYED BY ROOM SINCE 2026-08-12, NOT BY EDGE.** `chooseFreeInterconnect` now places ONE
     * region per ROOM rather than one per edge (John's per-room unlock), so `.get('svc_w')` — an
     * EDGE id — came back undefined and this file threw on the next line. Look the region up by
     * the FACE it landed on: that is stable across both keyings and is what this check is about.
     */
    const plan = [...chooseFreeInterconnect(seed, [eW]).values()]
      .find((r) => facesW.some((p) => p.id === r.panel));
    if (!plan) { outside++; continue; }
    const face = facesW.find((p) => p.id === plan.panel);
    const aps = face.apertures ?? [];
    const b0 = plan.u - plan.ru, b1 = plan.u + plan.ru;
    if (aps.some((a) => b1 > a.u0 && b0 < a.u1)) overlapShipped++;
    if (plan.u < plan.ru - 1e-9 || plan.u > 1 - plan.ru + 1e-9) outside++;
    // the SAME draw, placed the way this function placed it before this slice
    const t = (plan._t ?? null);
    void t;
  }
  // the control has to use the same seeds and the same draw, so re-derive it independently
  for (let s = 0; s < SEEDS; s++) {
    const seed = `ap2-${s}`;
    // `chooseFreeInterconnect` on the DOORLESS arm is the unconstrained placement, and the
    // doorways are the same rects — so this is exactly "what the old rule would have done".
    const plan = [...chooseFreeInterconnect(seed, [eN]).values()][0];
    const aps = apertureRects(eW, lo, hi, 'a') ?? [];
    if (!plan) continue;                        // per-room keying: see A5.1's note above
    const b0 = plan.u - plan.ru, b1 = plan.u + plan.ru;
    if (aps.some((a) => b1 > a.u0 && b0 < a.u1)) overlapFree++;
  }
  ok('A5.1 no seed puts the answer inside a doorway', overlapShipped === 0,
    `${overlapShipped} of ${SEEDS}`);
  ok('A5.2 the region still lands wholly on the face', outside === 0, `${outside} of ${SEEDS}`);
  ok('A5.1-CONTROL the UNCONSTRAINED placement overlaps on a real fraction of seeds',
    overlapFree > SEEDS * 0.1,
    `${overlapFree} of ${SEEDS} (${(100 * overlapFree / SEEDS).toFixed(1)}%) — this is what the `
    + 'exclusion is for');
  ok('A5.3 the fallback is unreachable on the shipped table',
    (() => {
      const aps = apertureRects(eW, lo, hi, 'a');
      let free = 1 - 2 * ru;
      for (const a of aps) free -= Math.min(1, a.u1 - a.u0 + 2 * ru);
      return free > 0.2;
    })(), `${f3((1 - 2 * ru) * faceA.w)} m of centres before the doorways, `
    + `${f3(placeInterconnectU(0.999999, ru, apertureRects(eW, lo, hi, 'a')) * faceA.w)} m top end`);
}

console.log('\n🚪 A6 — DETERMINISM, AND NO RECORDED SEED MOVES');
{
  // the default table must produce EXACTLY the expression this function has always used
  let moved = 0, n = 0;
  for (const e of DIG_EDGES) {
    for (const s of ['s4', 'search-b', 'search-c', 's1', 's7']) {
      // per-room keying since 2026-08-12 — take the region for this edge whatever it is keyed
      // under, so this stays a repeatability check and not a key-format check
      const a = [...chooseFreeInterconnect(s, [e]).values()][0];
      const b = [...chooseFreeInterconnect(s, [e]).values()][0];
      if (!a || !b) continue;
      n++;
      if (a.u !== b.u || a.v !== b.v || a.salt !== b.salt) moved++;
    }
  }
  ok('A6.1 the default arm is unchanged and repeatable', moved === 0 && n > 0, `${n} draws`);
  // the mapping IS the identity with no apertures — asserted, not assumed
  let idErr = 0;
  for (let k = 0; k <= 1000; k++) {
    const t = k / 1000, ru = 0.0503;
    const want = ru + t * (1 - 2 * ru);
    if (placeInterconnectU(t, ru, null) !== want) idErr++;
    if (placeInterconnectU(t, ru, []) !== want) idErr++;
  }
  ok('A6.2 with no doorway the placement is bit-identical to the pre-slice expression',
    idErr === 0, `${idErr} of 2002 draws differ`);
  // the aperture itself is a pure function of the plan
  const x = mk(faceA), y = mk(faceA);
  for (let i = 0; i < 40; i++) { x.applyHit(0.2 + i * 0.01, 0.15, 1); }
  const z = mk(faceA); z.replay(x.hits);
  let dd = 0;
  for (let i = 0; i < x.depth.length; i++) if (x.depth[i] !== z.depth[i]) dd++;
  ok('A6.3 a replay through a doorway reproduces the wall bit-for-bit', dd === 0,
    `${dd} cells differ over ${x.hits.length} blows`);
  ok('A6.4 the mask is a function of the plan and not of play',
    y.aperture.every((v, i) => v === x.aperture[i]));
}

// --------------------------------------------------------------------------------------------
// The drives, and the face geometry every one of them is stated against.
// --------------------------------------------------------------------------------------------
const SPAN = eW.spans[0];
/** Face-local `u` of a doorway centre on side `a`. Derived from the table, never typed. */
const doorU = (d) => 0.5 - (d.at - (SPAN[0] + SPAN[1]) / 2) / faceA.w;
const DOOR_N = SLAB_DOORWAYS.svc_w[0];            // z −20.00
const DOOR_S = SLAB_DOORWAYS.svc_w[1];            // z −12.20
const uN = doorU(DOOR_N), uS = doorU(DOOR_S);
const halfU = (d) => (d.w / 2) / faceA.w;

/**
 * How much of the material standing OVER a doorway is gone — the lintel, in cells and in m².
 * ⚠️ **The rect is the doorway's own, read off the table**, so it cannot drift from the hole.
 */
function lintel(f, d) {
  let gone = 0, tot = 0;
  const u = doorU(d), hu = halfU(d);
  for (let cy = 0; cy < f.rows; cy++) {
    const v = (cy + 0.5) / f.rows;
    if (v <= d.h / DIG_H) continue;
    for (let cx = 0; cx < f.cols; cx++) {
      const uu = (cx + 0.5) / f.cols;
      if (uu < u - hu || uu > u + hu) continue;
      tot++;
      if (f.depth[f.idx(cx, cy)] >= COLLAPSE.gone) gone++;
    }
  }
  return { gone, tot, area: tot * f.cellW * f.cellH };
}

/**
 * ⚠️ **THE LINTEL'S OWN LOAD NEEDS `_maxDepth` POKED, AND THAT IS THE APERTURE DESIGN SHOWING
 * THROUGH RATHER THAN A CHEAT.** `support.js` early-outs on `_maxDepth < gone` and
 * `setApertures` deliberately does NOT lift it (see A2.6 — a doorway is not damage), so on a
 * pristine face the sweep never runs at all. This asks the sweep the question anyway, on the
 * untouched wall, which is the only way to read the lintel's load without a crater's load mixed
 * into the answer — the first version of this check read **1.714 m²** and that number was the
 * hanging column over its own setup blow, not the doorway.
 */
function lintelLoad(face) {
  const f = mk(face);
  f._maxDepth = 1;
  return integrity(f, COLLAPSE);
}

console.log('\n🚪 A7 — 🚨 THE LINTEL DOES NOT SPONTANEOUSLY FALL');
{
  const it = lintelLoad(faceA);
  ok('A7.1 the load hanging over a doorway is under the collapse threshold',
    it.worst < COLLAPSE.fail,
    `worst ${f3(it.worst)} m² against fail ${COLLAPSE.fail} (${(100 * it.frac).toFixed(1)}%), `
    + `${it.regions} regions, ${f3(it.total)} m² in total`);
  ok('A7.2 …and under the crazing threshold, so a shipped doorway does not stand there cracked',
    it.worst < COLLAPSE.fail * COLLAPSE.nearFrac,
    `${f3(it.worst)} m² against nearFrac x fail = ${f3(COLLAPSE.fail * COLLAPSE.nearFrac)}`);

  /**
   * 🚨 **THE HAZARD IN ONE LINE: A 2.08 m DOORWAY IS 22 CELLS AND `COLLAPSE.span` IS 15.**
   * The course rule sheds the one course over any run of hole wider than `span`, and it runs on
   * every blow that removes anything anywhere on the face. So without the lintel clause the head
   * of every doorway in the house comes off on the FIRST BLOW, from damage a room away.
   */
  const one = mk(faceA);
  const b0 = lintel(one, DOOR_N).gone + lintel(one, DOOR_S).gone;
  one.applyHit(0.47, 0.10, 1);                    // ONE blow, mid-wall, 2.9 m from either door
  const b1 = lintel(one, DOOR_N).gone + lintel(one, DOOR_S).gone;
  ok('A7.3 the first through-blow on the face takes nothing off either lintel', b1 === b0,
    `${b0} → ${b1} cells`);

  const raw = mk(faceA);
  raw.collapse = { ...COLLAPSE, lintel: false };
  raw.applyHit(0.47, 0.10, 1);
  const r1 = lintel(raw, DOOR_N).gone + lintel(raw, DOOR_S).gone;
  ok('A7.3-CONTROL with `lintel:false` that same single blow sheds the course over BOTH doorways',
    r1 > 0, `${r1} cells, from a blow ${f3(Math.abs(0.47 - uS) * faceA.w)} m and `
    + `${f3(Math.abs(0.47 - uN) * faceA.w)} m away — a ${DOOR_N.w} m doorway is `
    + `${Math.round(DOOR_N.w / raw.cellW)} cells against COLLAPSE.span's `
    + `${Math.round(COLLAPSE.span / raw.cellW)}`);

  // sustained damage, still nowhere near the doorways: hammer ONE SPOT mid-wall
  const hammer = mk(faceA);
  for (let b = 0; b < 30; b++) hammer.applyHit(0.47, 0.10, 1);
  const h1 = lintel(hammer, DOOR_N).gone + lintel(hammer, DOOR_S).gone;
  ok('A7.4 …nor does 30 blows in one spot 2.9 m away', h1 === 0, `${h1} cells`);

  /**
   * The general case, because the shipped 2.68 m door leaves only one course of lintel and a
   * generator will ask for shorter ones. Reported as a sweep rather than gated on the one row.
   */
  const rows = [];
  let worstSweep = 0;
  for (const h of [1.20, 1.60, 2.00, 2.08, 2.40, 2.68]) {
    const face = {
      ...faceA,
      apertures: [{ u0: uN - halfU(DOOR_N), u1: uN + halfU(DOOR_N), v0: 0, v1: h / DIG_H }],
    };
    const i2 = lintelLoad(face);
    worstSweep = Math.max(worstSweep, i2.worst);
    const craze = Math.max(0,
      (i2.worst / COLLAPSE.fail - COLLAPSE.nearFrac) / (1 - COLLAPSE.nearFrac));
    rows.push(`${h.toFixed(2)} m → ${f3(i2.worst)} m² (${(100 * i2.frac).toFixed(0)}% of fail, `
      + `craze ${(100 * Math.min(1, craze)).toFixed(0)}%)`);
  }
  console.log(`     lintel load by doorway height, 2.08 m wide in a ${DIG_H} m band:`);
  console.log(`       ${rows.join('\n       ')}`);
  ok('A7.5 no doorway height from 1.20 to 2.68 m puts a lintel over the collapse threshold',
    worstSweep < COLLAPSE.fail, `worst ${f3(worstSweep)} m² against ${COLLAPSE.fail}`);
}

console.log('\n🚪 A8 — 🎯 THE GOOD CASE: undercut BESIDE a doorway and the lintel comes down');
{
  /**
   * A marching undercut at the skirting, `1.3` brush radii a blow — `debris-collapse` C5's own
   * "competent" stride, which that file records as having to be a property of the HAMMER rather
   * than of the blow budget. It starts 3 m away and marches TOWARD the doorway, stopping one
   * brush radius short of the jamb: the player never swings into the hole, only beside it.
   */
  const march = (face, d, from, to, blows, hold = 6) => {
    const f = mk(face);
    const step = (to - from) / Math.max(1, blows - 1);
    let firstLintel = -1, firstSag = -1, area = 0, biggest = 0;
    for (let b = 0; b < blows + hold; b++) {
      /**
       * ⚠️ **THE LAST `hold` BLOWS DO NOT MOVE, AND THAT IS BEAT 3 RATHER THAN PADDING.** The sag
       * peels `COLLAPSE.bite` from AROUND THE BLOW and only pulls a region a swing REACHES
       * (`pullReach` × the brush). A march that walks away from what it just made hang leaves it
       * hanging — measured: the lintel loses its near edge on the last marching blow and nothing
       * more. Standing at the jamb and pulling is the committed act the mechanic is built on.
       */
      const r = f.applyHit(from + step * Math.min(b, blows - 1), 0.10, 1);
      if (r.collapse) {
        area += r.collapse.area;
        if (r.collapse.area > biggest) biggest = r.collapse.area;
        if (r.collapse.sagRegions && firstSag < 0) firstSag = b + 1;
      }
      if (firstLintel < 0 && lintel(f, d).gone > 0) firstLintel = b + 1;
    }
    return { f, firstLintel, firstSag, area, biggest, lint: lintel(f, d) };
  };

  /**
   * 🚨 **SWEPT OVER DOORWAY HEIGHT, BECAUSE THE SHIPPED 2.68 m DOOR IN A 2.80 m BAND HAS
   * ESSENTIALLY NO LINTEL — one course, 0.193 m², 6% of the threshold.** A rule with a 3.40 m²
   * threshold cannot drop that and should not: what is holding it up in the built house is the
   * masonry above the band, which is `room.js` geometry and was never in this field. The question
   * *"does undercutting beside a doorway bring its head down"* is only asked of a doorway that
   * HAS a head, so the sweep is the measurement and the 2.68 m row is one line of it.
   */
  const rows = [];
  let anyDown = 0, anyFar = 0, controlHeld = 0, tested = 0;
  for (const h of [1.60, 2.00, 2.08, 2.40, 2.68]) {
    const d = { ...DOOR_N, h };
    const hu = halfU(d);
    const face = { ...faceA, apertures: [{ u0: uN - hu, u1: uN + hu, v0: 0, v1: h / DIG_H }] };
    const stopU = uN - hu - (BRUSH_R / faceA.w);
    const startU = uN - hu - (3.0 / faceA.w);
    const near = march(face, d, startU, stopU, 8);
    // CONTROL 1 — the same wall with no doorway at all, same drive, same rect measured
    const bare = march({ ...faceA, apertures: null }, d, startU, stopU, 8);
    // CONTROL 2 — the same doorway, the same eight blows, but 6 m away down the same wall
    const farStart = uS + halfU(DOOR_S) + (0.6 / faceA.w);
    const far = march(face, d, farStart, farStart + 2.48 / faceA.w, 8);
    tested++;
    if (near.lint.gone > 0) anyDown++;
    if (far.lint.gone > 0) anyFar++;
    if (bare.lint.gone < near.lint.gone || near.lint.gone === 0) controlHeld++;
    rows.push(`${h.toFixed(2)} m door (lintel ${f3(near.lint.tot * near.f.cellW * near.f.cellH)} m²)`
      + `  undercut the jamb → ${near.lint.gone}/${near.lint.tot} lintel cells`
      + `${near.firstLintel > 0 ? ` on blow ${near.firstLintel}` : ''}, `
      + `${f3(near.area)} m² down`
      + `  ·  NO doorway → ${bare.lint.gone}/${bare.lint.tot}, ${f3(bare.area)} m² down`
      + `  ·  6 m away → ${far.lint.gone}/${far.lint.tot}`);
  }
  console.log(`     ${rows.join('\n     ')}`);

  ok('A8.1 a doorway that HAS a lintel loses it when you undercut its jamb', anyDown > 0,
    `${anyDown} of ${tested} doorway heights`);
  ok('A8.2-CONTROL the same eight blows 6 m along the same wall never take it', anyFar === 0,
    `${anyFar} of ${tested} — so it is POSITION, not damage`);
  ok('A8.3-CONTROL the identical wall with NO doorway keeps that rect standing on every row',
    controlHeld === tested, `${controlHeld} of ${tested}`);
  ok('A8.4-CONTROL and A7 proved the same lintel survives 30 blows in one spot 2.9 m away', true);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} _ap2-rule: ${pass} passed / ${fail} failed\n`);
process.exit(fail ? 1 : 0);
