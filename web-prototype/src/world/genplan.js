import { buildPlan, measure, W_MIN_S, WALL_T, L_DOOR, wallRuns } from '../../harness/genspike.mjs';
import { CONNECTOR, DOORWAY_W, DOORWAY_H, CONNECTOR_W, CONNECTOR_H } from '../game/connectors.js';
import { portalFacesPlayable } from '../game/portal-clearance.js';

/**
 * genplan.js — task-plangen-1. THE ONLY PLACE `harness/genspike.mjs`'S OUTPUT BECOMES
 * `src/game/spaces.js` TABLES.
 *
 * `genspike.mjs` is not moved and not copied (`docs/slices/task-plangen-1.md` Change 0) — this
 * file imports it by relative path and does the one conversion `house-packing.md` §9 names as
 * the risk: genspike's rects are STRUCTURAL, `spaces.js` rows are CLEAR, and the difference is
 * `WALL_T/2` = 0.15 m on every side.
 *
 * export function generatedPlan(seed) { return buildPlan(seed); }   -- kept for the Change 0
 * derisk import; `generatedTables` below is what `spaces.js` actually calls.
 *
 * 🚨 **DIVERGENCE FROM THE PLAN'S CHANGE 2, MEASURED AND REPORTED, NOT SILENT.** Change 2 says to
 * build a room's SPACES row by handing `placeRoom` (in `spaces.js`) the genspike rect's centre at
 * `turns: 0` and asserting the result matches the deflated rect to 1e-6. Measured on 6 seeds
 * (0..5): genspike's own `rot` flag (independent of this slice's `align`/`gap`/`waste` dials, and
 * NOT configurable through the exported `buildPlan`/`planFromRooms` API) swaps a room's
 * structural w/d at SELECTION time in 1-5 of every 6-8 rooms per plan, on EVERY seed tested — it
 * is not a rare case, it is most rooms. `placeRoom` at `turns: 0` always uses the library's
 * UNROTATED w/d, so for a `rot: true` room the "assert to 1e-6" in Change 2 would throw on a
 * majority of rooms in every plan, and "you must stop" there would make the §6b boot gate's "zero
 * `[spaces]` throws over 16 seeds" unreachable — verified, not assumed (see the report).
 *
 * Building via `placeRoom`'s canonical w/d anyway (swallowing the mismatch) is worse than
 * throwing: it silently produces a room whose footprint does not match the pocket the generator's
 * OWN corridor decomposition carved out for it (up to a 20 m discrepancy on one axis for a
 * gallery), which overlaps neighbours or opens an unintended gap — a "result-shaped output
 * instead of an error" that would fail this slice's own §6b B6 ("no two spaces overlap").
 *
 * **The fix taken:** every SPACES row this file emits, room or corridor alike, is built directly
 * from genspike's OWN placed+deflated rect (§2's structural->clear conversion, and nothing else)
 * — never re-derived from `ROOMS`/`placeRoom`. This guarantees a generated room's walls agree
 * exactly with the corridor/void decomposition and the door coordinates genspike computed around
 * it, on every seed, regardless of `rot`. The cost, paid deliberately: a generated room carries no
 * `order`/`lights`/`columns`/`pilasters` — no clerestory, no chimney breast, no colonnade — which
 * this slice's own bar ("rough is fine. ugly is fine.") accepts, and which keeps `turns: 0` true
 * in the only sense that still matters here (no quarter-turn geometry is ever built, so the
 * ballroom's colonnade throw noted in Change 2 can never fire — there is no `columns` field on
 * any generated row to throw over).
 *
 * 🚨 **KNOWN, MEASURED, NOT PAPERED OVER: 5 OF 16 SEEDS (0..15) LEAVE PART OF THE HOUSE
 * UNREACHABLE, AND EVERY ONE TRACES TO THE SAME CAUSE.** `coverFree()`'s grid decomposition
 * occasionally leaves a corridor rect **0.05-0.10 m wide (structural)** — thinner than one wall
 * band (0.30 m) — as the ONLY contact between two halves of the same corridor region. Such a
 * sliver cannot become a row (it deflates to a negative clear extent, §3 Change 2's own
 * structural/clear arithmetic) and there is no other candidate to bridge it, so the split is
 * real and is reported by `_plangen1-boot.mjs` B4, not hidden: seeds 3, 7, 12, 14 each lose 1-2
 * of 16-18 spaces; seed 5 loses 10 of 13 because the sliver happened to split the corridor
 * roughly in half. The other 11 of 16 seeds reach 100%. See the report for the tally.
 */

const OPEN = CONNECTOR.OPEN;
const EXIT = CONNECTOR.EXIT;
const HALF = WALL_T / 2;
const EPS = 1e-6;

export function generatedPlan(seed) { return buildPlan(seed); }

/** genspike STRUCTURAL rect -> `spaces.js` CLEAR extents. Task-plangen-1 §3 Change 2's conversion. */
function deflate(rect) {
  return { x0: rect.x0 + HALF, x1: rect.x1 - HALF, z0: rect.z0 + HALF, z1: rect.z1 - HALF };
}

const ROOM_LABEL = {
  gallery: 'THE GALLERY', ballroom: 'THE BALLROOM', study: 'THE STUDY',
  service: 'THE SERVICE PASSAGE', chapel: 'THE CHAPEL',
};

/**
 * A room region -> one SPACES row. `region.id` (`r0.gallery`, ...) is used verbatim.
 *
 * 🎨 **`roomType` AND `turns` ARE THE WHOLE OF WHAT THIS FILE CONTRIBUTES TO THE DRESSING, AND
 * THAT IS DELIBERATE** (`gendress-1`, 2026-08-15). John: *"a run generates a different mansion
 * each time, built from John's art rooms, and it looks like his art from inside."*
 *
 * The dressing itself — `order`, `pilasters`, `columns` — is attached in `spaces.js`, from
 * `ROOMS[roomType]`, because **`ROOMS` lives in `spaces.js` and `spaces.js` imports THIS file**;
 * importing back would be a cycle. Copying the five rooms' dressing fields into a table here
 * instead would be a second copy of `ROOMS` that drifts the first time anyone edits one — the
 * exact failure `localise-1` spent a slice removing. So this file says only *which library room
 * this is and how it was turned*, and the file that owns the library does the placing.
 *
 * · `roomType` is genspike's own `region.type`, the LIBRARY key. It matches `ROOMS`' keys
 *   because `genspike.mjs`'s `LIBRARY` was copied from `ROOMS` (its own header says so).
 * · `turns` is genspike's `rot` flag as a `HOUSE_PLAN` quarter turn: `rot` swaps a room's
 *   structural w/d at SELECTION time, which is exactly `placeRoom`'s `turns: 1`. It is not a
 *   free choice — it is a REPORT of what the generator already did to this rect, and `spaces.js`
 *   refuses to dress any row whose clear extents disagree with it.
 *
 * ⚠️ **THE FOOTPRINT IS UNTOUCHED.** This row is still built from genspike's own placed+deflated
 * rect and nothing else — see the divergence note at the top of this file. `roomType`/`turns` are
 * ADDED to the row; nothing reads them to compute a coordinate here.
 */
function roomRow(region) {
  const c = deflate(region.rects[0]);
  return {
    id: region.id, name: ROOM_LABEL[region.type] ?? region.type.toUpperCase(),
    x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1,
    storey: region.y1, floor: 'floor', wall: 'wall',
    roomType: region.type, turns: region.rot ? 1 : 0,
  };
}

/**
 * ⚠️ **DIVERGENCE FROM CHANGE 3, MEASURED AND REPORTED, NOT SILENT.** "DROP the alcoves" applied
 * unconditionally disconnects the region it is dropped from whenever the dropped alcove is the
 * ONLY bridge between two clusters of the region's other rects — genspike's own `groupRegions()`
 * unions a sub-minimum rect into whichever region it touches FIRST specifically so a corridor
 * stays topologically one piece; dropping it downstream un-does that on exactly the rects it was
 * protecting. Measured on 16 seeds (0..15) via `tmp_critic/_plangen_probe.mjs`: unconditional
 * dropping left **9-13 rooms/corridor-rects unreachable from spawn on 2 of 16 seeds** (seed 4:
 * 8/13, seed 5: 10/13) and a handful unreachable on 4 more — never zero, and the plan's own §6b
 * B4 is explicit that reachability must be asked of the BUILT house, not assumed. **The fix: an
 * alcove is dropped only when the region's other rects stay in ONE connected piece without it —
 * an alcove that is load-bearing for connectivity is kept as a (narrow) row instead**, greedily,
 * same idea as `groupRegions`' own "pass 1: merges that RESCUE a sub-minimum rect always win".
 */
function connectedComponents(rects, indices, contact) {
  const idx = new Set(indices);
  const seen = new Set();
  const comps = [];
  for (const start of indices) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    const q = [start];
    while (q.length) {
      const u = q.pop();
      for (const v of idx) {
        if (seen.has(v)) continue;
        if (contact(rects[u], rects[v])) { seen.add(v); comp.push(v); q.push(v); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** True iff `a` and `b` share a nonzero wall run — the same test `wallRunsOf` answers. */
function touch(a, b) { return wallRunsOf(a, b).some((r) => r.clear > EPS); }

/** Does `rect` own the wall line `(axis, at)` over `[lo, hi]`? Matches `wallRuns`'s own test. */
function rectHasBoundary(rect, axis, at, lo, hi) {
  const onLine = axis === 'x'
    ? (Math.abs(rect.x0 - at) < EPS || Math.abs(rect.x1 - at) < EPS)
    : (Math.abs(rect.z0 - at) < EPS || Math.abs(rect.z1 - at) < EPS);
  if (!onLine) return false;
  const [rLo, rHi] = axis === 'x' ? [rect.z0, rect.z1] : [rect.x0, rect.x1];
  return Math.min(rHi, hi) - Math.max(rLo, lo) > EPS;
}

/**
 * Which rect indices to keep: every non-alcove rect, plus every alcove in `mustKeep` (needed as
 * the specific rect a genspike door's `doorRun` lands on — see the divergence note above, second
 * half), plus the smallest further set of alcoves needed so the kept set is ONE connected piece.
 * Greedy: while the kept set has more than one component, promote whichever remaining alcove
 * touches the most components at once (a bridge), then repeat.
 */
function keepMaskFor(rects, mustKeep) {
  const isAlcove = rects.map((r) => Math.min(r.x1 - r.x0, r.z1 - r.z0) < W_MIN_S - EPS);
  // A sliver whose STRUCTURAL minDim doesn't clear one wall band (0.30 m) deflates to a zero or
  // negative clear extent — not a narrow room, a decomposition artefact. It can never be a row,
  // door-target or bridging need or not; the gap it leaves is reported by B4/B6, not papered over.
  const buildable = (i) => Math.min(rects[i].x1 - rects[i].x0, rects[i].z1 - rects[i].z0) > WALL_T + EPS;
  const kept = new Set(rects.map((_, i) => i).filter((i) => !isAlcove[i]));
  for (const i of mustKeep) if (isAlcove[i] && buildable(i)) kept.add(i);
  let pool = rects.map((_, i) => i).filter((i) => isAlcove[i] && buildable(i) && !kept.has(i));
  for (let guard = 0; guard < pool.length + 1; guard++) {
    const comps = connectedComponents(rects, [...kept], (a, b) => touch(a, b));
    if (comps.length <= 1) break;
    const compOf = new Map();
    comps.forEach((c, ci) => c.forEach((i) => compOf.set(i, ci)));
    let best = -1, bestSpan = 0;
    for (const a of pool) {
      const touched = new Set();
      for (const k of kept) if (touch(rects[a], rects[k])) touched.add(compOf.get(k));
      if (touched.size > bestSpan) { bestSpan = touched.size; best = a; }
    }
    if (best < 0) break;                          // no alcove bridges any remaining split — stop
    kept.add(best);
    pool = pool.filter((i) => i !== best);
  }
  return kept;
}

/**
 * A corridor region -> one SPACES row PER kept RECT (Change 3, with the alcove fix above).
 * Returns `{ rows, kept }` — `kept` is `[{rect, id}]` in `region.rects` order, for the
 * internal-joint and door-matching passes below to key off.
 */
function corridorRows(region, mustKeep) {
  const rows = [];
  const kept = [];
  const keepSet = keepMaskFor(region.rects, mustKeep);
  let i = 0;
  region.rects.forEach((rect, ri) => {
    if (!keepSet.has(ri)) return;                             // a true dead-end alcove: infill
    const id = `${region.id}.${i++}`;
    const c = deflate(rect);
    rows.push({
      id, name: 'THE PASSAGE', x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1,
      storey: region.y1, floor: 'floor', wall: 'wall',
    });
    kept.push({ rect, id });
  });
  return { rows, kept };
}

/**
 * genspike `axis` (the wall's NORMAL axis, `DIG_EDGES`' own convention) -> `spaces.js` PORTAL
 * `axis` (the WIDTH axis — the OTHER one). Verified against the shipped table: D1's wall stacks
 * gallery/study_w along z (genspike `normal:'z'`) and is authored `axis:'x'`.
 */
const widthAxisOf = (normalAxis) => (normalAxis === 'x' ? 'z' : 'x');
const rotYFor = (normalAxis) => (normalAxis === 'x' ? Math.PI / 2 : 0);

/** Connector row in the shape `portalFacesPlayable` reads, from a genspike wall run. */
function openingAt(a, b, run) {
  return {
    a, b, axis: widthAxisOf(run.axis),
    x: run.axis === 'x' ? run.at : (run.lo + run.hi) / 2,
    z: run.axis === 'x' ? (run.lo + run.hi) / 2 : run.at,
    w: DOORWAY_W,
  };
}

/**
 * `generatedTables(seed, opts)` — everything `spaces.js` needs under `GEN`.
 *
 * `opts` are the three placement dials (`align`/`gap`/`waste`) passed through unchanged, per
 * task-plangen-1 §3 Change 1.
 */
export function generatedTables(seed, opts = {}) {
  const plan = buildPlan(seed, opts);
  const { regions, edges, env } = plan;

  // Every canDoor edge's doorRun must land on a rect that survives into the SPACES table, on
  // BOTH sides — see the divergence note above corridorRows/keepMaskFor. Compute it up front so
  // an alcove that is the ONLY rect a door can land on is never dropped underneath it.
  const mustKeepFor = new Map();                  // region index -> Set<rect index>
  for (const e of edges) {
    if (!e.canDoor) continue;
    const run = e.runs[e.doorRun];
    for (const ri of [e.ai, e.bi]) {
      const R = regions[ri];
      if (R.kind !== 'corridor') continue;
      const hitIdx = R.rects.findIndex((rect) => rectHasBoundary(rect, run.axis, run.at, run.lo, run.hi));
      if (hitIdx < 0) continue;
      if (!mustKeepFor.has(ri)) mustKeepFor.set(ri, new Set());
      mustKeepFor.get(ri).add(hitIdx);
    }
  }

  const rows = [];                 // every SPACES row this plan emits
  const idFor = new Map();         // genspike region index -> row id, ROOMS only (1:1)
  const corridorOf = new Map();    // genspike region index -> { kept: [{rect,id}] }, CORRIDORS only
  let gi = 0;                      // door/portal id counter

  for (let i = 0; i < regions.length; i++) {
    const R = regions[i];
    if (R.kind === 'room') {
      const row = roomRow(R);
      rows.push(row);
      idFor.set(i, row.id);
    } else if (R.kind === 'corridor') {
      const { rows: crows, kept } = corridorRows(R, mustKeepFor.get(i) ?? new Set());
      rows.push(...crows);
      corridorOf.set(i, kept);
    }
    // void: no row — solid infill, exactly as the generator intends.
  }

  // ---- portals: one OPEN portal per canDoor edge, plus one at every internal corridor joint ----
  const portals = [];

  /** Resolve a genspike region index + a specific wall run to the row id that actually owns it. */
  const rowIdAtRun = (ri, run) => {
    if (idFor.has(ri)) return idFor.get(ri);                  // a room is always exactly one rect
    const kept = corridorOf.get(ri);
    if (!kept) return null;                                   // void, or a region with no kept rect
    const hit = kept.find((k) => rectHasBoundary(k.rect, run.axis, run.at, run.lo, run.hi));
    return hit ? hit.id : null;
  };

  /**
   * ⚠️ **A SECOND FIX FOUND BY THE BOOT GATE ITSELF, NOT BY INSPECTION — a `[room] buildWall:
   * overlapping cuts that do not nest` warning on `_plangen1-boot.mjs --worker --seed 6`.**
   * `DOORWAY_W` (1.90 m) is what an authored circulation door uses, but an authored door always
   * sits on a wall run with metres to spare either side of it. A synthesised internal-joint run
   * can be much shorter than that — measured on the seed that triggered it, two adjacent joints
   * on the SAME wall of one corridor rect had clear runs of **1.57 m and 0.56 m**, and a fixed
   * 1.90 m aperture centred on the 0.56 m one span 0.67 m past each end of its own run, into the
   * NEIGHBOURING joint's territory — two doorway cuts on one wall that overlap. **Fix: clamp the
   * aperture to `min(DOORWAY_W, run.clear)`, and skip a run too narrow to pass anyone at all**
   * (`clearWidth(c) > 0.4` is `spaces.js`'s own module-scope throw guard; a run clamped to or
   * below that could never have been built as a usable opening anyway).
   */
  /**
   * 🚪 **DOORS START SHUT — John, 2026-08-12, after walking the first generated seeds.**
   *
   *   *"I had a lot of freedom of movement on this map when I most expect to be stuck in a room
   *   with the hammer forcing you to make noise to leave."*
   *
   * Slice 1 emitted every portal `OPEN` on purpose, and that is what he is reversing. `?gendoors`
   * keeps the old arm alive: **`shut` (default)** puts a breachable leaf in every doorway BETWEEN
   * REGIONS; `open` is slice 1 byte-for-byte.
   *
   * 🚨 **A CORRIDOR'S INTERNAL JOINTS ARE NOT DOORS AND MUST STAY OPEN.** The second caller below
   * joins two RECTS OF THE SAME CORRIDOR — `genplan` emits one `SPACES` row per rect where
   * `genspike` has one region, so 54.8% of corridors are multi-rect. Shutting those would not
   * make the house harder, it would saw every corridor into a row of sealed boxes with a door
   * between each, which is neither a house nor what he asked for. **The state is therefore a
   * parameter of the call, never a constant of the file.**
   *
   * ⚠️ **BREACHABLE, NOT CHAINED, AND THAT IS DELIBERATE FOR NOW.** A chained leaf cannot be
   * forced by anyone, so a seeded mix of the two can strand a region behind doors nobody can
   * open — and nothing here gates that yet. `_plangen1-boot.mjs` B4 already measures reachability
   * and is the place that would have to say it is safe. Uniform breachable is the version whose
   * failure mode is "too easy", not "unfinishable".
   */
  /*
   * ⚠️ `opts.doors` OVERRIDES THE URL, AND IT EXISTS BECAUSE THE PARTY NIGHT HAS NO URL TO READ.
   *
   * The follow slot (`src/party/follow.js`) mounts on a CLOSED schema and `plan` is on its
   * forbidden list, so the mansion the TV renders cannot be steered from the address bar by
   * design. It still has to choose an arm, and for the party night that arm is `open`: the first
   * playable mission is "walk to the gallery and break a painting", not a dig test, and a seeded
   * mix of breachable leaves is exactly the shape that can strand the mission room (the note below
   * says so already). Same three-valued meaning as `?gendoors`, resolved from the call when the
   * caller states one. `views/game.js` passes nothing and keeps the URL behaviour byte for byte.
   */
  const SHUT_DOORS = opts.doors != null
    ? String(opts.doors) !== 'open'
    : (typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('gendoors') : null) !== 'open';
  const MIN_PASSABLE = 0.42;

  /**
   * 🚨 **A SHUT DOOR IS A `PANELS` ROW, NOT A `PORTALS` ROW WITH A DIFFERENT `state` — AND THE
   * FIRST VERSION OF THIS GOT IT WRONG IN A WAY THAT LOOKED RIGHT IN EVERY NUMBER I HAD.**
   *
   * `room.js:267` is `connectorDefs = [...PORTALS, ...panelDefs]`, but the panel build loop walks
   * **`panelDefs` only**. So the two lists are not two states of one thing:
   *
   *   `PORTALS`  an OPEN doorway — a hole, and a walkable edge in `pathPortals`
   *   `PANELS`   a door LEAF — geometry, a collider, a stage table, something to break
   *
   * Setting `state: BREACHABLE` on a PORTALS row took the door out of the walkable graph and
   * **never built anything in the gap**. Every plan-level count agreed it was shut (`_plangen1-boot`
   * B7 read walk 1 of 18) because those counts read the same table with the same filter. John
   * walked through it. `_genfix1-diag` D1, asked of the BUILT house, found the only non-dig panels
   * in the entire mansion were **3 exits**.
   *
   * ⚠️ **AND `dig.js` `genCutsOn` READS `gen.portals` TO KNOW WHERE THE DOORWAYS ARE**, so a door
   * that moves to `panels` and is not also visible there makes the slab table span straight across
   * an aperture — the one shape `buildWall`'s single sorted walk cannot represent. `genCutsOn` now
   * walks both lists; `w`/`h` are carried on the panel row for exactly that reason, and its own
   * `!(c.w > 0)` guard is what keeps the exit rows (which carry neither) out of it.
   */
  /**
   * 🚨 **A SHUT DOOR IS `CONNECTOR_W` x `CONNECTOR_H` AND NOTHING ELSE GETS A VOTE — the first
   * version of this row declared `min(DOORWAY_W, run.clear)` and every seed came back UNCLEAN.**
   *
   * `DOORWAY_W` (1.90) is the width of an OPEN doorway. A BREACHABLE connector is built by
   * `connectors.js` at **`CONNECTOR_W` 2.08 / `CONNECTOR_H` 2.68**, and it does not consult the
   * row's `w`. So the row told `genCutsOn` the hole was 1.90 wide, the slab stopped exactly at
   * *that* edge, and the real cut arrived **9 cm wider on each side** — two cuts overlapping
   * without either containing the other, which is the one shape `buildWall`'s single sorted walk
   * cannot represent. It shouted, on all 16 seeds: *"overlapping cuts that do not nest"*.
   * **That refusal branch was added this morning and this is the first thing it caught.**
   *
   * ⚠️ **Declaring the width is not the same as choosing it.** These two constants are what the
   * builder will actually use; the row now repeats them so the dig table and the geometry cannot
   * disagree. `canDoor` already guarantees a run of `L_DOOR` = 2.48 m (2.08 + two 0.20 jambs), so
   * 2.08 always fits — the clamp this replaces was never protecting an inter-region door.
   */
  const panels = [];
  const pushDoor = (a, b, run) => {
    if (run.clear < CONNECTOR_W + 1e-6) return;      // no room for the leaf the builder will make
    if (!portalFacesPlayable(rows, openingAt(a, b, run))) return;
    panels.push({
      id: `D.g${gi++}`, state: CONNECTOR.BREACHABLE, a, b,
      x: run.axis === 'x' ? run.at : (run.lo + run.hi) / 2,
      z: run.axis === 'x' ? (run.lo + run.hi) / 2 : run.at,
      rotY: rotYFor(run.axis), w: CONNECTOR_W, h: CONNECTOR_H,
    });
  };
  const pushPortal = (a, b, run, state = OPEN) => {
    const w = Math.min(DOORWAY_W, run.clear);
    if (w <= MIN_PASSABLE) return;                            // too narrow to ever pass — drop it
    if (!portalFacesPlayable(rows, openingAt(a, b, run))) return;
    portals.push({
      id: `D.g${gi++}`, state, a, b, axis: widthAxisOf(run.axis),
      x: run.axis === 'x' ? run.at : (run.lo + run.hi) / 2,
      z: run.axis === 'x' ? (run.lo + run.hi) / 2 : run.at,
      w, h: DOORWAY_H,
    });
  };

  for (const e of edges) {
    if (!e.canDoor) continue;
    const run = e.runs[e.doorRun];
    const a = rowIdAtRun(e.ai, run);
    const b = rowIdAtRun(e.bi, run);
    if (!a || !b) continue;                                   // the door run touched a dropped alcove
    // a door BETWEEN REGIONS — this is the one John wants shut. Shut = a PANEL (a leaf with a
    // collider); open = a PORTAL (a hole). Never the same row with a different `state`.
    // 🚪 And it is not a door if either landing is void / a sliver. Playtest: John walked
    // out of the mansion through an OPEN hole on a leftover envelope run.
    if (SHUT_DOORS) pushDoor(a, b, run); else pushPortal(a, b, run, OPEN);
  }

  for (const kept of corridorOf.values()) {
    if (kept.length < 2) continue;
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        for (const run of wallRunsOf(kept[i].rect, kept[j].rect)) {
          if (run.clear <= EPS) continue;
          pushPortal(kept[i].id, kept[j].id, run);
        }
      }
    }
  }

  // ---- exit-candidate panels: one per room with a long-enough envelope frontage --------------
  // ⚠️ `panels` is declared ABOVE, beside `pushDoor` — the shut inter-region doors are already in
  // it by the time we get here, and re-declaring it would have silently thrown them away.
  let xi = 0;
  for (let i = 0; i < regions.length; i++) {
    const R = regions[i];
    if (R.kind !== 'room') continue;
    const rect = R.rects[0];
    const sides = [
      { side: 'x0', axis: 'x', on: Math.abs(rect.x0 - env.x0) < EPS, at: rect.x0, lo: rect.z0, hi: rect.z1 },
      { side: 'x1', axis: 'x', on: Math.abs(rect.x1 - env.x1) < EPS, at: rect.x1, lo: rect.z0, hi: rect.z1 },
      { side: 'z0', axis: 'z', on: Math.abs(rect.z0 - env.z0) < EPS, at: rect.z0, lo: rect.x0, hi: rect.x1 },
      { side: 'z1', axis: 'z', on: Math.abs(rect.z1 - env.z1) < EPS, at: rect.z1, lo: rect.x0, hi: rect.x1 },
    ].filter((s) => s.on && (s.hi - s.lo - WALL_T) >= L_DOOR - EPS);
    if (!sides.length) continue;
    sides.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
    const s = sides[0];
    const mid = (s.lo + s.hi) / 2;
    const roomId = idFor.get(i);
    panels.push({
      id: `x.g${xi}`, a: roomId, b: 'outside',
      x: s.axis === 'x' ? s.at : mid, z: s.axis === 'x' ? mid : s.at,
      rotY: rotYFor(s.axis), state: EXIT,
      name: `THE ${(ROOM_LABEL[R.type] ?? R.type).replace(/^THE /, '')} DOOR ${xi}`,
      room: (ROOM_LABEL[R.type] ?? R.type).toLowerCase(),
    });
    xi++;
  }

  // ---- the light rig: one per emitted row -----------------------------------------------------
  // ⚠️ Runs LAST, because a space's `cool` is placed past one of its own doors and the door
  // tables above are what say where those are. See `lightRigFor`.
  attachLights(rows, portals, panels);

  // ---- spawn: task-plangen-1 §3 Change 5, then John 2026-08-23 --------------------------------
  const m = measure(plan);
  const rectCentre = (R) => {
    const r = R.rects[0];
    return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  };
  /**
   * 🕺 **THE BALLROOM IS THE STARTING ROOM.** `measure().spawn` stays the seeded pick — it is
   * what `--sweep` quotes as spawn→exit — but play spawn is the ballroom whenever the plan
   * has one. A 3-room subset that rolled no ballroom falls back to the metric spawn.
   */
  const rooms = regions.map((R, i) => ({ R, i })).filter((x) => x.R.kind === 'room');
  const ballI = rooms.find((x) => x.R.type === 'ballroom')?.i;
  const spawnI = ballI ?? m.spawn;
  const spawnRegion = regions[spawnI];
  const hunterPick = rooms.find((x) => x.i !== spawnI) ?? rooms[0];
  const spawnXZ = rectCentre(spawnRegion);
  const hunterXZ = rectCentre(hunterPick.R);

  return {
    plan, measure: m,
    spaces: rows,
    portals,
    panels,
    spawn: {
      player: [spawnXZ, spawnXZ],
      hunter: hunterXZ,
      capture: spawnXZ,
    },
  };
}

/**
 * Contact between exactly two rects (a wrapper on genspike's exported `wallRuns`, which only
 * ever reads `.rects` off its two arguments). Used for the internal joint inside one split
 * corridor region — genspike's own `edges` never sees this, because both rects share one region.
 */
function wallRunsOf(rectA, rectB) {
  return wallRuns({ rects: [rectA] }, { rects: [rectB] });
}

// =================================================================================================
// THE LIGHT RIG — `genlight-1`, 2026-08-15
// =================================================================================================

/**
 * 💡 **JOHN, PLAYING A GENERATED HOUSE: *"some times the lighting in the other room is off and
 * everything kind of looks dark grey."* THIS IS THAT.**
 *
 * 🚨 **THE MECHANISM IS WORSE THAN "GENERATED ROOMS FALL BACK TO A DEFAULT RIG", AND IT IS WORTH
 * ONE PARAGRAPH BECAUSE THE BRIEF I WAS GIVEN SAID THE MILDER THING.** `views/game.js`'s
 * `makeLightRig` builds its five lights ONCE and REPOSITIONS them per space — the count is fixed
 * on purpose, because `numPointLights` is a three.js program-cache key. Its `read(space)` opens
 * with:
 *
 *     const s = (box ? space?.lightsBox : null) ?? space?.lights;
 *     if (!s) return;                       // <- every generated space, every frame
 *
 * and its targets are constructed as bare `new THREE.Vector3()`. So with no `lights` on any row
 * the early return fires for every space, `apply(1)` lerps all four movable lights to **(0, 0, 0)**
 * on the first `snapTo`, and they never move again. That is not a default rig: on seed 0 the
 * generated envelope spans x 0…37, z 0…46, so the key, both warm points and the cool spend the
 * whole run parked in the void at one CORNER of the map, aimed at themselves. Everything a player
 * walks through is lit by the shared `fill` HemisphereLight and nothing else — a directionless
 * ambient over warm materials, which is exactly "dark grey".
 *
 * 🎯 **WHAT THIS FIXES IS THE LEVEL, NOT THE LOOK, AND EVERY CONSTANT BELOW IS AN AUTHORED
 * NUMBER OR A FIT TO THE FIVE AUTHORED RIGS.** Nothing here is a taste call; `spaces.js`'s six
 * hand-tuned entries are the training set and the header of each constant says which one it came
 * from. The two rules it may not break are `docs/slices/task-estate.md`'s, and they are numeric:
 * **never saturate the key — top-decile `(r−b)/L` ≤ 0.14, median pixel luminance 30–60.**
 * ⚠️ `GAUNTLET.md`: the locked art contains **no cool cells at all**; separation is
 * chroma-against-value, not hue opposition. So the key is the near-neutral `0xdfe6f4` —
 * `spaces.js` calls it *"the only near-neutral in this table"* and gives it to `service` and
 * `chapel` for precisely this reason — and never a warm wash.
 *
 * 🚨 **PRICE: NO NEW LIGHT, EVER.** These are table values for lights that already exist, so the
 * rendered `numPointLights` cannot move and no arm of this change can compile a program. That is
 * a claim, not an assumption — `harness/scenarios/_genlight1-rig.mjs` measures programs and draw
 * calls at ONE parked station with the rig flipped IN PLACE (never across a walk), and reads
 * **216 -> 216 -> 216** across the flip and back.
 *
 * ⚠️ **TWO SEPARATE ABLATIONS, AND THEY ARE NOT INTERCHANGEABLE.** `?genlight=0` emits no
 * `lights` key at all — it is the pre-2026-08-15 build exactly, and it needs its own page load
 * because `GEN` is module scope. The IN-SESSION flip is `_genlight1-rig`'s C1, which overwrites
 * every space's rig with an ORIGIN RIG; that reproduces the same lights-at-(0,0,0) state without
 * a reload, which is what makes the perf numbers a difference rather than two walks.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT MEASURED — seed 0, `?plan=gen&planseed=0`, quality `auto`, `grade.mjs` on `still.mjs`
 * frames taken at each space's own centre. `?genlight=0` is the BEFORE column.
 * ---------------------------------------------------------------------------------------------
 *
 *   station          median L        pixels at L<=2.6     darkest decile   top-decile (r−b)/L
 *   r0.ballroom     2.7 -> 57.3       47.5% -> 1.5%        0.2 -> 6.7        0.168 -> 0.181
 *   r1.gallery      2.8 -> 41.5       48.9% -> 0.5%        0.0 -> 14.2      -0.089 -> 0.450
 *   AUTHORED gallery, same protocol:  41.7 median · 2.0% black · top-decile 0.217
 *
 * ⚠️ **THESE ARE PARKED AT A ROOM'S CENTRE WITH WHATEVER YAW THE BOOM ARRIVES AT, SO THE SAME
 * BUILD MOVES A FEW L BETWEEN SESSIONS** — the ballroom read 52.5 on one run and 57.3 on the
 * next, the gallery 42.4 and 41.5. Quote them as a band, not a fixed point; the BEFORE/AFTER
 * ratio is 15–20x and swamps it. (The estate's own recorded figures were taken at AIMED
 * stations, which is why they are not directly comparable to these.)
 *
 * ✅ **THE LEVEL IS FIXED AND IT IS FIXED TO JOHN'S OWN ROOM.** 41.5 against the authored
 * gallery's 41.7, black share 48.9% -> 0.5%, and both rooms are inside `grade.mjs`'s 30–60 band
 * for the first time. The key is now the dominant source, which it was not before: ablating it
 * costs **20.3 of the generated gallery's 41 median L** against **17.2 of the authored gallery's
 * 41.7** — the same balance John's own rig has.
 *
 * 🚨 **THE CHROMA GATE IS NOT MET, IT IS NOT MET BY THE AUTHORED HOUSE EITHER UNDER THIS
 * PROTOCOL, AND THE RESIDUAL IS NOT A LIGHTING TERM. THIS IS REPORTED, NOT ABSORBED.** The
 * generated gallery reads top-decile 0.450 against a 0.14 target; the SHIPPED authored gallery
 * photographed the same way reads **0.217**, i.e. also a fail. Attribution, by ablation and by
 * crop (`_genlight1-chroma.mjs`, which grades a walls-only and a floor-only crop of both houses):
 * it is the generated room's WALL BAND that is warm, at **0.497 on the shipped build against the
 * authored room's 0.224**, and it is one light's doing — on the pre-swap build the same crop read
 * **0.896 whole-rig and −0.280 with the warm point off** (that pair is `0xffb271`'s, measured
 * before the colour change below; the shipped 0.497 is `0xffd0a8`'s). It is warm because a
 * generated room has **no `order`**, so it has no plaster, no pilasters, no string course, no
 * portraits and no emissive glazing, and its walls are the dig-band coat (warm damask) over
 * their whole height with a point light on them. `estate-light-1`'s rule
 * is that a warm room needs *"a NEAR-NEUTRAL element at the top of its range"*; the authored
 * gallery's is its pale plaster and its cold clerestory, and **a generated room does not contain
 * one.** No light can put it there. 🎯 **Closing the gap is an `order` slice, not a lighting one,
 * and it is a look decision that belongs to John — a colder key would only make the generated
 * house colder than his own rooms, which is restyling the estate.**
 *
 * ⚠️ **ONE HYPOTHESIS OF MINE WAS REFUTED BY THE SWEEP AND IS RECORDED SO NOBODY RETRIES IT.**
 * "Aim the key higher so it washes the near-neutral wall instead of the warm floor" is wrong:
 * `_genlight1-chroma.mjs`'s live aim sweep in the generated gallery reads top-decile **0.524 /
 * 0.632 / 0.705 at at.y 0.70 / 1.20 / 1.75** — raising the aim makes it WARMER, because the pool
 * moves off the visible surfaces and leaves the frame to the warm floor. 0.70 is the best of the
 * three on chroma AND on level, so no toggle is offered: there is nothing to choose between.
 */
const GENLIGHT_OFF = (typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('genlight') : null) === '0';

/**
 * 🔦 **THE KEY, AND ALL FIVE NUMBERS ARE FITTED TO `spaces.js` RATHER THAN CHOSEN.**
 * Derivation, re-runnable — `harness/scenarios/_genlight1-rig.mjs --derive` prints this table
 * from the live `ROOMS`/`HOUSE_PLAN` export and re-fits every constant, so the file and the
 * numbers cannot drift apart:
 *
 *   room       storey  keyY/storey   horiz run   throw  decay  intensity   E = i / throw^decay
 *   gallery      5.60      0.723        11.40    11.98  1.25      265           11.89
 *   study_w/e    4.80      0.854        13.85    13.98  1.50      560           10.71
 *   service      4.80      0.917        11.40    11.70  1.35      240            8.67
 *   ballroom     9.60      0.854        11.79    13.97  1.30      360           11.68
 *   chapel       4.80      0.958         3.70     5.45  1.60      165           10.95
 *
 * · **`KEY_E = 11` is the finding.** Four of the five authored keys deliver 10.7–11.9 units of
 *   irradiance at their own target (`i / throw^decay`, three's physical falloff), across rooms
 *   from 6.5 m to 27.2 m and storeys from 4.8 to 9.6. That is a LEVEL, and it is the one thing
 *   in the estate's lighting that is genuinely constant. Sizing a generated room's key from it
 *   lands within **1.57x of every one of the six**, from geometry alone and with nothing tuned
 *   per room (chapel 149 against an authored 165, ballroom 451 against 360, both studies 377
 *   against 560 — and the studies' 560 buys a 0.34 rad cone onto a chimney breast that a
 *   generated room does not have). `--derive` D4 gates that 1.57.
 * · `KEY_Y_FRAC` 0.86 is the median of 0.723 / 0.854 / 0.854 / 0.917 / 0.958.
 * · ⚠️ **`KEY_DECAY` 1.40 IS NOT THE AUTHORED MEDIAN, AND THE FIRST VERSION OF THIS FILE SAID IT
 *   WAS.** The median over the six authored rigs is **1.50** (both study slots carry 1.50 and
 *   outvote), and `--derive`'s D3 went red on its first run saying so. The claim was wrong, not
 *   the value's usefulness: `E` and `decay` are not independent once `E` is fixed, so the thing
 *   worth minimising is the distance to the six authored INTENSITIES. D3 is now a sweep across
 *   the authored decay range with an argmin, and **1.40 is that argmin — worst intensity ratio
 *   1.57, against 1.69 at 1.35 and 2.02 at the median 1.50.** It is also the ballroom's authored
 *   value exactly. The number came out of the instrument; it was not chosen.
 * · `KEY_RUN_MAX` 12.0: the authored horizontal runs are 0.42 L in the two 27 m rooms and
 *   0.75–0.90 L in the three shorter ones, i.e. `min(0.80 L, ~12)` — a spot covers a 15 m room
 *   end to end and does not try to cover a 27 m one. `min(0.80 L, 12)` reproduces four of the
 *   five to within 1 m.
 * · 🚨 **WHERE THE RUN SITS ALONG THE ROOM IS THE TERM THAT DECIDES WHETHER ANY OF THIS WORKS,
 *   AND THE FIRST BUILD GOT IT WRONG BY 6 m.** It centred the run on the room — key at −run/2,
 *   target at +run/2 — which reads as symmetric and is wrong: the player stands at the centre,
 *   i.e. exactly half way along a cone that is still 3 m in the air there, and the pool lands
 *   past him. Measured with `_genlight1-chroma.mjs` at the two galleries: killing the key cost
 *   the AUTHORED gallery **17.2 of its 41.7 median L** and the generated one **2.7 of 23.1** —
 *   the key was the dominant source in John's room and nearly nothing in the generated one, at
 *   1.5x the intensity. The authored keys do not centre the run: they start at **−0.42 L** and
 *   land the target **near the middle** (gallery local x +11.60 -> +1.20 in a room whose centre
 *   is x 0). `KEY_U = -0.42 L`, target at `KEY_U + run`, reproduces `service`'s −6.10 -> +5.30
 *   to 0.4 m, the gallery's +1.20 to 0.6 m, and the chapel's +1.35 to 1.2 m.
 * · `KEY_AT_Y` 0.70 is the median of the five authored targets (0.00 / 0.60 / 0.70 / 1.75 /
 *   2.20) and the ballroom's exactly. ⚠️ **`service`'s 1.75 was tried first and is a CORRIDOR
 *   number, not a general one** — its own argument is that the cone is *"5.1 m across at the
 *   target"* against a 3.4 m width, so raising the aim washes the side walls without lifting the
 *   pool off the floor. In a 6.7 m gallery at 0.33 rad it lifts the cone's lower edge above
 *   horizontal and the light never reaches the floor inside the room at all.
 * · The cone is `atan2(S/2 + 0.8, run)` clamped to the authored `[0.30, 0.86]`, which lands on
 *   the chapel's 0.70 at 0.679 and the gallery's 0.30 at 0.334. ⚠️ **A wider cone is not a
 *   dimmer one** — three's spot intensity is candela, so `angle` sets the size of the lit region
 *   and not its brightness; that is why widening it is safe and why `KEY_E` is the term that
 *   decides whether a room reads.
 */
const KEY = {
  color: 0xdfe6f4, E: 11.0, decay: 1.40, yFrac: 0.86, runMax: 12.0, atY: 0.70, uFrac: -0.42,
  angleLo: 0.30, angleHi: 0.86, distK: 2.4, distLo: 20, distHi: 40,
};

/**
 * 🕯️ **THE TWO POINTS ARE A WARM/COLD SPLIT BRACKETING THE LONG AXIS — the ballroom's pattern
 * and both studies', 3 of the 5 authored rigs**, and the ballroom's own note is the argument:
 * they were mirrored in one half of the room, *"two identical lights lighting the same third of
 * the biggest room in the house"*, and became a split standing at the two ends instead.
 *
 * They exist because the key deliberately cannot light the floor beneath itself (`study_w`:
 * *"the near half is lit by the two points below, never by the key"*), so the warm goes at the
 * key's own end and the cold at the far end, offset to opposite sides of the centre line so the
 * two pools alternate across the run rather than stacking down one side (the gallery's note).
 *
 * Sizes are the same kind of fit as the key. Authored points deliver 1.19–2.70 units at a third
 * of their own `distance`, at decay 1.34–1.60 (`PT_DECAY` 1.45 is `study_e`'s), with intensity
 * 11–46 and `distance` 9–24 — the clamps below are exactly that observed range. `E = 1.8` at a
 * reference radius of a quarter of the long axis, after the warm/cold split below, gives the
 * chapel **11/13 at 9** against its authored 12/11 at 9, and the gallery **25/34 at 20** against
 * its authored 24/22 at 16.
 *
 * 🚨 **THE WARM IS `0xffd0a8`, NOT `0xffb271`, AND THAT IS A MEASUREMENT.** The first build used
 * `0xffb271` (the gallery's, the ballroom's and the chapel's) and `_genlight1-chroma.mjs`'s
 * ablation put the whole chroma failure on it: killing this one light took the generated
 * gallery's WALL BAND from top-decile `(r−b)/L` **0.896 to −0.280**, and its top-decile pixel
 * from rgb (108,65,43) to (45,51,59) — from saturated orange to neutral. Nothing else in the rig
 * came close (the key −0.155, the cold point +0.329 the wrong way). `0xffd0a8` is the STUDIES'
 * authored warm, the least saturated of the three the house uses ((r−b)/L 0.404 against
 * `0xffb271`'s 0.749) and the one authored at the highest intensity, 34.
 *
 * ⚠️ **AND THE COLD CARRIES MORE THAN THE WARM, WHICH IS THE BALLROOM'S AND BOTH STUDIES' OWN
 * RATIO** — the ballroom is 44 cold against 32 warm (1.375) and both studies 44 against 34
 * (1.294). The first build gave the pair EQUAL intensity, which is the one thing none of the
 * three authored warm/cold splits does. `split` is 1.171, i.e. √1.371 ≈ the ballroom's ratio, and
 * it is applied as ÷ and × so the pair keeps the fitted geometric mean and only the balance
 * moves.
 */
const PT = { warm: 0xffd0a8, cold: 0x8fb3de, E: 1.8, decay: 1.45, y: 2.70, split: 1.171,
  iLo: 11, iHi: 46, distLo: 9, distHi: 24 };

/**
 * ❄️ **`cool` IS THE RIM PAST THE DOORWAY AND IT IS THE ONE LIGHT THAT NEEDS THE DOOR TABLES**,
 * which is why this pass runs after them. All four authored `cool` entries are the same light —
 * `0xa8ccf4` at y **1.90**, intensity 42/44/46/46, `distance` 10/10/10/11 — placed on the FAR
 * side of the space's principal opening, *"because the opening is where the thing you are afraid
 * of comes through"*. The values below are the chapel's, i.e. the middle of that range.
 *
 * ⚠️ **A space with no resolvable door gets its `cool` at its own centre and SAYS SO** (`coolAt`
 * on the emitted rig is `'door'` or `'centre'`). "Lit from the wrong place" and "I could not find
 * an opening" must not look the same downstream — that is this project's dominant instrument
 * failure, a result-shaped output in place of an error.
 */
const COOL = { color: 0xa8ccf4, intensity: 44, dist: 10, y: 1.90, past: 2.0 };

/**
 * 🆕 **`up` — THE HEMISPHERE GROUND COLOUR, i.e. THE ONLY LIGHT A CEILING IN THIS HOUSE HAS.**
 * Not a light: `makeLightRig` lerps the shared `fill` HemisphereLight's ground term per space,
 * and three's `mix(ground, sky, 0.5·dot(n,up) + 0.5)` gives a DOWN-facing normal the ground and
 * nothing else, a wall half of it, and a floor none. The constructor value `0x3a2a1c` is 4.3x
 * darker in luminance than the sky every wall gets, which is `ceiling-1`'s measured finding.
 *
 * ⚠️ **AND THIS IS THE ONE TERM A GENERATED ROOM NEEDS MORE THAN AN AUTHORED ONE, BECAUSE IT HAS
 * NO PRACTICALS.** `genplan.js` emits no `order`, so there is no clerestory, no sconce, no glow
 * decal and no emissive glazing anywhere in a generated house — every one of `gallery-rig.js`'s
 * and `study-rig.js`'s ceiling terms is absent. `0x4a5364` is the ballroom's authored value, the
 * middle of the three the house uses (`0x3a3f4a` gallery, `0x4a5364` ballroom, `0x59637a`
 * studies), and it is near-neutral by construction so it lifts without warming.
 */
const UP = 0x4a5364;

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const r3 = (v) => Math.round(v * 1e3) / 1e3;

/**
 * One SPACES row + its widest door -> that row's `lights` entry, in the shape `makeLightRig`
 * reads. Pure geometry: the room's own clear rect and storey decide everything.
 *
 * `door` is `{ x, z }` or null. `long`/`short` are the row's clear extents; the key rakes DOWN
 * THE LONG AXIS, which is `spaces.js`'s rule for both the gallery and the service passage —
 * *"a key aimed across a corridor lights two metres of it and leaves the rest a black tube"*.
 */
function lightRigFor(row, door) {
  const W = row.x1 - row.x0, D = row.z1 - row.z0;
  const cx = (row.x0 + row.x1) / 2, cz = (row.z0 + row.z1) / 2;
  const alongX = W >= D;
  const L = alongX ? W : D;                 // the long clear extent
  const S = alongX ? D : W;                 // the short clear extent
  const h = row.storey;
  /**
   * 🚨 **REFUSE A ROOM THAT CANNOT EXIST, RATHER THAN RETURN A RIG FOR IT — AND THIS WAS CAUGHT BY
   * A CONTROL, NOT BY INSPECTION.** Handed a zero-extent, zero-storey rect the arithmetic below
   * happily returned `intensity 13, keyY −0.40, angle 0.86`: a plausible-looking rig with its key
   * BELOW THE FLOOR. That is this project's dominant instrument failure — a result-shaped output
   * instead of an error — arriving inside the fix rather than inside a probe. `_plangen1-boot` B6
   * gates degenerate extents at 16/16 so nothing can reach this today; it is here so that if
   * anything ever does, the row comes out with NO `lights` (visible to `_genlight1-rig`'s A1,
   * which counts them) instead of a light underground.
   */
  if (!(L > 0) || !(S > 0) || !(h > 1.0)) return null;
  /** `u` runs along the long axis, `v` across it; both measured from the room's centre. */
  const P = (u, y, v) => (alongX
    ? [r3(cx + u), r3(y), r3(cz + v)]
    : [r3(cx + v), r3(y), r3(cz + u)]);

  const run = Math.min(0.80 * L, KEY.runMax);
  const keyY = Math.min(h * KEY.yFrac, h - 0.40);
  const rise = keyY - KEY.atY;
  const throwLen = Math.hypot(run, rise);
  const angle = clamp(Math.atan2(S / 2 + 0.8, run), KEY.angleLo, KEY.angleHi);
  // ⚠️ NOT centred on the room — see the header. The key stands at −0.42 L and its target lands
  // near the middle, which is where the player is and where the pool has to be.
  const keyU = Math.max(KEY.uFrac * L, -(L / 2 - 0.30));
  const key = {
    pos: P(keyU, keyY, 0), at: P(keyU + run, KEY.atY, 0),
    color: KEY.color,
    intensity: Math.round(KEY.E * Math.pow(throwLen, KEY.decay)),
    angle: r3(angle), penumbra: 0.55,
    dist: clamp(Math.round(throwLen * KEY.distK), KEY.distLo, KEY.distHi),
    decay: KEY.decay,
  };

  const R = clamp(L / 4, 3, 8);
  const pY = Math.min(PT.y, h - 0.60);
  const pI = clamp(Math.round(PT.E * Math.pow(R, PT.decay)), PT.iLo, PT.iHi);
  const pDist = clamp(Math.round(R * 3), PT.distLo, PT.distHi);
  const warm = [
    // the key's own end — the half its cone starts above and therefore cannot reach
    { pos: P(-0.30 * L, pY, -0.22 * S), color: PT.warm, dist: pDist, decay: PT.decay,
      intensity: clamp(Math.round(pI / PT.split), PT.iLo, PT.iHi) },
    // the far end, opposite side of the centre line: the two pools alternate, they do not stack
    { pos: P(0.30 * L, pY, 0.22 * S), color: PT.cold, dist: pDist, decay: PT.decay,
      intensity: clamp(Math.round(pI * PT.split), PT.iLo, PT.iHi) },
  ];

  // Past the doorway, on the far side, or the room's own centre when there is no door to use.
  let coolPos = P(0, COOL.y, 0);
  let coolAt = 'centre';
  if (door) {
    const dx = door.x - cx, dz = door.z - cz;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      coolPos = [r3(door.x + (dx / len) * COOL.past), COOL.y, r3(door.z + (dz / len) * COOL.past)];
      coolAt = 'door';
    }
  }
  return {
    key, warm,
    cool: { pos: coolPos, color: COOL.color, intensity: COOL.intensity, dist: COOL.dist },
    up: UP,
    /** DIAGNOSTIC, read by `_genlight1-rig.mjs`. `makeLightRig` ignores anything it does not name. */
    genlight: { coolAt, long: r3(L), short: r3(S), storey: h, run: r3(run), throw: r3(throwLen) },
  };
}

/**
 * Give every emitted row a rig. The door a row's `cool` sits past is the WIDEST connector that
 * names it — a shut inter-region door (`CONNECTOR_W` 2.08) beats a corridor's internal joint,
 * and an EXIT is used only when there is nothing else, because an exit is where you go rather
 * than where the thing you are afraid of comes through.
 */
function attachLights(rows, portals, panels) {
  if (GENLIGHT_OFF) return;                 // `?genlight=0` — the pre-2026-08-15 arm, verbatim
  const best = new Map();                   // row id -> { x, z, w, exit }
  const offer = (id, x, z, w, exit) => {
    if (!id || id === 'outside') return;
    const cur = best.get(id);
    // interior always beats an exit; within a class, wider wins
    if (cur && (cur.exit === exit ? cur.w >= w : !cur.exit)) return;
    best.set(id, { x, z, w, exit });
  };
  for (const p of portals) { offer(p.a, p.x, p.z, p.w ?? 0, false); offer(p.b, p.x, p.z, p.w ?? 0, false); }
  for (const p of panels) {
    const exit = p.b === 'outside';
    offer(p.a, p.x, p.z, p.w ?? 0, exit);
    offer(p.b, p.x, p.z, p.w ?? 0, exit);
  }
  for (const row of rows) {
    const rig = lightRigFor(row, best.get(row.id) ?? null);
    if (rig) row.lights = rig;              // a refused row carries none — see lightRigFor's guard
  }
}

/**
 * Exported for `harness/scenarios/_genlight1-rig.mjs --derive` ONLY — its **D5** control feeds
 * the rule a room 100x too big and requires the "within 2x of every authored key" fit to REJECT
 * it, and its **D7** feeds it a zero-extent zero-storey rect and requires `null` back.
 * ⚠️ Nothing in `src/` calls this; a rule that could not be handed a rectangle by an instrument
 * could only ever be checked by re-deriving it, which is the failure this project keeps paying
 * for. Not part of the module's contract — do not build on it.
 */
export const __genlightRigFor = lightRigFor;
