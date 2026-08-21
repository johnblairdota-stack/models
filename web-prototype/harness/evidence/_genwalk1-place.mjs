#!/usr/bin/env node
/**
 * _genwalk1-place.mjs — ASK `spaces.js` WHICH PLACEMENTS IT WILL ACTUALLY EMIT.
 *
 * `genwalk-1`, 2026-08-11. Read-only. It imports the SHIPPED `src/game/spaces.js` and calls the
 * shipped `placeRoom`; it does not restate the transform. `house-packing.md` §9.4b's four claims
 * about a generated placement are prose, and three of them are load-bearing for the choice between
 * "rooms never turn" (arm A) and "turned rooms supported" (arm B). This settles them off the code.
 *
 * THE CLAIMS UNDER TEST, verbatim from §9.4b:
 *   1. "`sp.columns` is axis-locked ... `placeRoom` throws rather than emitting a colonnade on the
 *      wrong axis" — so which turns throw, and which room?
 *   3. "`HOUSE_PLAN`'s `at[1]` is ... 0 in all six slots" — still true?
 *   + the unstated one that decides arm A's variety budget: is a HALF turn (180 deg) free? It does
 *     not swap the footprint's axes and it leaves `f.s === 0`, so the colonnade guard should not
 *     fire — which would give arm A two orientations per room instead of one, for nothing.
 *
 * 🚨 CONTROLS, RUN EVERY RUN. A throw-counting probe passes trivially if everything throws, and a
 * "does not throw" probe passes trivially if the call never happened.
 *   K1  the shipped `HOUSE_PLAN` must place with ZERO throws (if it throws, the tree is broken,
 *       not the claim).
 *   K2  a slot naming an unknown room type MUST throw — the probe can see a failure at all.
 *   K3  a 180-degree turn must MOVE at least one dressing coordinate — otherwise "180 is free"
 *       is "180 does nothing" and buys no variety.
 *
 * Usage:  node harness/evidence/_genwalk1-place.mjs
 */

import { ROOMS, HOUSE_PLAN, placeRoom, roomsFromPlan } from '../../src/game/spaces.js';

let pass = 0, fail = 0;
const ok = (id, cond, why) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${id}  ${why}`); };

const tryPlace = (room, turns) => {
  try {
    const row = placeRoom({ id: `t.${room}.${turns}`, name: 'T', room, at: [0, 0, 0], turns });
    return { ok: true, row };
  } catch (e) { return { ok: false, err: String(e.message || e) }; }
};

const TYPES = Object.keys(ROOMS);
console.log(`\n_genwalk1-place — room library: ${TYPES.join(', ')}\n`);

// ---- K1: the shipped plan places -------------------------------------------------------------
let shipped = null, shippedErr = null;
try { shipped = roomsFromPlan(HOUSE_PLAN); } catch (e) { shippedErr = String(e.message || e); }
ok('K1 control', shipped?.length === 6, `the shipped HOUSE_PLAN places 6 rooms — got ${shipped?.length ?? shippedErr}`);

// ---- K2: the probe can see a failure ---------------------------------------------------------
let threw = false;
try { placeRoom({ id: 'bogus', name: 'B', room: 'no_such_room', at: [0, 0, 0], turns: 0 }); }
catch { threw = true; }
ok('K2 control', threw, 'an unknown room type throws — the probe can observe a failure');

// ---- P1/P2: which (type, turns) pairs place? -------------------------------------------------
console.log('\n  placement matrix — . = places, X = throws\n');
console.log('           turns:   0     1     2     3     (1 and 3 swap the footprint axes)');
const throwsBy = { 0: [], 1: [], 2: [], 3: [] };
for (const t of TYPES) {
  const cells = [0, 1, 2, 3].map((k) => {
    const r = tryPlace(t, k);
    if (!r.ok) throwsBy[k].push(t);
    return (r.ok ? '.' : 'X').padStart(6);
  });
  console.log(`  ${t.padEnd(16)}${cells.join('')}`);
}
ok('P1 turns 0 places every type', throwsBy[0].length === 0, `throws: [${throwsBy[0]}]`);
ok('P1 turns 2 places every type', throwsBy[2].length === 0,
  `HALF TURNS ARE FREE — throws: [${throwsBy[2]}]`);
ok('P2 quarter turns throw ONLY on the colonnade', throwsBy[1].length === 1 && throwsBy[1][0] === 'ballroom'
  && throwsBy[3].length === 1 && throwsBy[3][0] === 'ballroom',
  `turns 1 throws: [${throwsBy[1]}]  turns 3 throws: [${throwsBy[3]}] — everything else already turns`);

// name the message, so the report quotes the code rather than the doc
const bt = tryPlace('ballroom', 1);
console.log(`\n  the throw, verbatim:\n    ${bt.err}\n`);

// ---- P2b: the footprint really does swap on a quarter turn -----------------------------------
const g0 = tryPlace('gallery', 0).row, g1 = tryPlace('gallery', 1).row, g2 = tryPlace('gallery', 2).row;
const span = (r) => [+(r.x1 - r.x0).toFixed(2), +(r.z1 - r.z0).toFixed(2)];
console.log(`  gallery footprint  turns 0 ${span(g0)}   turns 1 ${span(g1)}   turns 2 ${span(g2)}`);
ok('P2b quarter turn swaps the footprint', span(g1)[0] === span(g0)[1] && span(g1)[1] === span(g0)[0],
  'so a no-rotation arm loses the north-south gallery, which is the variety it costs');
ok('P2c half turn keeps the footprint', span(g2)[0] === span(g0)[0] && span(g2)[1] === span(g0)[1],
  'a half turn is a re-DRESS, not a re-shape — which is why it is free');

// ---- K3: a half turn is not a no-op ----------------------------------------------------------
const key0 = g0.lights?.key?.pos, key2 = g2.lights?.key?.pos;
const moved = !!key0 && !!key2 && key0.some((v, i) => Math.abs(v - key2[i]) > 1e-6);
ok('K3 control', moved, `180 deg MOVES the rig: key ${JSON.stringify(key0)} -> ${JSON.stringify(key2)}`);

// ---- P3: at[1] is 0 in all six slots ---------------------------------------------------------
const ys = HOUSE_PLAN.map((sl) => sl.at[1] ?? 0);
ok('P3 §9.4b item 3', ys.every((y) => y === 0), `HOUSE_PLAN at[1] = [${ys}] — two storeys stay unwired at zero cost`);

// ---- P4: which types carry a colonnade at all ------------------------------------------------
const withCols = TYPES.filter((t) => ROOMS[t].columns);
ok('P4 the blocker is ONE room', withCols.length === 1 && withCols[0] === 'ballroom',
  `types with sp.columns: [${withCols}] — arm B's colonnade work is scoped to one library entry`);

console.log(`\n  ${pass} pass, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
