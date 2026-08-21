#!/usr/bin/env node
/**
 * 🦾 **THE COLLAPSE COST — IS IT SCALED TO THE EVENT, IS IT POSITIONAL, IS IT AVOIDABLE, AND CAN
 * IT SOFT-LOCK?**
 *
 *   node harness/evidence/_limb1-rule.mjs
 *
 * John, asked by a critic whether a collapsing wall should be able to hurt the player:
 *
 *   > *"I think **generally a collapse shouldn't hurt you**. we could try it as a mechanic but
 *   > **maybe the robots limbs fall off and they just need to put it back on**."*
 *
 * `critic-dig-8` on why the dig is too easy: *"one verb, one decision, one resource, and **no
 * cost term anywhere**. Three blows feels cheap because it **is** free, and would at twelve.
 * Adding blows is the one change guaranteed not to work."* This is that cost term, and this file
 * is the argument for every constant in it.
 *
 * ---------------------------------------------------------------------------------------------
 * 🎯 **WHAT IT DRIVES, AND WHY IT IS THE SHIPPED STREAM RATHER THAN A HAND-WRITTEN EVENT.**
 * ---------------------------------------------------------------------------------------------
 * `src/destruction/damagefield.js`'s real `DamageField`, 220 blows, on both of `debris-collapse`
 * C5's play policies (`undercut` = a competent player aiming an undercut, `random` = scatter),
 * copied verbatim from `_sag1-grain.mjs` so the three files measure the same player. Every
 * `collapse().events[]` entry is placed in a synthetic world — one 4.60 × 2.80 m face, normal
 * +Z, floor at 0 — and the SHIPPED `collapseLimbHit` from `src/game/limbs.js` is asked about it.
 * No renderer, no browser, no wall clock: the rule has no time term, so two runs agree exactly.
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN.**
 * Sixteen instruments on this project produced a result-shaped output instead of an error and
 * twelve would have gone red on their first run with a control; last night a reset check was
 * green while the defect was live because its setup never dressed the body it was asking about.
 * So each check below states the arm it must be able to make FAIL, and goes red if that arm ever
 * stops failing — a rule that fires on everything and a rule that fires on nothing both look
 * like a pass to a check that only ever asks the shipped arm.
 */

import { DamageField, COLLAPSE } from '../../src/destruction/damagefield.js';
import { collapseLimbHit, COLLAPSE_LIMB } from '../../src/game/limbs.js';
import { MOVE, WEAPON_RANGE } from '../../src/game/rules.js';

const W = 4.60, H = 2.80;               // the shipped `DIG_H` and a representative span
const FLOOR = 0;
const BODY_H = 1.7;
const RADIUS = BODY_H * 0.20;           // `Player.radius`
const EYE = BODY_H * MOVE.eyeHeight;    // 1.539 m — the arm/leg divider
const CRAWL_EYE = BODY_H * 0.30;        // `Player.eyeHeight` on the crawl gait
const FACING = Math.PI;                 // facing the wall: forward is -Z, so right is +X

const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

let passN = 0, failN = 0;
const pass = (t, d) => { passN++; console.log(`  ✅ PASS  ${t}\n          ${d}`); };
const fail = (t, d) => { failN++; console.log(`  ❌ FAIL  ${t}\n          ${d}`); };
const note = (s) => console.log(`  ${s}`);
const head = (s) => console.log(`\n${s}`);

// =============================================================================================
// THE DRIVE — the shipped field, both play policies, every event placed in the world
// =============================================================================================

/**
 * `debris-collapse` C5's two policies, copied verbatim from `_sag1-grain.mjs`.
 * ⚠️ **A stride parameterised by the blow BUDGET measures the budget** — that lie cost C5 a
 * round (`destruction.md` §8). The stride is 1.3 brush radii, set by the HAMMER.
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

/**
 * Drive one policy and return every event, placed. The face is axis-aligned with normal +Z, so
 * `views/game.js`'s `tX = nrm.z, tZ = -nrm.x` reduces to "x along the face, z at the plane" and
 * the world y of an event is simply `FLOOR + v · H` (`wall.js` `pointAt`: `y = root.y +
 * (v − 0.5)·height`, and a face's root sits half its height above the floor).
 */
function drive(policy, blows = 220) {
  const f = new DamageField({ width: W, height: H });
  f.barrier.fill(0);                      // no answer behind it: this file measures the rule
  const aim = policies(f)[policy];
  const out = [];
  for (let k = 0; k < blows; k++) {
    const [u, v] = aim(k);
    const r = f.applyHit(Math.min(0.98, Math.max(0.02, u)), Math.min(0.98, Math.max(0.02, v)), 1);
    const evs = r.collapse?.events ?? [];
    /**
     * 🦾 **`warned` — COPIED FROM `views/game.js`'s `onChunk`, WHICH IS WHERE IT IS COMPUTED IN
     * THE GAME.** `support.js` emits a region's `sag` and peels its first `bite` **on the same
     * blow** (`pull = !already || …`), so a bite whose box overlaps a `sag` box from this same
     * blow is that blow's own arch break — the one the player was never shown and, being an
     * undercut blow at the skirting, could not have been standing clear of. See condition 3 in
     * `limbs.js`. Measured over these 440 blows: **6 of 8 bites are warned, 2 are not.**
     */
    const sags = evs.filter((e) => e.kind === 'sag');
    for (const e of evs) {
      out.push({
        blow: k, kind: e.kind, cells: e.cells, area: e.area, w: e.w, h: e.h,
        x: (e.u - 0.5) * W, y: FLOOR + e.v * H, z: 0, nx: 0, nz: 1,
        warned: !sags.some((s) =>
          Math.abs((s.dx ?? 0) - (e.dx ?? 0)) <= (s.w + e.w) * 0.5
          && Math.abs((s.dy ?? 0) - (e.dy ?? 0)) <= (s.h + e.h) * 0.5),
      });
    }
  }
  return out;
}

const body = (o = {}) => ({
  x: o.x ?? 0, y: FLOOR, z: o.z ?? 0.60,
  eyeY: FLOOR + (o.eyeY ?? EYE),
  radius: RADIUS, facing: o.facing ?? FACING, wounds: o.wounds ?? 0,
});
/** Directly under an event, at standoff `z`, facing the wall. */
const under = (ev, z = 0.60, extra = {}) => body({ x: ev.x, z, ...extra });

const EVENTS = { undercut: drive('undercut'), random: drive('random') };
const ALL = [...EVENTS.undercut, ...EVENTS.random];
const solid = ALL.filter((e) => e.cells > 0);
const qualifying = solid.filter((e) => e.area >= COLLAPSE_LIMB.area);

head('— the event stream this rule is set against —');
for (const p of ['undercut', 'random']) {
  const s = EVENTS[p].filter((e) => e.cells > 0);
  const byKind = {};
  for (const e of s) (byKind[e.kind] ??= []).push(e.area);
  note(`${p}: ${s.length} solid events · ${Object.entries(byKind)
    .map(([k, v]) => `${k} n=${v.length} max ${f3(Math.max(...v))}`).join(' · ')}`);
}
note(`sledge reach ${WEAPON_RANGE.sledge} m · eyeline ${f3(EYE)} m · body radius ${f3(RADIUS)} m`);
note(`table: ${JSON.stringify(COLLAPSE_LIMB)}`);

if (!qualifying.length) {
  fail('the drive produced something the rule could fire on',
    `${solid.length} solid events, none at or above ${COLLAPSE_LIMB.area} m² — every check below would be vacuous`);
  process.exit(1);
}

// =============================================================================================
// L1 — SCALED TO THE EVENT, AND THE THRESHOLD SITS IN A MEASURED HOLE
// =============================================================================================
head('L1 — the rule is scaled to the event, not to the fact that one happened');
{
  const admitted = solid.filter((e) => e.area >= COLLAPSE_LIMB.area);
  const refused = solid.filter((e) => e.area < COLLAPSE_LIMB.area);
  const biggestRefused = Math.max(...refused.map((e) => e.area));
  const smallestAdmitted = Math.min(...admitted.map((e) => e.area));
  const nonArch = admitted.filter((e) => e.kind !== 'arch');
  const gap = smallestAdmitted / biggestRefused;

  // ⚠️ THE CONTROL. A gate that admits everything and a gate that admits nothing both look like
  // a pass to "did the arch events get through". Drop the threshold to a fifth of the smallest
  // chip and the courses and rim chips MUST come through — if they do not, the gate is not the
  // thing doing the selecting and this check is measuring nothing.
  const wideOpen = solid.filter((e) => e.area >= 0.005);
  const controlAdmitsJunk = wideOpen.some((e) => e.kind === 'course' || e.kind === 'lonely');

  note(`admitted ${admitted.length} (all ${[...new Set(admitted.map((e) => e.kind))].join('/')})`
    + ` · refused ${refused.length} · biggest refused ${f3(biggestRefused)} m² (${refused.reduce((a, b) => a.area > b.area ? a : b).kind})`
    + ` · smallest admitted ${f3(smallestAdmitted)} m²`);
  note(`control (threshold 0.005 m²): ${wideOpen.length} admitted, junk present ${controlAdmitsJunk}`);

  if (!controlAdmitsJunk) {
    fail('only a BITE can take a limb', 'the control arm admitted no course/lonely event — the threshold is not what is selecting, so this check proves nothing');
  } else if (nonArch.length) {
    fail('only a BITE can take a limb', `${nonArch.length} non-arch events cleared ${COLLAPSE_LIMB.area} m²: ${nonArch.map((e) => `${e.kind} ${f3(e.area)}`).join(', ')}`);
  } else if (gap < 3) {
    fail('only a BITE can take a limb', `the two populations are only ${f2(gap)}× apart — the threshold is a taste, not a measurement`);
  } else {
    pass('only a BITE can take a limb',
      `${admitted.length} arch bites admitted, ${refused.length} courses and rim chips refused; the populations are ${f2(gap)}× apart (${f3(biggestRefused)} → ${f3(smallestAdmitted)} m²) and ${COLLAPSE_LIMB.area} sits in the hole`);
  }
}

// =============================================================================================
// L2 — AND THE NUMBER HAS NO SENSITIVITY TO ARGUE ABOUT
// =============================================================================================
head('L2 — any threshold inside that hole gives the identical answer');
{
  const key = (T) => solid.filter((e) => e.area >= T).map((e) => `${e.blow}:${e.kind}`).join('|');
  // ⚠️ **THE HOLE'S LOW EDGE IS 0.402 AND IT IS AN `arch`, NOT A COURSE — this check's own
  // control found that, and the first version of this file had the number wrong.** A bite that
  // runs out of material pays out about a third of a full one, so the sweep runs strictly
  // INSIDE (0.402, 1.404) rather than over the wider band the course sizes alone suggest.
  const inside = [0.45, 0.55, 0.65, 0.75, 0.90, 1.10, 1.35];
  const sets = new Set(inside.map(key));
  // ⚠️ THE CONTROL. If the sweep cannot tell ANY two thresholds apart it is broken, not stable.
  const outside = [0.35, 1.50];
  const differs = outside.every((T) => key(T) !== key(COLLAPSE_LIMB.area));

  note(`inside the hole ${inside.join(', ')} → ${sets.size} distinct admitted set(s)`);
  note(`control, outside it (${outside.join(', ')}) → both differ from ${COLLAPSE_LIMB.area}: ${differs}`);
  if (!differs) {
    fail('the threshold is insensitive across the hole', 'the control thresholds did not change the set either — the comparison is blind');
  } else if (sets.size !== 1) {
    fail('the threshold is insensitive across the hole', `${sets.size} different sets across ${inside.join('/')} — the number IS a tuning knob`);
  } else {
    pass('the threshold is insensitive across the hole',
      `identical admitted set at every one of ${inside.length} thresholds spanning ${inside[0]}–${inside[inside.length - 1]} m²; changing it to ${outside.join(' or ')} does move it, so the sweep can see a difference`);
  }
}

// =============================================================================================
// L3 — AVOIDABLE, PART ONE: BACK OFF AND YOU KEEP THE LIMB
// =============================================================================================
head('L3 — a safe standoff exists AND the pull is still in reach from it');
{
  /**
   * 🚨 **`SAFE` MOVED 1.30 → 0.80 ON 2026-08-10 AND THAT IS THE POINT OF THE WHOLE ROUND.**
   * John: *"the arm comes off way too easy… much tighter conditions."* The old `depth` of 1.05 m
   * had no legal undercut stance outside it: `WEAPON_RANGE.sledge` is 1.55 m **from the eye**, so
   * the skirting (0.28 m up a 2.80 m face) can only be struck from `√(1.55² − 1.26²)` = 0.90 m or
   * less, and every one of those stances was in the fall. At `depth` 0.60 the same measurement
   * says 0.60–0.90 m is both legal and safe. **The number this file now asserts is therefore the
   * one that was impossible before**, and 1.30 is kept only as a reported column.
   */
  const NEAR = 0.60, SAFE = 0.80;
  const rate = (z) => qualifying.filter((e) => collapseLimbHit(e, under(e, z))).length;
  const hitNear = qualifying.filter((e) => collapseLimbHit(e, under(e, NEAR)));
  const hitSafe = qualifying.filter((e) => collapseLimbHit(e, under(e, SAFE)));
  // ⚠️ THE CONTROL. "Nothing fires at 0.80 m" is also what a rule that never fires looks like.
  // Raise `depth` and the SAME bodies at the SAME 0.80 m must lose a limb — that is what proves
  // the safety is the rule's doing and not an accident of where these events happen to be.
  const deep = { ...COLLAPSE_LIMB, depth: 3.0 };
  const hitSafeAblated = qualifying.filter((e) => collapseLimbHit(e, under(e, SAFE), deep));

  note(`take-rate dead under a bite, by standoff: ${[0.40, 0.60, 0.80, 1.00, 1.30]
    .map((z) => `${f2(z)}m ${rate(z)}/${qualifying.length}`).join(' · ')}`);
  note(`skirting is reachable to ${f2(Math.sqrt(WEAPON_RANGE.sledge ** 2 - (EYE - 0.28) ** 2))} m,`
    + ` so ${f2(COLLAPSE_LIMB.depth)}–0.90 m undercuts safely and ${f2(COLLAPSE_LIMB.depth)}–${WEAPON_RANGE.sledge} m pulls safely`);
  note(`under the piece at ${f2(NEAR)} m: ${hitNear.length}/${qualifying.length} take a limb`);
  note(`the same bodies at ${f2(SAFE)} m: ${hitSafe.length} — control (depth 3.0 m): ${hitSafeAblated.length}`);
  if (!hitSafeAblated.length) {
    fail('backing off keeps the limb', 'the control arm took nothing either — the rule is not firing at all and this check is vacuous');
  } else if (!hitNear.length) {
    fail('backing off keeps the limb', `standing directly under a bite at ${NEAR} m took nothing; there is no cost to avoid`);
  } else if (hitSafe.length) {
    fail('backing off keeps the limb', `${hitSafe.length} events still take a limb at ${SAFE} m — the fall strip is not escapable by backing off`);
  } else if (SAFE > WEAPON_RANGE.sledge) {
    fail('backing off keeps the limb', `the safe standoff ${SAFE} m is outside the hammer's ${WEAPON_RANGE.sledge} m reach — "back off" and "keep digging" are not both available`);
  } else {
    pass('backing off keeps the limb',
      `${hitNear.length}/${qualifying.length} bites take a limb at ${f2(NEAR)} m and 0 at ${f2(SAFE)} m, which is inside the hammer's ${WEAPON_RANGE.sledge} m reach — so the pull can be taken from outside the fall. Ablating `
      + `depth to 3.0 m takes ${hitSafeAblated.length} at that same standoff, so the escape is the rule's`);
  }
}

// =============================================================================================
// L4 — AVOIDABLE, PART TWO: STEP ASIDE
// =============================================================================================
head('L4 — or step out from under it');
{
  const NEAR = 0.60;
  /**
   * 🚨 **THE HALF-WIDTH IS NOW AN INSET AND THE STEP IT COSTS FELL 1.20 m → 0.60 m.** It used to
   * be `effW/2 + your radius + 0.10`, i.e. the rule fired if any part of the body overlapped the
   * rim — on a 0.68 m bite that is a 1.13 m half-width, **1.7× the piece itself**, so "under the
   * falling wall" included standing beside it. It is `effW/2 − inset` now: the body's CENTRE has
   * to be under the material.
   */
  const halfW = qualifying.map((e) => Math.max(0, Math.min(e.w, e.area / e.h) * 0.5 - COLLAPSE_LIMB.inset));
  const worst = Math.max(...halfW);
  const STEP = Math.ceil(worst * 20) / 20 + 0.05;
  const hitCentred = qualifying.filter((e) => collapseLimbHit(e, under(e, NEAR)));
  const hitStepped = qualifying.filter((e) => collapseLimbHit(e, body({ x: e.x + STEP, z: NEAR })));
  const hitSteppedOther = qualifying.filter((e) => collapseLimbHit(e, body({ x: e.x - STEP, z: NEAR })));

  note(`lateral half-width across ${qualifying.length} bites: ${f2(Math.min(...halfW))}–${f2(worst)} m`
    + ` (the rule this replaces: ${f2(Math.max(...qualifying.map((e) => Math.min(e.w, e.area / e.h) * 0.5 + RADIUS + 0.10)))} m worst)`);
  note(`centred ${hitCentred.length} · stepped +${f2(STEP)} m ${hitStepped.length} · stepped −${f2(STEP)} m ${hitSteppedOther.length}`);
  if (!hitCentred.length) {
    fail('stepping out from under it keeps the limb', 'the centred control took nothing — vacuous');
  } else if (hitStepped.length || hitSteppedOther.length) {
    fail('stepping out from under it keeps the limb', `${hitStepped.length + hitSteppedOther.length} still fire ${f2(STEP)} m to the side`);
  } else {
    pass('stepping out from under it keeps the limb',
      `one ${f2(STEP)} m step along the wall clears every one of ${qualifying.length} bites in both directions, while standing centred loses ${hitCentred.length} of them`);
  }
}

// =============================================================================================
// L5 — POSITIONAL, NOT A COIN FLIP
// =============================================================================================
head('L5 — which limb is decided by where the wall came down, not by a draw');
{
  const hits = qualifying.map((e) => ({ e, h: collapseLimbHit(e, under(e, 0.60)) })).filter((r) => r.h);
  const arms = hits.filter((r) => r.h.kind === 'arm');
  const legs = hits.filter((r) => r.h.kind === 'leg');
  const consistent = hits.every((r) => (r.e.y >= FLOOR + EYE) === (r.h.kind === 'arm'));

  // ⚠️ CONTROL A — the divider is the BODY's eyeline, not a constant baked into the event. Ask
  // the identical events about a CRAWLING robot (eyeline 0.51 m) and at least one must
  // reclassify from leg to arm. If nothing moves, `kind` is a property of the event and the
  // sentence "it adapts to your gait" is false.
  const crawl = qualifying.map((e) => collapseLimbHit(e, under(e, 0.60, { eyeY: CRAWL_EYE })));
  const reclassified = hits.filter((r, i) => crawl[qualifying.indexOf(r.e)]?.kind === 'arm' && r.h.kind === 'leg').length;
  const crawlArms = crawl.filter((h) => h?.kind === 'arm').length;

  // ⚠️ CONTROL B — the SIDE is positional too, and it is asked at an UNAMBIGUOUS offset. A body
  // exactly under the centre line is a tie (broken to the right, see `collapseLimbHit`), so
  // asking about the side there measures the tie-break rather than the rule. Stand 0.25 m to
  // each side instead — well inside every measured footprint — and require the answer to name
  // the side the material is on, then to flip when the body turns round.
  //
  // ⚠️ **AND THE OFFSET IS NOW PER-EVENT, BECAUSE A FIXED 0.25 m SILENTLY BROKE THIS CHECK ON
  // 2026-08-10.** The lateral test became `effW/2 − inset` (see L4), which on the narrowest bite
  // is a half-width of 0.19 m — so a flat 0.25 m step put the control body OUTSIDE the rule and
  // "the side does not name where the material is" was reporting a body that was not under the
  // material at all. 70% of each event's own half-width is unambiguous on every one of them and
  // is nowhere near the 1e-6 tie band.
  const offFor = (e) => Math.max(0.02, (Math.min(e.w, e.area / e.h) * 0.5 - COLLAPSE_LIMB.inset) * 0.70);
  const OFF = `${f2(Math.min(...hits.map((r) => offFor(r.e))))}–${f2(Math.max(...hits.map((r) => offFor(r.e))))}`;
  const rightOf = hits.map((r) => collapseLimbHit(r.e, body({ x: r.e.x - offFor(r.e), z: 0.60 })));
  const leftOf = hits.map((r) => collapseLimbHit(r.e, body({ x: r.e.x + offFor(r.e), z: 0.60 })));
  const turned = hits.map((r) => collapseLimbHit(r.e, body({ x: r.e.x - offFor(r.e), z: 0.60, facing: FACING + Math.PI })));
  const sidesRead = rightOf.every((h) => h?.side === 'R') && leftOf.every((h) => h?.side === 'L');
  const sidesFlipped = rightOf.every((h, i) => turned[i] && turned[i].side !== h.side);

  note(`${hits.length} bites land on a body standing under them: ${arms.length} take an ARM, ${legs.length} take a LEG`);
  note(`event centre heights ${f2(Math.min(...hits.map((r) => r.e.y)))}–${f2(Math.max(...hits.map((r) => r.e.y)))} m against a ${f3(EYE)} m eyeline`);
  note(`control A (same events, crawling, eyeline ${f2(CRAWL_EYE)} m): arms ${arms.length} → ${crawlArms}, ${reclassified} reclassified leg→arm`);
  note(`control B (body ${OFF} m to each side): named correctly ${sidesRead} · flipped when turned 180° ${sidesFlipped}`);

  if (!consistent) {
    fail('which limb is positional', 'a classification disagreed with the eyeline it claims to use');
  } else if (!arms.length || !legs.length) {
    fail('which limb is positional', `the split does not split: ${arms.length} arms / ${legs.length} legs — one branch is unreachable in play`);
  } else if (!reclassified) {
    fail('which limb is positional', 'control A moved nothing: the arm/leg answer is a property of the event, not of the body, so it cannot adapt to the gait');
  } else if (!sidesRead) {
    fail('which limb is positional', 'control B: the side does not name where the material actually is');
  } else if (!sidesFlipped) {
    fail('which limb is positional', 'control B: turning the body round did not flip the side — the side is not read off the body frame');
  } else {
    pass('which limb is positional',
      `${arms.length} arms / ${legs.length} legs off event height alone, every one agreeing with the ${f3(EYE)} m eyeline; crawling reclassifies ${reclassified} of them, and the side names which way the material fell (${OFF} m off centre, both directions) and flips when the body turns round`);
  }
}

// =============================================================================================
// L6 — THE FOOTPRINT IS THE DENSITY, NOT THE BOUNDING BOX
// =============================================================================================
head('L6 — a sparse event does not take a limb off someone standing in its empty half');
{
  const dens = qualifying.map((e) => ({ e, d: e.area / (e.w * e.h), effW: Math.min(e.w, e.area / e.h) }));
  const sparse = dens.reduce((a, b) => (a.d < b.d ? a : b));
  // Somewhere inside the BOUNDING BOX but outside the material: what the naive rule would use.
  // ⚠️ **THE CONTROL IS LITERALLY THE RULE THIS ONE REPLACES** — bounding box + the body's own
  // radius + the 0.10 m of outward slack `COLLAPSE_LIMB.margin` used to carry (2026-08-10). The
  // constant is written out rather than read from the table because the table no longer has it:
  // the shipped rule insets instead of padding, so there is nothing to read.
  const gapLat = (sparse.e.w * 0.5 + RADIUS) * 0.88;
  const naiveWouldHit = Math.abs(gapLat) <= sparse.e.w * 0.5 + RADIUS + 0.10;
  const shipped = collapseLimbHit(sparse.e, body({ x: sparse.e.x + gapLat, z: 0.60 }));
  const centred = collapseLimbHit(sparse.e, under(sparse.e, 0.60));

  note(`densities ${(Math.min(...dens.map((x) => x.d)) * 100).toFixed(0)}–${(Math.max(...dens.map((x) => x.d)) * 100).toFixed(0)}%`
    + ` · effective widths ${f2(Math.min(...dens.map((x) => x.effW)))}–${f2(Math.max(...dens.map((x) => x.effW)))} m against boxes ${f2(Math.min(...dens.map((x) => x.e.w)))}–${f2(Math.max(...dens.map((x) => x.e.w)))} m`);
  note(`sparsest: ${(sparse.d * 100).toFixed(0)}% dense, box ${f2(sparse.e.w)} m, effective ${f2(sparse.effW)} m; body ${f2(gapLat)} m off centre`);
  note(`control (the naive bounding-box rule) would fire there: ${naiveWouldHit} · shipped fires: ${!!shipped} · shipped fires when centred: ${!!centred}`);

  if (!naiveWouldHit) {
    fail('the footprint is the density', 'the control body is not even inside the bounding box — the comparison has nothing to catch');
  } else if (!centred) {
    fail('the footprint is the density', 'the shipped rule does not fire on this event even centred — vacuous');
  } else if (shipped) {
    fail('the footprint is the density', `a body ${f2(gapLat)} m off the centre of a ${(sparse.d * 100).toFixed(0)}%-dense event lost a ${shipped.kind} — the box is being used as the footprint`);
  } else {
    pass('the footprint is the density',
      `on the sparsest bite (${(sparse.d * 100).toFixed(0)}% of a ${f2(sparse.e.w)} m box) the naive rule fires ${f2(gapLat)} m off centre and the shipped one does not, while both fire when centred`);
  }
}

// =============================================================================================
// L7 — IT CANNOT TAKE THE SECOND PART, SO IT CANNOT SOFT-LOCK
// =============================================================================================
head('L7 — the whole drive, standing in the worst place, costs exactly one limb');
{
  /** Walk the stream in order with a body that never moves and never refits. */
  const run = (respectWounds) => {
    let wounds = 0;
    const taken = [];
    for (const e of ALL) {
      const h = collapseLimbHit(e, under(e, 0.60, { wounds: respectWounds ? wounds : 0 }));
      if (h) { taken.push(h.socket); if (respectWounds) wounds++; }
    }
    return taken;
  };
  const shipped = run(true);
  // ⚠️ THE CONTROL, AND IT IS ALSO THE NUMBER THAT SAYS WHY THE CLAUSE EXISTS. Defeat the
  // `wounds === 0` guard and the same body, standing in the same place, loses this many.
  const unguarded = run(false);

  note(`shipped: ${shipped.length} limb(s) — ${shipped.join(', ') || 'none'}`);
  note(`control (wounds clause defeated): ${unguarded.length} — ${unguarded.join(', ')}`);
  if (unguarded.length <= 1) {
    fail('a collapse can never take the second part', `the control only took ${unguarded.length} — the guard has nothing to guard against on this drive and the check is vacuous`);
  } else if (shipped.length !== 1) {
    fail('a collapse can never take the second part', `${shipped.length} limbs came off one drive with the guard in place`);
  } else {
    pass('a collapse can never take the second part',
      `1 limb across ${ALL.length} events from a body that never moved, against ${unguarded.length} with the guard defeated — so the reachable worst case is three limbs on, which is gait 'walk' or 'limp' and can always fetch and refit. 'down' (arms 0 + legs 0) is unreachable by construction`);
  }
}

// =============================================================================================
// L8 — THE ABLATION ARM
// =============================================================================================
head('L8 — the whole mechanic is one switch, and it really is off when it is off');
{
  const on = qualifying.filter((e) => collapseLimbHit(e, under(e, 0.60), { ...COLLAPSE_LIMB, on: true })).length;
  const off = qualifying.filter((e) => collapseLimbHit(e, under(e, 0.60), { ...COLLAPSE_LIMB, on: false })).length;
  note(`on: ${on} · off: ${off}`);
  if (!on) fail('`?limbs=0` ablates the rule', 'the ON arm took nothing — vacuous');
  else if (off) fail('`?limbs=0` ablates the rule', `${off} limbs still came off with the rule ablated`);
  else pass('`?limbs=0` ablates the rule', `${on} → 0 on the identical event stream, so every instrument has a real control arm`);
}

// =============================================================================================
// L9 — DETERMINISM
// =============================================================================================
head('L9 — a pure function of the event and the pose');
{
  const transcript = (dx) => ALL.map((e) => {
    const h = collapseLimbHit(e, body({ x: e.x + dx, z: 0.60 }));
    return h ? `${e.blow}:${h.socket}:${f3(h.out)}:${f3(h.lat)}` : '';
  }).join(',');
  const a = transcript(0), b = transcript(0);
  // ⚠️ THE CONTROL. Two identical strings prove nothing unless the comparison can see a
  // difference — move the body one millimetre and the transcript must change.
  const c = transcript(0.001);
  note(`identical arms match: ${a === b} · 1 mm perturbation differs: ${a !== c}`);
  if (a !== b) fail('the rule is deterministic', 'two identical runs disagreed');
  else if (a === c) fail('the rule is deterministic', 'a 1 mm move changed nothing — the transcript is not sensitive enough to prove anything');
  else pass('the rule is deterministic', `${ALL.length} events, byte-identical across two runs in one process, and a 1 mm body move does change it`);
}

// =============================================================================================
// L10 — THE WALL WARNS YOU FIRST (2026-08-10), AND WHAT THE WHOLE THING COSTS IN A REAL SESSION
// =============================================================================================
head('L10 — the blow that BREAKS the arch is free, and a real dig no longer nags');
{
  const warned = qualifying.filter((e) => e.warned);
  const fresh = qualifying.filter((e) => !e.warned);
  const shipped = qualifying.filter((e) => collapseLimbHit(e, under(e, 0.60)));
  // ⚠️ THE CONTROL, AND IT IS THE RULE AS IT SHIPPED LAST NIGHT. `warned: false` in the table
  // restores the old behaviour on the identical stream; it MUST fire on the arch-break bites
  // that the shipped arm now refuses, or the clause is doing nothing and this check is a lie.
  const old = { ...COLLAPSE_LIMB, warned: false };
  const ctrl = qualifying.filter((e) => collapseLimbHit(e, under(e, 0.60), old));
  const onlyOld = ctrl.filter((e) => !shipped.includes(e));

  /**
   * 🎯 **AND THE NUMBER JOHN ASKED FOR: HOW OFTEN DOES IT FIRE IN A SESSION, NOT IN A STAGED
   * HIT.** 90 blows is `limb-collapse`'s own drive length. The body never moves and refits
   * INSTANTLY, which is the worst case the mechanic can be put in — the real game disarms you
   * and makes you walk, so this over-counts on purpose.
   */
  const session = (z, blows, policy, T = COLLAPSE_LIMB) => {
    let n = 0;
    for (const e of drive(policy, blows)) if (e.cells > 0 && collapseLimbHit(e, under(e, z), T)) n++;
    return n;
  };
  const row = (T) => [0.60, 0.80, 1.00, 1.30]
    .map((z) => `${f2(z)}m ${session(z, 90, 'undercut', T)}u/${session(z, 90, 'random', T)}r`).join(' · ');

  note(`of ${qualifying.length} bites, ${warned.length} came off a piece that had ALREADY let go and ${fresh.length} were the blow that broke the arch`);
  note(`at 0.60 m the shipped rule takes ${shipped.length}, the pre-2026-08-10 rule takes ${ctrl.length}`
    + ` — ${onlyOld.length} of them arch-break bites the player could not have avoided`);
  note(`🎯 A REAL 90-BLOW DIG, limbs taken (undercut/scatter policy, worst case):`);
  note(`   shipped:  ${row(COLLAPSE_LIMB)}`);
  note(`   as shipped 2026-08-09: ${row({ ...COLLAPSE_LIMB, depth: 1.05, inset: -(RADIUS + 0.10), warned: false })}`);

  if (!fresh.length) {
    fail('the wall warns you before it takes anything', 'this drive produced no arch-break bite at all — the clause has nothing to refuse and the check is vacuous');
  } else if (!ctrl.length) {
    fail('the wall warns you before it takes anything', 'the control arm took nothing either — the comparison is blind');
  } else if (!onlyOld.length) {
    fail('the wall warns you before it takes anything',
      `\`warned\` refused nothing the old rule admitted: shipped ${shipped.length}, control ${ctrl.length} — the clause is dead code`);
  } else if (shipped.some((e) => !e.warned)) {
    fail('the wall warns you before it takes anything', 'a bite that broke its own arch still took a limb');
  } else {
    pass('the wall warns you before it takes anything',
      `every one of the ${shipped.length} bites that take a limb had been on screen hanging since an earlier blow; the ${onlyOld.length} that were their own arch break are refused, and those are the ones taken from a stance `
      + `\`WEAPON_RANGE.sledge\` forces (the skirting is only reachable from ≤ 0.90 m). Turning the clause off on the identical stream takes ${ctrl.length}, so it is the clause doing it`);
  }
}

// =============================================================================================
head(`\n  ${passN} passed · ${failN} failed`);
process.exit(failN ? 1 : 0);
