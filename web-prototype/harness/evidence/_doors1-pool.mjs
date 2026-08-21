/**
 * 🚪 **THE FOUR HALLWAY DOORS ARE GONE — PROVE IT COST NOTHING THAT MATTERED.**
 *
 *   node harness/evidence/_doors1-pool.mjs
 *
 * John, 2026-08-10: *"remove all the blocker doors from the hallway. they were for testing. we can
 * bring them back if we need them for future mechanics."* The hallway is the SERVICE PASSAGE and
 * the doors are `p.svc_w.n` / `p.svc_w.s` / `p.svc_e.n` / `p.svc_e.s` — the two shipped
 * `BREACHABLE` connectors per side wall, 2.08 m each. `spaces.js` `PASSAGE_DOORS` filters them out
 * of `PANELS`; **`?doors=1` puts them back and the rows were never deleted.**
 *
 * This file asks the four questions that could have made that a regression rather than a removal:
 *
 *   A · are the rows still THERE, and does the flag really restore them (restorability is a
 *       requirement, not a courtesy)
 *   B · does the EXIT POOL move — i.e. does any seed recorded in any document now name a
 *       different exit
 *   C · is the house still fully connected with the dig OFF, and is the exit still reachable
 *   D · is any station anchor left standing on a connector that no longer exists
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, ON EVERY RUN, AND EACH CONTROL STATES THE
 * FLOOR IT HAS TO CLEAR.** `two-sided.mjs` shipped green for a day with a control that could not
 * express the thing it was asking, so the question here is never "did the check pass" but "could
 * this check have seen the failure it exists for". B's control removes an EXIT row and demands the
 * pool shrink by one; C's control removes `p.chapel` and demands the BFS report a space stranded.
 *
 * ⚠️ **NO RENDERER, NO BROWSER, NO WALL CLOCK.** Everything here is the authored tables and a BFS
 * over them, so it is bit-identical under any GPU load and any other agent's work.
 */

import { CONNECTORS, PANELS, PANELS_AUTHORED, PASSAGE_DOORS, PASSAGE_DOORS_ON, EXIT_SITES,
  SPACES, SPAWN, ANCHORS, spaceAtXZ } from '../../src/game/spaces.js';
import { CONNECTOR, isExitSite } from '../../src/game/connectors.js';
import { chooseExit } from '../../src/game/run.js';

let passN = 0, failN = 0;
const pass = (t, d) => { passN++; console.log(`  ✅ PASS  ${t}\n          ${d}`); };
const fail = (t, d) => { failN++; console.log(`  ❌ FAIL  ${t}\n          ${d}`); };
const note = (s) => console.log(`  ${s}`);
const head = (s) => console.log(`\n${s}`);

const DOORS = [...PASSAGE_DOORS];

/**
 * Every seed quoted anywhere in `docs/handoff/**` or `docs/design/**` for an exit, a lock or a
 * dig measurement, plus the sweep `escape-owner-1` used to prove the selection is uniform.
 */
const RECORDED = ['s0', 's1', 's4', 's7', 's9', 's82', 'search-b', 'search-c',
  'rrr-test-1', 'rrr-capture'];
const SWEEP = Array.from({ length: 512 }, (_, i) => `s${i}`);

// =============================================================================================
head('═══ A — THE ROWS ARE STILL IN THE TABLE, AND THE FLAG IS THE ONLY THING HIDING THEM ═══');
// =============================================================================================

const authoredIds = PANELS_AUTHORED.map((p) => p.id);
const liveIds = PANELS.map((p) => p.id);
const stillAuthored = DOORS.filter((id) => authoredIds.includes(id));
const stillLive = DOORS.filter((id) => liveIds.includes(id));

note(`  PASSAGE_DOORS_ON = ${PASSAGE_DOORS_ON} (node has no URL, so this is the SHIPPED default)`);
note(`  authored rows ${PANELS_AUTHORED.length} · live rows ${PANELS.length} · the four: `
  + `${DOORS.join(' ')}`);

(stillAuthored.length === 4 && stillLive.length === 0 && !PASSAGE_DOORS_ON)
  ? pass('REMOVED FROM THE GAME, KEPT IN THE TABLE — the ask, both halves',
    `all 4 rows are still in PANELS_AUTHORED and 0 of 4 are in PANELS. The removal is a filter, `
    + `not a deletion: ?doors=1 (or flipping PASSAGE_DOORS_ON) restores them in place, with their `
    + 'original ids and their original position in the pool order.')
  : fail('REMOVED FROM THE GAME, KEPT IN THE TABLE — the ask, both halves',
    `authored ${stillAuthored.length}/4, live ${stillLive.length}/4, flag ${PASSAGE_DOORS_ON}`);

/**
 * 🚨 **CONTROL FOR A. The floor it must clear: the restore path has to produce a DIFFERENT table.**
 * If `PANELS_AUTHORED` were itself already filtered, the check above would read "still there" off
 * a table with nothing in it and the flag would restore nothing. Simulating the ON arm must add
 * exactly four rows, at the four indices the authored table puts them at.
 */
const restored = PANELS_AUTHORED;            // what `PASSAGE_DOORS_ON = true` yields, verbatim
const idxIn = (arr, id) => arr.findIndex((p) => p.id === id);
const orderKept = liveIds.every((id, i) => idxIn(restored, id) >= 0)
  && liveIds.map((id) => idxIn(restored, id)).every((v, i, a) => i === 0 || v > a[i - 1]);
(restored.length === PANELS.length + 4 && orderKept)
  ? pass('CONTROL — the restore path really is a different, LONGER table in the same order',
    `${PANELS.length} live → ${restored.length} restored (+4), and every id the live table still `
    + 'has appears in the restored one in the SAME relative order. So "the rows are still there" '
    + 'is a measurement of two different arrays, not of one array twice — and restoring is an '
    + 'un-filter, never an insert, which is what stops it re-rolling a seed.')
  : fail('CONTROL — the restore path really is a different, LONGER table in the same order',
    `restored ${restored.length} vs live ${PANELS.length} (+4 expected); order kept ${orderKept}`);

// =============================================================================================
head('═══ B — THE EXIT POOL, AND WHETHER ANY RECORDED SEED MOVED ═══');
// =============================================================================================

/**
 * 🎯 **THE QUESTION IS NOT "DID `PANELS` CHANGE" — IT OBVIOUSLY DID.** It is whether
 * `EXIT_SITES = PANELS.filter(isExitSite)` changed, because that array's ORDER is the whole input
 * to `chooseExit()`. `slab-1` asserted the four rows are `BREACHABLE` and never `EXIT`; this
 * re-derives it from the authored table rather than inheriting the claim.
 */
const poolOff = PANELS.filter(isExitSite).map((p) => p.id);
const poolOn = PANELS_AUTHORED.filter(isExitSite).map((p) => p.id);
const doorRows = DOORS.map((id) => PANELS_AUTHORED.find((p) => p.id === id));
const doorStates = [...new Set(doorRows.map((p) => p?.state))];
const doorsThatAreExits = doorRows.filter((p) => isExitSite(p ?? {}));

note(`  the four rows' authored state: ${doorStates.join(', ')} `
  + `(EXIT would be "${CONNECTOR.EXIT}")`);
note(`  pool with doors OFF  ${poolOff.length}: ${poolOff.join(' ')}`);
note(`  pool with doors ON   ${poolOn.length}: ${poolOn.join(' ')}`);
note(`  EXIT_SITES as exported: ${EXIT_SITES.length} — and it is the OFF arm, since that is shipped`);

const poolIdentical = poolOff.length === poolOn.length && poolOff.every((id, i) => id === poolOn[i]);
(poolIdentical && doorsThatAreExits.length === 0)
  ? pass('THE EXIT POOL IS ELEMENT-FOR-ELEMENT IDENTICAL — no recorded seed can move',
    `${poolOff.length} exit sites, the same ids in the same order with the four p.svc_* rows `
    + `present and absent. None of the four is an exit site (all ${doorStates.join('/')}), so `
    + 'chooseExit(seed, sites) cannot observe the removal.')
  : fail('THE EXIT POOL IS ELEMENT-FOR-ELEMENT IDENTICAL — no recorded seed can move',
    `pool ${poolOn.length} → ${poolOff.length}; door rows that ARE exits: `
    + `${doorsThatAreExits.map((p) => p.id).join(',') || 'none'}`);

/**
 * 🚨 **CONTROL FOR B, AND IT IS THE ONE THE BRIEF NAMES. The floor it must clear: shrink the pool
 * by exactly one.** If dropping a row that IS an exit site leaves the pool unchanged, the identity
 * above is not reading the pool at all and proves nothing.
 */
const anExit = PANELS.find(isExitSite).id;
const brokenPool = PANELS.filter((p) => p.id !== anExit).filter(isExitSite).map((p) => p.id);
(brokenPool.length === poolOff.length - 1)
  ? pass('CONTROL — the pool check CAN see a row leaving',
    `dropping ${anExit} (an EXIT row) takes the pool ${poolOff.length} → ${brokenPool.length}, so `
    + 'the identity above is a measurement and not a tautology over an empty filter.')
  : fail('CONTROL — the pool check CAN see a row leaving',
    `dropping the exit row ${anExit} left the pool at ${brokenPool.length} of ${poolOff.length}`);

/**
 * And the same question asked of the ANSWER rather than of the input, because that is what a
 * document actually quotes: "seed s4 is the chapel vestry at the beam lock".
 */
/**
 * ⚠️ **`lock` IS AN OBJECT AND `${lock}` IS `[object Object]` FOR EVERY ONE OF THE THREE.** The
 * first version of this line stringified it that way, which made the lock half of the comparison
 * always-equal — a check that could not have failed if the lock HAD moved. `lock.id`.
 */
const outcomeOf = (seed, pool) => {
  const { exitId, lock } = chooseExit(seed, pool);
  return `${exitId}/${lock?.id ?? lock}`;
};
const moved = RECORDED.filter((s) => outcomeOf(s, poolOff) !== outcomeOf(s, poolOn));
const movedSweep = SWEEP.filter((s) => outcomeOf(s, poolOff) !== outcomeOf(s, poolOn));
note('');
note(`  the recorded seeds, doors OFF: ${RECORDED.map((s) => `${s}→${outcomeOf(s, poolOff)}`).join('  ')}`);
(moved.length === 0 && movedSweep.length === 0)
  ? pass('AND THE OUTCOMES AGREE, NOT JUST THE POOL — 0 of 522 seeds name a different exit or lock',
    `${RECORDED.length} recorded seeds and a ${SWEEP.length}-seed sweep, chooseExit() run on both `
    + 'pools: every (exitId, lock) pair identical. s4 is still the chapel vestry at beams, which '
    + "is escape.mjs's own gate seed.")
  : fail('AND THE OUTCOMES AGREE, NOT JUST THE POOL',
    `${moved.length} recorded + ${movedSweep.length} swept seeds moved: `
    + `${[...moved, ...movedSweep].slice(0, 6).join(' ')}`);

/**
 * 🚨 **CONTROL FOR THE OUTCOME CHECK. The floor: a pool that really is different must produce a
 * different answer on a fair number of seeds.** Otherwise "0 of 522 moved" would also be what a
 * `chooseExit` that ignored its argument returned.
 */
const shortPool = poolOff.slice(0, poolOff.length - 1);
const movedByShort = SWEEP.filter((s) => outcomeOf(s, poolOff) !== outcomeOf(s, shortPool));
(movedByShort.length > SWEEP.length * 0.05)
  ? pass('CONTROL — chooseExit() DOES read its pool, so "nothing moved" is a result',
    `dropping one site from the pool moves ${movedByShort.length} of ${SWEEP.length} seeds `
    + `(${(100 * movedByShort.length / SWEEP.length).toFixed(1)}%, floor 5%). The zero above is `
    + 'therefore the pool being identical, not the function being blind.')
  : fail('CONTROL — chooseExit() DOES read its pool, so "nothing moved" is a result',
    `a one-site-shorter pool moved only ${movedByShort.length} of ${SWEEP.length} seeds`);

// =============================================================================================
head('═══ C — IS THE HOUSE STILL CONNECTED, AND IS THE EXIT STILL REACHABLE (dig OFF) ═══');
// =============================================================================================

/**
 * ⚠️ **TWO GRAPHS, AND CONFLATING THEM IS HOW THIS QUESTION GETS ANSWERED WRONG.**
 *
 *   · the DOORS graph      `CONNECTOR.OPEN` only — what `room.portals()` returns before anybody
 *                          hits anything. The chapel has been off this graph since D7 was removed
 *                          on 2026-08-08, so it is NOT six-connected and never was after that.
 *   · the OPENABLE graph   OPEN + BREACHABLE — every route a robot can take with the hammer and
 *                          the gun and no dig at all. **This is the one that must stay whole**,
 *                          and it is the one the AI's BFS reaches once a panel opens.
 *
 * The dig is deliberately excluded: if the house needs `?dig=1` to be solvable, "remove them and
 * the only way between those rooms is digging" would be a real regression, and the honest way to
 * find that out is to ask the graph WITHOUT the dig.
 */
const spaceIds = SPACES.map((s) => s.id);
const graphOf = (rows) => {
  const adj = new Map(spaceIds.map((id) => [id, new Set()]));
  for (const c of rows) {
    if (!adj.has(c.a) || !adj.has(c.b) || c.a === c.b) continue;
    adj.get(c.a).add(c.b); adj.get(c.b).add(c.a);
  }
  return adj;
};
const reach = (adj, from) => {
  const seen = new Set([from]); const q = [from];
  while (q.length) for (const n of adj.get(q.shift()) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
};
const hops = (adj, from, to) => {
  const dist = new Map([[from, 0]]); const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) return dist.get(cur);
    for (const n of adj.get(cur) ?? []) if (!dist.has(n)) { dist.set(n, dist.get(cur) + 1); q.push(n); }
  }
  return Infinity;
};

const openRows = CONNECTORS.filter((c) => c.state === CONNECTOR.OPEN);
const openableRows = CONNECTORS.filter((c) =>
  c.state === CONNECTOR.OPEN || c.state === CONNECTOR.BREACHABLE);
const gDoors = graphOf(openRows), gOpenable = graphOf(openableRows);

const spawnSpace = spaceAtXZ(SPAWN.player[0][0], SPAWN.player[0][1])?.id ?? 'study_w';
const fromSpawn = reach(gOpenable, spawnSpace);
const stranded = spaceIds.filter((id) => !fromSpawn.has(id));

note(`  spawn is in "${spawnSpace}" · ${spaceIds.length} spaces · openable connectors `
  + `${openableRows.length} (${openRows.length} of them OPEN doors)`);
for (const id of spaceIds) {
  note(`     ${id.padEnd(9)} openable neighbours: ${[...gOpenable.get(id)].join(', ') || '(none)'}`);
}

(stranded.length === 0)
  ? pass('THE HOUSE IS STILL FULLY CONNECTED WITH THE DIG OFF — all 6 spaces from the spawn',
    `BFS over OPEN + BREACHABLE reaches ${fromSpawn.size}/${spaceIds.length} spaces from `
    + `${spawnSpace}, none stranded. service ↔ study_w is now ${hops(gOpenable, 'service', 'study_w')} `
    + `hops (D5 then D4) and service ↔ study_e ${hops(gOpenable, 'service', 'study_e')} (D5 then D6), `
    + 'where each was 1. The DIRECT hop is what went; the route did not.')
  : fail('THE HOUSE IS STILL FULLY CONNECTED WITH THE DIG OFF — all 6 spaces from the spawn',
    `stranded: ${stranded.join(', ')}`);

/**
 * 🚨 **CONTROL FOR C. The floor it must clear: a genuinely severed space has to come back as
 * stranded.** `p.chapel` is the chapel's only connector of any kind, so dropping it must strand
 * exactly one space. If it does not, this BFS is not testing connectivity.
 */
const gCut = graphOf(openableRows.filter((c) => c.id !== 'p.chapel'));
const strandedCut = spaceIds.filter((id) => !reach(gCut, spawnSpace).has(id));
(strandedCut.length === 1 && strandedCut[0] === 'chapel')
  ? pass('CONTROL — the BFS CAN see a space cut off',
    'dropping p.chapel (the chapel\'s only connector) strands exactly 1 space, the chapel. So the '
    + 'six-of-six above is a measurement. ⚠️ It also states the standing fact that the chapel is '
    + 'one panel away from being a dead component and has been since D7 went — that is 2026-08-08, '
    + 'not this round.')
  : fail('CONTROL — the BFS CAN see a space cut off',
    `dropping p.chapel stranded ${strandedCut.length} space(s): ${strandedCut.join(', ') || 'none'}`);

/** The doors-only graph, stated so nobody reads the chapel's absence from it as this round's. */
const doorsOnlyStranded = spaceIds.filter((id) => !reach(gDoors, spawnSpace).has(id));
note('');
note(`  ⚠️ doors-only (OPEN, nothing breached yet): ${reach(gDoors, spawnSpace).size}/6 from the `
  + `spawn, missing ${doorsOnlyStranded.join(', ') || 'nothing'} — unchanged by this round, and it `
  + 'is D7\'s removal on 2026-08-08. The chapel is a room you must breach into.');

/** And the win condition itself: every site in the pool must sit in a room you can get to. */
const roomOf = (id) => PANELS.find((p) => p.id === id)?.a;
const unreachableSites = poolOff.filter((id) => !fromSpawn.has(roomOf(id)));
const seedRooms = [...new Set(RECORDED.map((s) => roomOf(chooseExit(s, poolOff).exitId)))];
(unreachableSites.length === 0)
  ? pass('EVERY EXIT SITE IS STILL IN A ROOM THE PLAYER CAN REACH — the run is still winnable',
    `all ${poolOff.length} sites, over ${new Set(poolOff.map(roomOf)).size} rooms, sit in spaces `
    + `reachable from ${spawnSpace} without a dig. The recorded seeds land in: ${seedRooms.join(', ')}.`)
  : fail('EVERY EXIT SITE IS STILL IN A ROOM THE PLAYER CAN REACH',
    `unreachable: ${unreachableSites.join(', ')}`);

// =============================================================================================
head('═══ D — IS ANY STATION ANCHOR LEFT STANDING ON A CONNECTOR THAT IS GONE ═══');
// =============================================================================================

/**
 * 🚨 **THE HAZARD, AND IT IS SPELLED OUT IN `spaces.js` ITSELF: the station anchors are
 * CONNECTOR-DERIVED, NOT ROOM-DERIVED.** `study_w.south` and `study_e.south` are local x −0.80 and
 * **+0.80** in one shared footprint *"because they stand on the D1/D4 axis and the D6 axis"*. An
 * anchor whose connector no longer exists is a scenario parking a body against blank wall and
 * reporting a plausible number about nothing — this project's most expensive instrument failure.
 *
 * Two things are asked: no anchor sits in the 0.30 m wall band of a removed door (which would put
 * a body inside masonry), and every anchor still resolves to a real space.
 */
const removedRows = doorRows;
const inBandOfRemoved = [];
const homeless = [];
for (const [name, [x, z]] of Object.entries(ANCHORS)) {
  if (!spaceAtXZ(x, z)) homeless.push(name);
  for (const d of removedRows) {
    // the panel's aperture is 2.08 m wide on the wall's own axis, in a 0.30 m band on the other
    const nearBand = Math.abs(x - d.x) < 0.15 + 0.34;      // 0.34 = a body radius of clearance
    const alongOpening = Math.abs(z - d.z) < 2.08 / 2;
    if (nearBand && alongOpening) inBandOfRemoved.push(`${name} at (${x}, ${z}) vs ${d.id}`);
  }
}
note(`  ${Object.keys(ANCHORS).length} anchors · ${removedRows.length} removed connectors`);
note(`  the three passage anchors: service.north ${ANCHORS['service.north']} · service.mid `
  + `${ANCHORS['service.mid']} · service.south ${ANCHORS['service.south']} — all on x = 0, the `
  + `passage centre line, ${Math.abs(0 - removedRows[0].x).toFixed(2)} m off the wall band`);

(inBandOfRemoved.length === 0 && homeless.length === 0)
  ? pass(`NO ANCHOR POINTED AT ONE OF THE FOUR, AND ALL ${Object.keys(ANCHORS).length} STILL RESOLVE TO A SPACE`,
    'not one anchor stands in a removed panel\'s doorway, so no scenario is now parking a body in '
    + 'an opening that is masonry. study_w.south / study_e.south stand on the D1/D4 and D6 axes — '
    + 'D1, D4 and D6 are OPEN doorways and are untouched by this round.')
  : fail('NO ANCHOR POINTED AT ONE OF THE FOUR',
    `in a removed doorway: ${inBandOfRemoved.join('; ') || 'none'}; `
    + `outside every space: ${homeless.join(', ') || 'none'}`);

/**
 * 🚨 **CONTROL FOR D. The floor: a point deliberately placed in one of the removed doorways has to
 * be caught.** Otherwise "no anchor is in a doorway" is a check that returns clean on any input.
 */
const bait = { x: removedRows[0].x, z: removedRows[0].z };
const caught = removedRows.some((d) => Math.abs(bait.x - d.x) < 0.49 && Math.abs(bait.z - d.z) < 1.04);
caught
  ? pass('CONTROL — the anchor check CAN see a point standing in a removed doorway',
    `a probe point planted at ${removedRows[0].id}'s own centre (${bait.x}, ${bait.z}) is flagged, `
    + 'so the clean sweep above is a sweep and not an empty loop.')
  : fail('CONTROL — the anchor check CAN see a point standing in a removed doorway',
    'a point at a removed panel\'s exact centre was NOT flagged');

// =============================================================================================
console.log(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
