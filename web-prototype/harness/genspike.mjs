#!/usr/bin/env node
/**
 * genspike.mjs — DOES THE "PARTITION THE FOOTPRINT" MANSION GENERATOR ACTUALLY WORK?
 *
 * A paper spike. No three.js, no browser, no engine import, nothing in `src/` is touched or
 * read at runtime. It answers one question, from John, 2026-08-08:
 *
 *   "if its procedural and we have many different shaped rooms how can they fit together
 *    tightly with maximum surface area contact. We want all the shared wall to have the
 *    digging mechanic"
 *
 * and the shape of the answer he chose:
 *
 *   "we free form placement and make dark corridors that house the hunter later. the hunter
 *    will hear you and can come through the wall."
 *
 * THE CLAIM UNDER TEST. Place 6-8 rigid rooms free-form; decompose everything left over into
 * corridors rather than leaving it void; the result is a COMPLETE PARTITION, so every internal
 * boundary has a room on both sides and is therefore diggable. Maximum shared wall, reached via
 * corridors rather than via a grid.
 *
 * Usage:
 *   node harness/genspike.mjs --seed 7              one plan: ASCII + JSON graph
 *   node harness/genspike.mjs --plans 10            ten plans, ASCII only
 *   node harness/genspike.mjs --sweep 512           the measurement table
 *   node harness/genspike.mjs --sweep 512 --align 0 pure free-form arm
 *   node harness/genspike.mjs --selftest            determinism + partition invariants
 *
 * PURITY: no Date, no Math.random, no iteration order that depends on anything but the seed.
 * `--selftest` asserts seed -> plan is a function.
 *
 * ---------------------------------------------------------------------------------------
 * 🔴 CHANGED 2026-08-11 (`maptool-2`), on four things John said he did not trust in the designer.
 * Headline metrics are UNMOVED — 92.79% diggable, 42.4% flat, authored mansion still depth 3, all
 * gates 100% — the only sweep figure that shifts is `spawn->exit: walls to dig` 1.76 -> 1.77.
 * ---------------------------------------------------------------------------------------
 *  1. 🚪 **A DOOR NOW HAS TO FIT IN ONE STRETCH OF WALL.** `canDoor` compared the door's 2.48 m
 *     against a boundary's SUMMED contact, and a boundary can be several physically separate
 *     stretches. **891 of 11,638 door-bearing wall runs over 512 seeds (7.66%) were shorter than
 *     2.48 m, 790 shorter than the 2.08 m aperture itself, worst overhang 1.04 m at EACH end, and
 *     433 of 512 seeds (84.6%) had at least one** — which is John's *"green open door clipping on
 *     the corner of the rooms and into the hallway"*, and it was the PLAN, not the drawing.
 *     `wallRuns()` is now computed once and `canDoor` asks the longest run. **Selftest D1.**
 *  2. 🚪 **ONE DOOR PER BOUNDARY.** The state was stamped on every run, so one door was painted
 *     two and three times in different places — **2,349 of 11,356 edges (20.7%)**. **D2.**
 *  3. 🔨 **`chained` IS NOT WHAT THE HUNTER BATTERS — IT IS ITS OPPOSITE**, and the name
 *     `room.chainedDoorsOf()` in `src/` is where that belief comes from: it filters on
 *     `isDamageable()`, and `CHAINED_DEFS[0]` is `damageable: false`, so it returns the interior
 *     **BREACHABLE** panels and skips every chained one. `edge.hunterForces` names the real set.
 *     The chain John sees in game is `?tells=blind` dressing at p = 0.50, never read off state.
 *     **D3.**
 *  4. 🧱 **SLABS: A MAXIMUM, NOT A MINIMUM — AND THE 85.90 m IN `_slab1-cost.mjs` IS NOT A WALL.**
 *     That figure is `edge.clear`, the sum over every disjoint stretch two regions share. The
 *     longest contiguous DIGGABLE run this generator makes is **31.33 m** (p95 27.20, and 27.20 at
 *     `--cut Infinity` too — it is the gallery's own long side). So `SLAB_MAX` = 35 **never fires
 *     in production: 0 of 13,119 runs**. What actually cuts walls in half is doors — **63.4% of
 *     diggable runs** — because a slab cannot contain an aperture yet. `slabLayout()` reports the
 *     reason rather than hiding it. **D4 (synthetic control), D5.**
 *  5. 🕳️ `interconnectOn()` mirrors `dig.js` `chooseFreeInterconnect` so the designer can draw the
 *     ONE 1.55 m spot per shared edge that has no barrier behind it — John's *"is the orange
 *     inclusive of the cyan barrier"*, answered as a picture. **D6.**
 *
 * ---------------------------------------------------------------------------------------
 * COORDINATES: STRUCTURAL, NOT CLEAR — and this is the one modelling decision that matters.
 * ---------------------------------------------------------------------------------------
 * `spaces.js`: "A space's x0/x1/z0/z1 are INTERIOR CLEAR extents. Walls sit OUTSIDE them. When
 * two spaces abut across a 0.30 band, each emits a 0.15 skin." So a partition cannot be drawn
 * in clear coordinates — flush clear rects would share a zero-thickness wall.
 *
 * Everything below is therefore in STRUCTURAL coordinates: a room's rect is its clear rect
 * inflated by WALL_T/2 = 0.15 on all four sides. Two flush structural rects then share a 0.30
 * band centred on the line, which is exactly `spaces.js`'s convention, and the clear extent of
 * any cell is its structural rect deflated by 0.15.
 *
 * Consequence, applied everywhere: a structural contact of length L yields CLEAR diggable run
 * L - 0.30 (a 0.15 corner return at each end where the perpendicular wall lands).
 */

// ===========================================================================================
// Constants — every one of these is READ OUT OF src/, not invented. Sources named.
// ===========================================================================================

/** `spaces.js` WALL_T. */
const WALL_T = 0.30;
/** `connectors.js` CONNECTOR_W / CONNECTOR_H — the one clear aperture all four states share. */
const CONNECTOR_W = 2.08;
const CONNECTOR_H = 2.68;
/** `dig.js` DIG_H — the free-dig band height. 0 .. 2.80. */
const DIG_H = 2.80;
/** `dig.js` freePanels(): `if (w >= 1.2)` — a span narrower than this is not a dig site. */
const L_DIG = 1.20;
/** `dig.js` SEG_W, and the three authored span lengths the draw-call groups are keyed on. */
const SEG_W = 1.14;
const AUTHORED_SPANS = [2.56, 2.96, 5.72];

/**
 * A door needs the 2.08 aperture plus a jamb. `dig.js` requires >= 0.20 m clearance between a
 * dig span and any shipped connector on the same wall; same figure used for the jamb.
 */
const L_DOOR = CONNECTOR_W + 2 * 0.20;   // 2.48 clear

/**
 * 🧱 **THE SLAB CAP — A MAXIMUM, AND THERE IS NO MINIMUM.**
 *
 * `slab-1` / `doors-1`, re-run on this tree 2026-08-11 (`node harness/_slab1-cost.mjs`, section B's
 * wall-clock table) — blow-frame CPU against `walls-perf.md`'s **2.00 ms** budget:
 *
 *     5.72 m   1800 cells   0.437 ms      15.40 m   4920 cells   0.494 ms
 *    11.24 m   3600 cells   0.539 ms      34.80 m  11100 cells   1.077 ms   ← 54% of budget
 *                                         85.90 m  27420 cells   2.576 ms   ← 129%, OVER
 *
 * Cost is linear in face length (10.64 columns per metre at every width; 0.094-0.097 ms per 1000
 * cells above 5 m), so the fit crosses 2.00 ms at **~66 m**. 🚨 **THE CAP IS 35, NOT 66, AND THE
 * DIFFERENCE IS THE WHOLE POINT: 34.80 m is the longest face anyone has MEASURED inside budget and
 * 85.90 m is the shortest anyone has measured outside it. Everything between is extrapolation.**
 *
 * 🎯 **AND THE DIRECTION MATTERS.** `house-packing.md` §7.3 spends its length on a MINIMUM — the
 * 2.96 m below which no authored span fits, "3.43 un-instanceable boundaries per plan". A slab has
 * no minimum: it is one face of whatever length the wall is. That retires §7.3 for the slab arm
 * outright, and replaces it with this cap at the other end.
 */
const SLAB_MAX = 35.00;

/**
 * 🕳️ `dig.js` `IC_W` — the interconnect blob is **1.55 m across**, ONE per shared edge, and it is
 * the only part of a dug wall that is not brick barrier behind the coat. Carried here because the
 * designer draws it: John asked whether the orange dig face "includes the cyan barrier behind it",
 * and the answer is a picture, not a sentence.
 */
const IC_W = 1.55;

/**
 * WALKABLE CORRIDOR MINIMUM — CLEAR. **This is my threshold and it is stated, not sourced.**
 * The player's collision radius is `height * 0.20` = 0.34 m (`player.js`), so 0.68 m of body;
 * the sledge shoulder is 0.42 m (`player.js` again). 1.60 m is that plus room to swing plus
 * room to pass. It also sits deliberately ABOVE `spaces.js`'s D7 = 1.20 m, which is 1.20 ON
 * PURPOSE so a stage-3 hunter cannot fit (`procedural-map.md` §4). If the generator emitted
 * 1.20 m corridors by accident it would be handing out that mechanic for free.
 */
const W_MIN = 1.60;
/** Same in structural coordinates. */
const W_MIN_S = W_MIN + WALL_T;          // 1.90

/** Minimum structural overlap when placing a room flush against another. 1.20 clear + walls. */
const MIN_CONTACT_S = L_DIG + WALL_T + 0.60;  // 2.10 struct -> 1.80 clear

const EPS = 1e-7;

/**
 * THE ROOM LIBRARY — clear footprints copied from `src/game/spaces.js`, checked 2026-08-09.
 *
 * 🚨 THE BRIEF SAID "study x2 sizes" AND THAT IS WRONG. `study_w` is x -13.60..-2.00,
 * z -24.00..-8.60 and `study_e` is x 2.00..13.60, z -24.00..-8.60: **identical 11.60 x 15.40,
 * identical 4.80 storey.** The shipped house has SIX SPACES but only FIVE DISTINCT FOOTPRINTS.
 * Rather than invent a second study size, `study` is one type that the duplicate rule below
 * naturally emits twice — which is what the shipped plan actually is.
 *
 * `storey` is carried because the ballroom's 9.60 is load-bearing (see `y` in the region model)
 * and because it is the cheap 2-storey generalisation.
 */
const LIBRARY = [
  { type: 'gallery',  w: 27.20, d:  6.70, storey: 5.60, char: 'G' },
  { type: 'ballroom', w: 27.20, d: 15.30, storey: 9.60, char: 'B' },
  { type: 'study',    w: 11.60, d: 15.40, storey: 4.80, char: 'S' },
  { type: 'service',  w:  3.40, d: 15.40, storey: 4.80, char: 'V' },
  { type: 'chapel',   w:  6.80, d:  6.50, storey: 4.80, char: 'C' },
];
/** The sixth space is a second study. Guarantees "all six appear in most runs". */
const MANDATORY = ['gallery', 'ballroom', 'study', 'study', 'service', 'chapel'];

// ===========================================================================================
// Seeded RNG — mulberry32 over a string hash. Pure.
// ===========================================================================================

function hash32(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkRng = (seed) => mulberry32(hash32(seed));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// ===========================================================================================
// 1. ROOM SELECTION
// ===========================================================================================

/**
 * Six mandatory + 0..2 duplicates, each optionally rotated 90 deg. Rotation is what stops the
 * gallery and the service passage from always running the same way; it is also the only reason
 * a 27.20 m gallery can ever be a north-south spine.
 */
/**
 * 🏠 **`want` — HOW MANY ROOMS THE HOUSE GETS. John, 2026-08-12, after walking a generated seed:**
 * *"I think I also want to make them smaller. 3 rooms instead of 6."*
 *
 * ⚠️ **THE DEFAULT IS UNCHANGED AND THAT IS DELIBERATE.** `genspike.mjs` is shared: the map
 * designer imports it, `_genwalk1-*`, `_genslab1-dig` and `house-packing.md`'s whole 512-seed
 * corpus were all measured against six mandatory rooms plus 0–2 duplicates. A new default here
 * would silently re-roll every recorded figure in that document. The GAME passes `rooms` through
 * `?planrooms=`; everything else keeps what it measured.
 *
 * Below six, the mandatory list is SUBSET rather than truncated — a seeded pick, so the three
 * rooms differ per seed instead of always being the first three. That makes a small house MORE
 * varied per seed than a big one, not less. ⚠️ Duplicates are still possible above the mandatory
 * count, so `want` is a target and not a guarantee of distinct types.
 */
function selectRooms(rng, want = null) {
  let names;
  if (want != null && want < MANDATORY.length) {
    // seeded pick of `want` distinct entries from the mandatory list, order preserved
    const pool = MANDATORY.slice();
    names = [];
    for (let i = 0; i < want && pool.length; i++) {
      names.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
  } else {
    names = MANDATORY.slice();
    const target = want ?? (MANDATORY.length + Math.floor(rng() * 3));
    const extra = Math.max(0, target - names.length);
    for (let i = 0; i < extra; i++) names.push(pick(rng, LIBRARY).type);
  }
  const rooms = names.map((t, i) => {
    const L = LIBRARY.find((r) => r.type === t);
    const rot = rng() < 0.5;
    return {
      kind: 'room', type: t, idx: i, rot,
      // structural size = clear + WALL_T
      w: (rot ? L.d : L.w) + WALL_T,
      d: (rot ? L.w : L.d) + WALL_T,
      storey: L.storey, char: L.char,
    };
  });
  // Biggest first: a packer that places the ballroom last has nowhere to put it.
  rooms.sort((a, b) => (b.w * b.d) - (a.w * a.d));
  return rooms;
}

// ===========================================================================================
// 2. PLACEMENT — flush-contact free-form packing
// ===========================================================================================

const overlapLen = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
function rectsOverlap(a, b) {
  return overlapLen(a.x0, a.x1, b.x0, b.x1) > EPS && overlapLen(a.z0, a.z1, b.z0, b.z1) > EPS;
}
/** Structural contact length between two non-overlapping rects sharing a wall line. */
function contactS(a, b) {
  if (Math.abs(a.x1 - b.x0) < EPS || Math.abs(b.x1 - a.x0) < EPS) {
    return Math.max(0, overlapLen(a.z0, a.z1, b.z0, b.z1));
  }
  if (Math.abs(a.z1 - b.z0) < EPS || Math.abs(b.z1 - a.z0) < EPS) {
    return Math.max(0, overlapLen(a.x0, a.x1, b.x0, b.x1));
  }
  return 0;
}
const bboxOf = (rs) => rs.reduce((a, r) => ({
  x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1),
  z0: Math.min(a.z0, r.z0), z1: Math.max(a.z1, r.z1),
}), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
const areaOf = (b) => (b.x1 - b.x0) * (b.z1 - b.z0);

/**
 * Place each room flush against a face of an already-placed room, sliding along that face by a
 * continuous seeded offset. Flush placement is what buys the contact; the continuous slide is
 * what stops the plan reading as a spreadsheet.
 *
 * ⚠️ `align` IS THE WHOLE EXPERIMENT. It is the probability weight on candidates whose new edge
 * coincides with a coordinate already in the plan. align = 0 is pure free-form and is what John
 * asked for; align = 1 is a (non-uniform, still not gridded) aligned plan. The slivers and the
 * corridor sprawl both live on this dial, and the sweep reports both ends.
 */
const NOFF = 9;
const ALIGN_BONUS = 6.0;        // metres-equivalent bonus for a coincident edge

/**
 * ⚠️ `gap` IS THE SECOND DIAL AND IT IS THE ONE JOHN'S DESIGN ACTUALLY NEEDS.
 *
 * A room may be placed FLUSH against a face (one shared wall, one dig to cross) or SET BACK by
 * a corridor width (two shared walls with a corridor between, two digs to cross). The set-back
 * candidate scores its face overlap at `gap` x the flush rate.
 *
 * gap = 0 is the pure "maximum surface area contact" reading of the brief, and it produces a
 * house with almost no corridor — nowhere for the hunter to live. gap > 0 buys the warren.
 * The sweep runs the dial because the trade is the answer, not a number on it.
 */
function placeRooms(rng, rooms, align, gap = 0, lambdaWaste = 0.10) {
  const placed = [];
  const first = rooms[0];
  placed.push({ ...first, x0: 0, x1: first.w, z0: 0, z1: first.d });

  for (let k = 1; k < rooms.length; k++) {
    const R = rooms[k];
    const coords = { x: new Set(), z: new Set() };
    for (const p of placed) { coords.x.add(p.x0); coords.x.add(p.x1); coords.z.add(p.z0); coords.z.add(p.z1); }
    const bb0 = bboxOf(placed);
    const a0 = areaOf(bb0);

    const cands = [];
    for (const p of placed) {
      // four faces of p; `axis` is the axis the face's normal runs along
      const faces = [
        { axis: 'x', at: p.x1, side: +1 }, { axis: 'x', at: p.x0, side: -1 },
        { axis: 'z', at: p.z1, side: +1 }, { axis: 'z', at: p.z0, side: -1 },
      ];
      for (const f of faces) {
        const along = f.axis === 'x' ? 'z' : 'x';
        const pLo = along === 'z' ? p.z0 : p.x0;
        const pHi = along === 'z' ? p.z1 : p.x1;
        const rLen = along === 'z' ? R.d : R.w;
        const tLo = pLo - rLen + MIN_CONTACT_S;
        const tHi = pHi - MIN_CONTACT_S;
        if (tHi < tLo - EPS) continue;

        const offs = [];
        for (let i = 0; i < NOFF; i++) offs.push(tLo + (tHi - tLo) * ((i + 0.5) / NOFF + (rng() - 0.5) / NOFF));
        // plus every placement that makes an edge coincide with an existing coordinate
        for (const c of coords[along]) { offs.push(c); offs.push(c - rLen); }

        // stand-off distances: 0 = flush, > 0 = a corridor's worth of set-back
        const gaps = gap > 0 ? [0, W_MIN_S + rng() * 1.5, W_MIN_S + rng() * 1.5] : [0];

        for (const t of offs) {
          if (t < tLo - EPS || t > tHi + EPS) continue;
          for (const g of gaps) {
            let r;
            if (f.axis === 'x') {
              const x0 = f.side > 0 ? f.at + g : f.at - g - R.w;
              r = { x0, x1: x0 + R.w, z0: t, z1: t + R.d };
            } else {
              const z0 = f.side > 0 ? f.at + g : f.at - g - R.d;
              r = { x0: t, x1: t + R.w, z0, z1: z0 + R.d };
            }
            if (placed.some((q) => rectsOverlap(r, q))) continue;

            let contact = 0;
            for (const q of placed) {
              const c = contactS(r, q);
              if (c > MIN_CONTACT_S - EPS) contact += c - WALL_T;   // clear metres
            }
            // a set-back placement earns its face overlap at the `gap` rate: the corridor
            // between the two rooms is TWO diggable boundaries, not one, but it is also two
            // digs to cross, so it is deliberately not worth the same.
            const faceOverlap = f.axis === 'x'
              ? Math.max(0, overlapLen(p.z0, p.z1, r.z0, r.z1))
              : Math.max(0, overlapLen(p.x0, p.x1, r.x0, r.x1));
            const via = g > 0 ? Math.max(0, faceOverlap - WALL_T) * gap : 0;
            if (contact + via <= 0) continue;

            const bb1 = bboxOf([...placed, r]);
            const waste = (areaOf(bb1) - a0) - R.w * R.d;
            const snapped = (coords[along].has(t) || coords[along].has(t + rLen)) ? 1 : 0;
            const score = contact + via
              - lambdaWaste * Math.max(0, waste)
              + snapped * ALIGN_BONUS * align
              + rng() * 1.5;                                        // seeded taste
            cands.push({ r, score });
          }
        }
      }
    }
    if (!cands.length) {
      // fallback: hang it off the east face of the bbox, flush at the north edge
      placed.push({ ...R, x0: bb0.x1, x1: bb0.x1 + R.w, z0: bb0.z0, z1: bb0.z0 + R.d });
      continue;
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    placed.push({ ...R, ...best.r });
  }
  // normalise so the plan starts at the origin — keeps ASCII and JSON stable
  const bb = bboxOf(placed);
  for (const p of placed) { p.x0 -= bb.x0; p.x1 -= bb.x0; p.z0 -= bb.z0; p.z1 -= bb.z0; }
  return placed;
}

// ===========================================================================================
// 3. DECOMPOSITION — everything left over becomes corridor
// ===========================================================================================

function uniqSorted(vals) {
  const out = [];
  for (const v of [...vals].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 1e-6) out.push(v);
  return out;
}

/** Greedy maximal-rectangle cover of the free cells over the non-uniform grid. */
function coverFree(xs, zs, occ, rowFirst) {
  const nx = xs.length - 1, nz = zs.length - 1;
  const used = Array.from({ length: nx }, () => new Array(nz).fill(false));
  const out = [];
  const iOuter = rowFirst;
  const A = iOuter ? nx : nz, B = iOuter ? nz : nx;
  const at = (a, b) => (iOuter ? [a, b] : [b, a]);
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B; b++) {
      const [i, j] = at(a, b);
      if (occ[i][j] || used[i][j]) continue;
      let b2 = b;
      while (b2 + 1 < B) { const [ii, jj] = at(a, b2 + 1); if (occ[ii][jj] || used[ii][jj]) break; b2++; }
      let a2 = a;
      grow: while (a2 + 1 < A) {
        for (let c = b; c <= b2; c++) { const [ii, jj] = at(a2 + 1, c); if (occ[ii][jj] || used[ii][jj]) break grow; }
        a2++;
      }
      for (let p = a; p <= a2; p++) for (let q = b; q <= b2; q++) { const [ii, jj] = at(p, q); used[ii][jj] = true; }
      const [i0, j0] = at(a, b), [i1, j1] = at(a2, b2);
      out.push({ x0: xs[Math.min(i0, i1)], x1: xs[Math.max(i0, i1) + 1], z0: zs[Math.min(j0, j1)], z1: zs[Math.max(j0, j1) + 1] });
    }
  }
  return out;
}

const minDim = (r) => Math.min(r.x1 - r.x0, r.z1 - r.z0);

/** Merge any rect pair whose union is a rectangle, while it improves the worst min-dimension. */
function mergeRects(rects) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let a = 0; a < rects.length && !changed; a++) {
      const A = rects[a];
      if (minDim(A) >= W_MIN_S - EPS) continue;
      let bestB = -1, bestU = null, bestMin = -1;
      for (let b = 0; b < rects.length; b++) {
        if (b === a) continue;
        const B = rects[b];
        let U = null;
        const sameX = Math.abs(A.x0 - B.x0) < 1e-6 && Math.abs(A.x1 - B.x1) < 1e-6;
        const sameZ = Math.abs(A.z0 - B.z0) < 1e-6 && Math.abs(A.z1 - B.z1) < 1e-6;
        if (sameX && (Math.abs(A.z1 - B.z0) < 1e-6 || Math.abs(B.z1 - A.z0) < 1e-6)) {
          U = { x0: A.x0, x1: A.x1, z0: Math.min(A.z0, B.z0), z1: Math.max(A.z1, B.z1) };
        } else if (sameZ && (Math.abs(A.x1 - B.x0) < 1e-6 || Math.abs(B.x1 - A.x0) < 1e-6)) {
          U = { x0: Math.min(A.x0, B.x0), x1: Math.max(A.x1, B.x1), z0: A.z0, z1: A.z1 };
        }
        if (!U) continue;
        const m = minDim(U);
        if (m > bestMin) { bestMin = m; bestB = b; bestU = U; }
      }
      if (bestB >= 0 && bestMin > minDim(A) + 1e-9) {
        const hi = Math.max(a, bestB), lo = Math.min(a, bestB);
        rects.splice(hi, 1); rects.splice(lo, 1); rects.push(bestU);
        changed = true;
      }
    }
  }
  return rects;
}

/**
 * Group the leftover rects into REGIONS. A region is a set of rects, so a corridor may be
 * L-shaped or U-shaped — which is what a corridor in a real house is, and which is the only
 * way a leftover sliver can stay part of the partition instead of becoming void.
 *
 * A region is WALKABLE if it contains at least one rect >= W_MIN in both dimensions. A rect
 * below that inside a walkable region is an ALCOVE (dressed as a recess, still floor, still
 * diggable on both sides). A connected group with NO walkable rect at all is VOID: solid
 * masonry infill, NOT a room, and its faces are NOT diggable. Void is the honest failure unit
 * and the sweep counts it.
 */
/**
 * ⚠️ `cutSpan` IS THE THIRD DIAL AND IT IS THE RESIDENCY ONE. The brief says "decompose
 * everything left over into corridor ROOMS". Merging every free rect into one polygon region
 * is what kills slivers, but it also produces a single 40-60 m rectilinear hall with every
 * room in the house opening onto it — `procedural-map.md` §4's exact warning. So a merge is
 * REFUSED when the merged region's bounding box would exceed `cutSpan` on either axis: the
 * warren becomes a chain of dark corridor rooms with diggable walls between them, which is
 * more shared wall AND a shorter sightline AND better cover for the hunter.
 */
function groupRegions(rects, cutSpan = Infinity) {
  const n = rects.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const bb = rects.map((r) => ({ ...r }));
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const uni = (i, j) => {
    const a = find(i), b = find(j);
    if (a === b) return;
    const u = {
      x0: Math.min(bb[a].x0, bb[b].x0), x1: Math.max(bb[a].x1, bb[b].x1),
      z0: Math.min(bb[a].z0, bb[b].z0), z1: Math.max(bb[a].z1, bb[b].z1),
    };
    if (Math.max(u.x1 - u.x0, u.z1 - u.z0) > cutSpan + EPS) return;   // refuse: too long a sightline
    parent[a] = b; bb[b] = u;
  };
  // pass 1: merges that RESCUE a sub-minimum rect always win, span cap or not
  for (let i = 0; i < n; i++) {
    if (minDim(rects[i]) >= W_MIN_S - EPS) continue;
    for (let j = 0; j < n; j++) if (j !== i && contactS(rects[i], rects[j]) > EPS) { uni(i, j); break; }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) if (contactS(rects[i], rects[j]) > EPS) uni(i, j);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(rects[i]);
  }
  return [...groups.values()];
}

// ===========================================================================================
// 4. THE PLAN
// ===========================================================================================

/**
 * REGION MODEL — and the y fields are the 2-storey generalisation the brief asked not to be
 * baked out. Every region carries [y0, y1]; adjacency intersects the y ranges and the dig band
 * [0, DIG_H] before it calls a boundary diggable. On one storey y0 is always 0 so the term is
 * constant, but a second storey at y0 = 4.80 needs no change to any function below — and the
 * ballroom's 9.60 storey means a first-floor neighbour would overlap it for 4.80 m, which is
 * a real diggable face, not a theoretical one.
 */
function buildPlan(seed, opts = {}) {
  const align = opts.align ?? 0.35;
  const gap = opts.gap ?? 2.2;
  const waste = opts.waste ?? 0.04;
  const rng = mkRng(`rrr/genspike/${seed}`);
  const sel = selectRooms(rng, opts.rooms ?? null);
  const rooms = placeRooms(rng, sel, align, gap, waste);
  return planFromRooms(seed, rooms, { ...opts, align, gap, waste });
}

/**
 * STEPS 3-7 ON AN ARBITRARY SET OF PLACED ROOMS — decompose, classify, graph, exit.
 *
 * ⚠️ THIS IS THE SEAM `tools/mapdesigner/` EDITS THROUGH, AND IT EXISTS SO THAT THE TOOL DOES
 * NOT OWN A SECOND COPY OF THE ALGORITHM. `buildPlan` = `selectRooms` + `placeRooms` + this.
 * When John drags a room in the designer, the tool hands the moved rectangles straight back to
 * this function and the corridor decomposition, the boundary graph, the dig spans and every
 * metric are recomputed by the SAME code that produced the generated plan. A hand-authored
 * layout and a seeded one are therefore measured identically, which is the only way the numbers
 * he sees while editing mean the same thing as the numbers in `house-packing.md`.
 *
 * `rooms` are STRUCTURAL rects carrying `{ type, rot, storey, char, x0, x1, z0, z1 }`.
 * `opts.normalise === false` keeps the caller's world coordinates (the editor wants that, so a
 * drag does not translate the whole plan under the cursor); `buildPlan` leaves it on.
 */
function planFromRooms(seed, roomsIn, opts = {}) {
  const align = opts.align ?? 0.35;
  const gap = opts.gap ?? 2.2;
  const waste = opts.waste ?? 0.04;
  /**
   * DEFAULT 30 m, AND IT IS A SOURCED NUMBER RATHER THAN A TASTE ONE. The shipped house's own
   * longest sightline is the gallery's 27.20 m long axis, and that is the plan the 580-586/625
   * draw-call figure was measured on. 30 is the smallest cap that never has to cut a
   * gallery-length corridor in half, and it holds the warren under the house it was measured
   * against. `--cut Infinity` is the "residency be damned" arm and it is 6 points better on the
   * headline; see `docs/design/house-packing.md` §5.
   */
  const cutSpan = opts.cutSpan ?? 30;
  const rooms = roomsIn.map((r) => ({ ...r }));
  if (opts.normalise !== false) {
    const bb0 = bboxOf(rooms);
    for (const p of rooms) { p.x0 -= bb0.x0; p.x1 -= bb0.x0; p.z0 -= bb0.z0; p.z1 -= bb0.z0; }
  }
  const env = bboxOf(rooms);

  const xs = uniqSorted([...rooms.flatMap((r) => [r.x0, r.x1]), env.x0, env.x1]);
  const zs = uniqSorted([...rooms.flatMap((r) => [r.z0, r.z1]), env.z0, env.z1]);
  const nx = xs.length - 1, nz = zs.length - 1;
  const occ = Array.from({ length: nx }, () => new Array(nz).fill(false));
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < nz; j++) {
      const cz = (zs[j] + zs[j + 1]) / 2;
      occ[i][j] = rooms.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1);
    }
  }
  // two cover passes; keep whichever leaves fewer sub-minimum rects
  const cands = [coverFree(xs, zs, occ, true), coverFree(xs, zs, occ, false)]
    .map((rs) => mergeRects(rs.slice()))
    .map((rs) => ({ rs, bad: rs.filter((r) => minDim(r) < W_MIN_S).length, n: rs.length }));
  cands.sort((a, b) => (a.bad - b.bad) || (a.n - b.n));
  const freeRects = cands[0].rs;

  // regions
  const regions = rooms.map((r, i) => ({
    id: `r${i}.${r.type}`, kind: 'room', type: r.type, rot: r.rot,
    rects: [{ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }],
    y0: 0, y1: r.storey, char: r.char,
  }));
  let ci = 0, vi = 0;
  for (const g of groupRegions(freeRects, cutSpan)) {
    const walkable = g.filter((r) => minDim(r) >= W_MIN_S - EPS);
    if (walkable.length) {
      regions.push({
        id: `c${ci++}`, kind: 'corridor', type: 'corridor',
        rects: g, alcoves: g.length - walkable.length,
        y0: 0, y1: 4.80, char: null,
      });
    } else {
      regions.push({
        id: `v${vi++}`, kind: 'void', type: 'void', rects: g, y0: 0, y1: 4.80, char: '#',
      });
    }
  }

  // ---- adjacency -------------------------------------------------------------------------
  const edges = [];
  for (let a = 0; a < regions.length; a++) {
    for (let b = a + 1; b < regions.length; b++) {
      const A = regions[a], B = regions[b];
      let s = 0;
      for (const ra of A.rects) for (const rb of B.rects) s += contactS(ra, rb);
      // a structural contact of one wall thickness or less has NO clear run at all — the two
      // cells meet only at a corner return. Not a boundary; not an edge.
      if (s <= WALL_T + EPS) continue;
      const clear = Math.max(0, s - WALL_T);
      const yLo = Math.max(A.y0, B.y0), yHi = Math.min(A.y1, B.y1);
      const band = Math.max(0, Math.min(yHi, DIG_H) - Math.max(yLo, 0));
      const solid = A.kind === 'void' || B.kind === 'void';
      const diggable = !solid && clear >= L_DIG && band >= DIG_H * 0.5;
      /**
       * 🚨 **THE PHYSICAL WALL RUNS, COMPUTED HERE AND NOWHERE ELSE — AND THIS IS THE FIX FOR
       * JOHN'S "GREEN OPEN DOOR CLIPPING ON THE CORNER OF THE ROOMS AND INTO THE HALLWAY".**
       *
       * `clear` above is a SUM over every touching rect pair. Two regions can meet in more than
       * one place — an L-shaped corridor wrapping a room touches it on an X line and a Z line,
       * and a corridor made of two rects can meet a room in two separate stretches. The old
       * `canDoor` compared that SUM against the 2.48 m a door needs, so a boundary that is
       * physically two 1.4 m stubs claimed a door **no single stretch of it could hold**, and
       * `tools/mapdesigner/` then drew a fixed 2.08 m aperture centred on a 1.1 m run: it hung
       * 0.5 m out of each end, over the room's corner and into the corridor.
       *
       * MEASURED BEFORE THE FIX, 512 seeds: **891 of 11,638 door-bearing wall runs (7.66%) were
       * shorter than 2.48 m; 790 were shorter than the 2.08 m aperture itself**, worst overhang
       * **1.04 m at each end** (a run of clear length 0.00) — and **433 of 512 seeds (84.6%)** had
       * at least one. So it was a plan defect first and a drawing defect second, and it is fixed
       * on the plan side: `canDoor` now asks the LONGEST CONTIGUOUS RUN, which is the only length
       * a door can actually occupy. `selftest()` asserts it with a control that must fail.
       */
      const runs = wallRuns(A, B);
      let runMax = 0, doorRun = -1;
      for (let i = 0; i < runs.length; i++) if (runs[i].clear > runMax + EPS) { runMax = runs[i].clear; doorRun = i; }
      edges.push({
        a: A.id, b: B.id, ai: a, bi: b,
        clear: +clear.toFixed(3), band: +band.toFixed(2),
        diggable, solid, runs, nRuns: runs.length, runMax: +runMax.toFixed(3), doorRun,
        canDoor: !solid && runMax >= L_DOOR - EPS,
      });
    }
  }

  // ---- door states -----------------------------------------------------------------------
  /**
   * "Doors exist but are mostly chained/boarded. Digging beats the ones that do not open."
   *
   * 🚨 **AND `chained` IS NOT "THE DOOR THE HUNTER BATTERS" — IT IS ITS OPPOSITE.** Read off
   * `src/game/connectors.js` and `src/game/room.js` on 2026-08-11, not inferred:
   *
   *   · `CHAINED_DEFS[0]` is `damageable: false`. `WallState.applyDamage` early-outs on it, so
   *     **nothing forces a chained connector** — not the player's hammer, not the nail gun, and
   *     not the hunter.
   *   · `room.chainedDoorsOf()` — the set `hunter-ai.js` walks to and BANGS on — is misleadingly
   *     NAMED. Its filter is `if (!p.state.isDamageable()) continue;` plus "the far side must be
   *     a real space, not `outside`". **It therefore returns the interior BREACHABLE panels and
   *     skips every chained one.** In the shipped house that set is 4 connectors (8 with
   *     `?doors=1`); the house has **zero** interior chained connectors.
   *   · What John SEES wearing a chain is a third thing again: `?tells=blind` (the default) draws
   *     the chain from `seedRand(seed, 'dress.chain|'+id) < 0.50`, **a property of the connector
   *     and never of its state**, so half of everything wears one and it means nothing.
   *
   * So the three states below are three different player experiences and the tool must draw them
   * as such: `open` you walk, `breachable` **you and the hunter both batter**, `chained` nobody
   * forces and the way past it is the wall beside it. `hunterForces` is that distinction, named
   * once here so the designer cannot re-derive it differently.
   */
  for (const e of edges) {
    if (!e.canDoor) { e.door = 'none'; e.hunterForces = false; continue; }
    const u = mkRng(`rrr/genspike/${seed}/door/${e.a}|${e.b}`)();
    e.door = u < 0.22 ? 'open' : (u < 0.55 ? 'breachable' : 'chained');
    e.hunterForces = e.door === 'breachable';
  }

  // ---- the one exit ----------------------------------------------------------------------
  // Exactly one ROOM has a wall to the outside. Frontage = envelope-perimeter run, clear.
  const frontage = regions.map((R) => {
    if (R.kind !== 'room') return 0;
    let f = 0;
    for (const r of R.rects) {
      if (Math.abs(r.x0 - env.x0) < 1e-6) f = Math.max(f, r.z1 - r.z0 - WALL_T);
      if (Math.abs(r.x1 - env.x1) < 1e-6) f = Math.max(f, r.z1 - r.z0 - WALL_T);
      if (Math.abs(r.z0 - env.z0) < 1e-6) f = Math.max(f, r.x1 - r.x0 - WALL_T);
      if (Math.abs(r.z1 - env.z1) < 1e-6) f = Math.max(f, r.x1 - r.x0 - WALL_T);
    }
    return f;
  });
  const exitPool = regions.map((R, i) => i).filter((i) => frontage[i] >= L_DOOR);
  const exitIdx = exitPool.length ? exitPool[Math.floor(mkRng(`rrr/genspike/${seed}/exit`)() * exitPool.length) % exitPool.length] : -1;

  return { seed, align, gap, waste, cutSpan, env, regions, edges, exitIdx, frontage, xs, zs };
}

// ===========================================================================================
// 5. GRAPH PROPERTIES — the §5 gate, plus the hunter check that must survive the deferral
// ===========================================================================================

function componentsOf(n, edgeList) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edgeList) { adj[a].push(b); adj[b].push(a); }
  const comp = new Array(n).fill(-1);
  let c = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const q = [s]; comp[s] = c;
    while (q.length) { const u = q.pop(); for (const v of adj[u]) if (comp[v] < 0) { comp[v] = c; q.push(v); } }
    c++;
  }
  return { comp, count: c };
}
function reachFrom(n, edgeList, src) {
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edgeList) { adj[a].push(b); adj[b].push(a); }
  const seen = new Array(n).fill(false);
  const q = [src]; seen[src] = true;
  while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); } }
  return seen;
}

function measure(plan) {
  const { regions, edges, env, exitIdx } = plan;
  const n = regions.length;
  const rooms = regions.filter((r) => r.kind === 'room');
  const corridors = regions.filter((r) => r.kind === 'corridor');
  const voids = regions.filter((r) => r.kind === 'void');
  const areaR = (R) => R.rects.reduce((s, r) => s + (r.x1 - r.x0 - WALL_T) * (r.z1 - r.z0 - WALL_T), 0);
  const roomArea = rooms.reduce((s, R) => s + areaR(R), 0);
  const corrArea = corridors.reduce((s, R) => s + areaR(R), 0);
  /**
   * ⚠️ RESIDENCY. `procedural-map.md` §4: "a generator that lines rooms up into a long sightline
   * will blow [the draw-call ceiling] instantly ... Residency limits must be a generation
   * constraint, not a runtime hope." A corridor region is a rectilinear POLYGON, so it can be a
   * 60 m L that sees eight rooms at once. `maxCorrSpan` is the longer side of the largest
   * corridor region's bounding box — an UPPER bound on the sightline through it, and the number
   * a residency constraint would have to cap.
   */
  const idx0 = new Map(regions.map((R, i) => [R.id, i]));
  const corrBBs = corridors.map((R) => ({ R, bb: bboxOf(R.rects), a: areaR(R) }));
  const biggest = corrBBs.sort((p, q) => q.a - p.a)[0];
  const maxCorrArea = biggest ? biggest.a : 0;
  const maxCorrSpan = biggest ? Math.max(biggest.bb.x1 - biggest.bb.x0, biggest.bb.z1 - biggest.bb.z0) - WALL_T : 0;
  /** rooms whose only diggable neighbour set is inside that one region — all visible at once. */
  const roomsOnBiggest = biggest
    ? rooms.filter((R) => {
      const i = idx0.get(R.id), j = idx0.get(biggest.R.id);
      return edges.some((e) => ((e.ai === i && e.bi === j) || (e.bi === i && e.ai === j)) && e.clear >= L_DIG);
    }).length
    : 0;
  const voidArea = voids.reduce((s, R) => s + Math.max(0, areaR(R)), 0);

  // ---- boundary accounting ---------------------------------------------------------------
  // INTERNAL boundary = every metre of wall with a cell on both sides (incl. void faces).
  // EXTERIOR boundary = the envelope perimeter, clear.
  let internal = 0, diggable = 0, tooShort = 0, voidFacing = 0;
  for (const e of edges) {
    internal += e.clear;
    if (e.solid) voidFacing += e.clear;
    else if (e.diggable) diggable += e.clear;
    else tooShort += e.clear;
  }
  // exterior: perimeter of the envelope, minus wall band at each corner
  const perim = 2 * ((env.x1 - env.x0) + (env.z1 - env.z0)) - 4 * WALL_T;
  const total = internal + perim;

  // ---- slivers ---------------------------------------------------------------------------
  const sliverEdges = edges.filter((e) => !e.solid && e.clear < L_DIG).length;
  /**
   * 🚨 THE SHARPEST FORM OF "TOO SHORT TO HOLD A DIG FACE", AND THE TWO THRESHOLDS IN `dig.js`
   * DISAGREE WITH EACH OTHER. `freePanels()` accepts any span >= 1.20 m, but the only span
   * lengths `DIG_EDGES` authors are 2.56 / 2.96 / 5.72, and `wallinstances.js` groups by
   * `w x h x t` so a fourth length is a fourth `InstancedMesh` group. With the >= 0.20 m end
   * margins the shipped table also obeys, the shortest boundary that can carry an AUTHORED span
   * is 2.96 m — 2.5x the guard. Every metre between 1.20 and 2.96 is diggable by `dig.js`'s own
   * rule and unbuildable by `wallinstances.js`'s.
   */
  const spannable = edges.filter((e) => e.diggable && planSpans(e.clear).length > 0);
  const unspannable = edges.filter((e) => e.diggable && planSpans(e.clear).length === 0);
  const unspannableM = unspannable.reduce((s, e) => s + e.clear, 0);
  const nSpans = spannable.reduce((s, e) => s + planSpans(e.clear).length, 0);
  const sliverRects = corridors.reduce((s, R) => s + R.alcoves, 0);
  const narrowCorridors = corridors.filter((R) => R.rects.every((r) => minDim(r) < W_MIN_S)).length;

  /**
   * ---- 🧱 THE SLAB ARM, ON THESE SAME BOUNDARIES ------------------------------------------
   * The tiled arm above counts `nSpans` — 2.56/2.96/5.72 m panels with 0.28 m of ordinary wall
   * between them, and it is the arm that needs §7.3's 2.96 m MINIMUM. The slab arm needs no
   * minimum at all and needs a MAXIMUM instead (`SLAB_MAX`). These count what the same walls
   * become under it, so the two are comparable rather than argued about.
   *
   * `slabDoorSplit` is the number that must never be quietly dropped: it is how many walls come
   * out with a seam in them **because a slab cannot contain an aperture yet**.
   */
  const segsM = boundarySegments(plan);
  const digSegs = segsM.filter((s) => s.diggable);
  const slabFaces = digSegs.reduce((k, s) => k + s.slabs.n, 0);
  const slabWhole = digSegs.filter((s) => s.slabs.reason === 'one').length;
  const slabDoorSplit = digSegs.filter((s) => s.slabs.reason === 'door' || s.slabs.reason === 'door+cap').length;
  const slabCapSplit = digSegs.filter((s) => s.slabs.reason === 'cap' || s.slabs.reason === 'door+cap').length;
  const longestRun = segsM.reduce((k, s) => Math.max(k, s.clear), 0);
  /** 🚨 THE FIXED DEFECT, RE-ASSERTED ON EVERY PLAN: a door drawn on a run too short to hold it. */
  const doorOverhang = segsM.filter((s) => s.door !== 'none' && s.clear < L_DOOR - 1e-6).length;
  const multiRunEdges = edges.filter((e) => e.nRuns > 1).length;

  // ---- graphs ----------------------------------------------------------------------------
  const idx = new Map(regions.map((R, i) => [R.id, i]));
  const eOpen = edges.filter((e) => e.door === 'open').map((e) => [e.ai, e.bi]);
  const ePlay = edges.filter((e) => e.door === 'open' || e.door === 'breachable' || e.diggable).map((e) => [e.ai, e.bi]);
  const eHunter = edges.filter((e) => !e.solid && e.clear >= L_DIG).map((e) => [e.ai, e.bi]);
  const solidIdx = new Set(regions.map((R, i) => (R.kind === 'void' ? i : -1)).filter((i) => i >= 0));

  const spawnPool = regions.map((R, i) => i).filter((i) => R_isRoom(regions[i]) && i !== exitIdx);
  const spawn = spawnPool.length
    ? spawnPool[Math.floor(mkRng(`rrr/genspike/${plan.seed}/spawn`)() * spawnPool.length) % spawnPool.length]
    : 0;

  const seenPlay = reachFrom(n, ePlay, spawn);
  // COST TO CROSS THE HOUSE. A corridor between two rooms doubles the shared wall but also
  // doubles the digs, so this is the number that says what the warren costs the player.
  const wEdges = edges.filter((e) => e.door === 'open' || e.door === 'breachable' || e.diggable)
    .map((e) => ({ a: e.ai, b: e.bi, dig: e.door === 'open' ? 0 : 1 }));
  const adjW = Array.from({ length: n }, () => []);
  for (const e of wEdges) { adjW[e.a].push([e.b, e.dig]); adjW[e.b].push([e.a, e.dig]); }
  const dist = new Array(n).fill(Infinity), hops = new Array(n).fill(Infinity);
  dist[spawn] = 0; hops[spawn] = 0;
  for (let it = 0; it < n; it++) {
    for (let u = 0; u < n; u++) { if (dist[u] === Infinity) continue;
      for (const [v, w] of adjW[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; hops[v] = hops[u] + 1; } }
  }
  const digsToExit = exitIdx >= 0 && dist[exitIdx] < Infinity ? dist[exitIdx] : -1;
  const hopsToExit = exitIdx >= 0 && hops[exitIdx] < Infinity ? hops[exitIdx] : -1;
  const live = regions.map((R, i) => i).filter((i) => !solidIdx.has(i));
  const allReach = live.every((i) => seenPlay[i]);
  const exitReach = exitIdx >= 0 && seenPlay[exitIdx];

  // HUNTER: he comes through the wall, so his graph is every non-void boundary long enough to
  // hold a dig face. A room he cannot reach is a room the hunter campaign cannot use.
  const seenHunt = reachFrom(n, eHunter, spawn);
  const hunterAll = live.every((i) => seenHunt[i]);
  // and the corridor warren he is supposed to live in: is every room on it?
  const corrIdx = new Set(regions.map((R, i) => (R.kind === 'corridor' ? i : -1)).filter((i) => i >= 0));
  const onCorr = rooms.filter((R) => {
    const i = idx.get(R.id);
    return edges.some((e) => ((e.ai === i && corrIdx.has(e.bi)) || (e.bi === i && corrIdx.has(e.ai))) && e.clear >= L_DIG);
  }).length;
  const roomsOnCorridor = onCorr === rooms.length;
  const roomsOnCorridorFrac = rooms.length ? onCorr / rooms.length : 0;
  const corrEdges = eHunter.filter(([a, b]) => corrIdx.has(a) && corrIdx.has(b));
  const corrComp = corrIdx.size ? componentsOf(n, corrEdges).comp : null;
  const corrNets = corrIdx.size ? new Set([...corrIdx].map((i) => corrComp[i])).size : 0;

  // degree distribution over diggable edges
  const deg = new Array(n).fill(0);
  for (const e of edges) if (e.diggable) { deg[e.ai]++; deg[e.bi]++; }
  const liveDeg = live.map((i) => deg[i]);
  const roomDeg = live.filter((i) => regions[i].kind === 'room').map((i) => deg[i]);
  const corrDeg = live.filter((i) => regions[i].kind === 'corridor').map((i) => deg[i]);
  const maxDeg = Math.max(0, ...liveDeg);
  const maxRoomDeg = Math.max(0, ...roomDeg);
  /** rooms with exactly one diggable neighbour — chapel-like dead ends. A few are good. */
  const deadEndRooms = roomDeg.filter((d) => d <= 1).length;
  /** a CORRIDOR touching every other region is a spine, and it is the thing we want. */
  const spineCorridor = corrDeg.some((d) => d >= live.length - 1) && live.length >= 6;
  // degenerate: one region touching (almost) everything
  /** THE failure mode the brief names: a typed ROOM touching everything flattens the plan. */
  const degenerate = maxRoomDeg >= live.length - 1 && live.length >= 6;

  /**
   * ---------------------------------------------------------------------------------------
   * THE DIFFICULTY SLOT. John: "eventually the tool can estimate the difficulty of the map when
   * the hunter is better developed and more of a threat."
   *
   * 🚨 THERE IS DELIBERATELY NO SCORE HERE. Inventing a difficulty number now would be guessing
   * at a system that does not exist — the hunter is deferred (`procedural-map.md` §6) and every
   * weight would be a fiction that then gets quoted back as a measurement. What IS here is every
   * static graph property a difficulty model will need, computed and named, so that when the
   * hunter exists the model is a weighted sum over `difficulty.*` and nothing else has to move.
   * `tools/mapdesigner/` shows this block on screen with the score line reading NOT MODELLED YET.
   * ---------------------------------------------------------------------------------------
   */
  const liveSet = new Set(live);
  const liveEdges = edges.filter((e) => !e.solid && liveSet.has(e.ai) && liveSet.has(e.bi));
  const { count: nComp } = componentsOf(n, liveEdges.map((e) => [e.ai, e.bi]));
  /** cyclomatic number over the LIVE adjacency graph — "no loop" is §7.1's other flatness tell. */
  const loops = liveEdges.length - live.length + (nComp - (n - live.length));
  /** how far the far corner of the house is, in digs, from spawn — the run's real length. */
  const reachable = live.filter((i) => dist[i] < Infinity);
  const eccDigs = reachable.length ? Math.max(...reachable.map((i) => dist[i])) : 0;
  const eccHops = reachable.length ? Math.max(...reachable.map((i) => hops[i])) : 0;
  const meanDigs = reachable.length ? reachable.reduce((s, i) => s + dist[i], 0) / reachable.length : 0;
  /** SIGHTLINE. The longest straight run of continuous floor inside one region, clear metres. */
  let sightMax = 0;
  for (const i of live) {
    const bb = bboxOf(regions[i].rects);
    sightMax = Math.max(sightMax, Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0) - WALL_T);
  }
  const flat = flatness(plan);

  return {
    seed: plan.seed,
    nRooms: rooms.length, nCorridors: corridors.length, nVoids: voids.length, nRegions: live.length,
    roomArea, corrArea, voidArea,
    corridorShare: corrArea / (roomArea + corrArea),
    envArea: (env.x1 - env.x0) * (env.z1 - env.z0),
    fill: (roomArea + corrArea) / ((env.x1 - env.x0) * (env.z1 - env.z0)),
    sharedM: internal, diggableM: diggable, exteriorM: perim, voidFacingM: voidFacing,
    fracInternal: internal > 0 ? diggable / internal : 0,
    fracTotal: total > 0 ? diggable / total : 0,
    sliverEdges, sliverRects, narrowCorridors,
    unspannableEdges: unspannable.length, unspannableM, nSpans,
    // 🧱 slab arm
    slabFaces, slabWhole, slabDoorSplit, slabCapSplit, slabRuns: digSegs.length,
    longestRun: +longestRun.toFixed(2), slabMax: SLAB_MAX,
    doorOverhang, multiRunEdges,
    nEdges: edges.length, nDig: edges.filter((e) => e.diggable).length,
    deg: liveDeg, roomDeg, corrDeg, maxDeg, maxRoomDeg, deadEndRooms, degenerate, spineCorridor,
    maxCorrArea, maxCorrSpan, roomsOnBiggest,
    allReach, exitReach, hunterAll, digsToExit, hopsToExit, roomsOnCorridor, roomsOnCorridorFrac, corrNets, corrNet1: corrNets <= 1,
    /** `procedural-map.md` §5.4 — "a minimum walk ... so a run cannot be won in eight seconds". */
    minWalk: digsToExit >= 2 || hopsToExit >= 3,
    spawn, exitIdx,
    doorsOpen: edges.filter((e) => e.door === 'open').length,
    doorsChained: edges.filter((e) => e.door === 'chained').length,
    doorsBreachable: edges.filter((e) => e.door === 'breachable').length,

    // --- §7.1 flatness, flattened into the sweep so `--sweep` reports it too ----------------
    depth: flat.depth, depthMean: flat.depthMean, depthMax: flat.depthMax, rank2: flat.rank2, aspect: flat.aspect,
    isFlat: flat.flat, isShallow: flat.shallow, flat,

    // --- the difficulty slot ----------------------------------------------------------------
    difficulty: {
      score: null,                       // ⚠️ NOT MODELLED YET — see the block comment above
      model: 'none — the hunter is deferred (procedural-map.md §6)',
      /** ROUTE. How long the solution is, in the currency the player spends. */
      routeDigs: digsToExit, routeRegions: hopsToExit,
      /** the whole house, not just the exit: how deep does it get? */
      farthestDigs: eccDigs, farthestRegions: eccHops, meanDigsFromSpawn: +meanDigs.toFixed(2),
      /** TOPOLOGY. Dead ends are traps; loops are escape routes. */
      deadEndRooms, loops, corridorNetworks: corrNets,
      /** every room he can hear you from, and the biggest single space he can see across. */
      roomsOnCorridor: onCorr, roomsTotal: rooms.length,
      longestSightline: +sightMax.toFixed(2), biggestCorridorSpan: +maxCorrSpan.toFixed(2),
      roomsOnBiggestCorridor: roomsOnBiggest,
      /** COVER. How much of the house he can come through, and how much is a hard stop. */
      diggableEdges: edges.filter((e) => e.diggable).length,
      undiggableEdges: edges.filter((e) => !e.diggable).length,
      diggableFraction: +(internal > 0 ? diggable / internal : 0).toFixed(4),
      openDoors: edges.filter((e) => e.door === 'open').length,
      /** SHAPE. A flat house is an easy house to read and a dull one to hunt in. */
      depthMean: flat.depthMean, isFlat: flat.flat, isShallow: flat.shallow,
    },
  };
}
const R_isRoom = (R) => R.kind === 'room';

// ===========================================================================================
// 6. ASCII
// ===========================================================================================

const CH = 'ABCDEFGHIJKLMNOPQRSTUVWX';
const ch2 = 'abcdefghijklmnopqrstuvwxyz';

function ascii(plan, mx = 1.35, mz = 2.70) {
  const { env, regions } = plan;
  const W = Math.ceil((env.x1 - env.x0) / mx), H = Math.ceil((env.z1 - env.z0) / mz);
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
  const label = new Map();
  let ri = 0, ci = 0;
  for (const R of regions) {
    if (R.kind === 'room') label.set(R.id, CH[ri++ % CH.length]);
    else if (R.kind === 'corridor') label.set(R.id, ch2[ci++ % ch2.length]);
    else label.set(R.id, '#');
  }
  for (let j = 0; j < H; j++) {
    const cz = env.z0 + (j + 0.5) * mz;
    for (let i = 0; i < W; i++) {
      const cx = env.x0 + (i + 0.5) * mx;
      for (const R of regions) {
        if (R.rects.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1)) { grid[j][i] = label.get(R.id); break; }
      }
    }
  }
  const m = measure(plan);
  const lines = [];
  lines.push(`+${'-'.repeat(W)}+`);
  for (const row of grid) lines.push(`|${row.join('')}|`);
  lines.push(`+${'-'.repeat(W)}+`);
  const leg = regions.filter((R) => R.kind === 'room')
    .map((R, i) => `${label.get(R.id)}=${R.type}${R.rot ? '°' : ''}${plan.regions.indexOf(R) === plan.exitIdx ? '*' : ''}`).join(' ');
  lines.push(`seed ${plan.seed} | ${leg} | corridors ${m.nCorridors} | * = the one exit`);
  lines.push(`  ${(env.x1 - env.x0).toFixed(1)} x ${(env.z1 - env.z0).toFixed(1)} m  ·  shared ${m.sharedM.toFixed(0)} m, `
    + `diggable ${(100 * m.fracInternal).toFixed(1)}% of internal / ${(100 * m.fracTotal).toFixed(1)}% of all  ·  `
    + `corridor ${(100 * m.corridorShare).toFixed(0)}% of floor  ·  slivers ${m.sliverEdges}e/${m.sliverRects}a/${m.nVoids}v`);
  return lines.join('\n');
}

// ===========================================================================================
// 7. JSON graph — the shape a real generator would have to emit
// ===========================================================================================

function toJSON(plan) {
  const m = measure(plan);
  return {
    seed: plan.seed, align: plan.align,
    envelope: { x0: +plan.env.x0.toFixed(2), x1: +plan.env.x1.toFixed(2), z0: +plan.env.z0.toFixed(2), z1: +plan.env.z1.toFixed(2) },
    spaces: plan.regions.map((R, i) => ({
      id: R.id, kind: R.kind, type: R.type, rot: !!R.rot,
      // CLEAR extents, `spaces.js` convention: structural deflated by WALL_T/2
      rects: R.rects.filter((r) => (r.x1 - r.x0) > WALL_T + EPS && (r.z1 - r.z0) > WALL_T + EPS).map((r) => ({
        x0: +(r.x0 + WALL_T / 2).toFixed(2), x1: +(r.x1 - WALL_T / 2).toFixed(2),
        z0: +(r.z0 + WALL_T / 2).toFixed(2), z1: +(r.z1 - WALL_T / 2).toFixed(2),
      })),
      y0: R.y0, storey: R.y1,
      exit: i === plan.exitIdx || undefined,
      spawn: i === m.spawn || undefined,
    })),
    edges: plan.edges.map((e) => ({
      a: e.a, b: e.b, clear: e.clear, band: e.band,
      diggable: e.diggable, solid: e.solid, door: e.door,
      /** how many separate stretches of wall this one boundary is, and the longest of them —
       *  the length the door had to fit in. See `wallRuns`. */
      runs: e.nRuns, runMax: e.runMax,
      /** `room.chainedDoorsOf()`'s set: the hunter batters BREACHABLE, never CHAINED. */
      hunterForces: !!e.hunterForces,
      // how a real DIG_EDGES row would come out of this: spans that fit the authored lengths
      spans: e.diggable ? planSpans(e.clear) : [],
    })),
    /** WHERE every boundary is, content-hashed — §9.2's "id is a property of the wall". */
    boundaries: boundarySegments(plan).map((s) => ({
      key: s.key, a: s.a, b: s.b, axis: s.axis, at: +s.at.toFixed(2),
      lo: +s.lo.toFixed(2), hi: +s.hi.toFixed(2), clear: +s.clear.toFixed(2),
      diggable: s.diggable, solid: s.solid, door: s.door,
      hunterForces: s.hunterForces, run: s.run, ofRuns: s.nRuns,
      spans: s.spans,
      /** the SLAB arm's answer for this same wall: how many faces, and what forced the split */
      slabs: s.slabs.n, slabWhy: s.slabs.reason,
      interconnect: s.diggable ? interconnectOn(plan.seed, s.key, s.spans) : null,
    })),
    difficulty: m.difficulty,
    flatness: m.flat,
    gate: {
      allRoomsReachable: m.allReach, exitReachable: m.exitReach,
      hunterReachesAll: m.hunterAll, everyRoomOnCorridor: m.roomsOnCorridor,
      corridorNetworks: m.corrNets,
    },
    metrics: {
      sharedWallM: +m.sharedM.toFixed(1), diggableM: +m.diggableM.toFixed(1),
      exteriorM: +m.exteriorM.toFixed(1),
      fracInternalDiggable: +m.fracInternal.toFixed(4), fracAllDiggable: +m.fracTotal.toFixed(4),
      corridorShare: +m.corridorShare.toFixed(4),
      sliverEdges: m.sliverEdges, alcoves: m.sliverRects, voids: m.nVoids,
    },
  };
}

/**
 * How the clear run of a boundary would be cut into dig spans. Greedy over the three lengths
 * `DIG_EDGES` already authors (2.56 / 2.96 / 5.72) with >= 0.20 m of ordinary wall between and
 * at the ends — the `wallinstances.js` aperture-group constraint the shipped table obeys. Any
 * length outside that set is a fourth InstancedMesh group and a draw-call regression.
 */
function planSpans(clear) {
  return planSpanLayout(clear).map((s) => s.len);
}

/**
 * The same greedy cut, but keeping WHERE each span lands along the clear run.
 *
 * ⚠️ EXISTS FOR THE DESIGNER, WHICH DRAWS THE PANELS RATHER THAN COUNTING THEM. `planSpans` is
 * now a projection of this so the two cannot disagree — the tool's picture of a boundary and the
 * sweep's `nSpans` column are the same computation. Offsets are measured from the START of the
 * boundary's CLEAR run, i.e. 0.15 in from the structural corner at each end.
 */
function planSpanLayout(clear) {
  const out = [];
  let cur = 0.20;
  const budget = clear - 0.20;
  const lens = AUTHORED_SPANS.slice().sort((a, b) => b - a);
  while (cur < budget) {
    const fit = lens.find((L) => cur + L <= budget + 1e-9);
    if (!fit) break;
    out.push({ at: +cur.toFixed(3), len: +fit.toFixed(2) });
    cur += fit + 0.28;
  }
  return out;
}

// ===========================================================================================
// 7b. DRAW GEOMETRY — where every boundary physically IS
// ===========================================================================================

/**
 * 🚨 CONTENT-HASHED BOUNDARY KEY — `house-packing.md` §9.2's "softer mitigation worth taking".
 *
 * `DIG_EDGES` ids are a network protocol surface: two clients that derive different ids for the
 * same wall desync silently rather than crashing. Keying on array INDEX means a change to
 * candidate ORDER renumbers a boundary that did not move. Keying on the sorted type pair plus the
 * rounded world line makes the id a property of the WALL, so only a wall that actually moved gets
 * a new id. Rounded to the centimetre, which is the precision `spaces.js` authors at.
 */
function edgeKey(aType, bType, axis, at, lo, hi) {
  const [t0, t1] = [aType, bType].sort();
  const r = (v) => Math.round(v * 100) / 100;
  return `${t0}|${t1}|${axis}${r(at).toFixed(2)}|${r(lo).toFixed(2)}..${r(hi).toFixed(2)}`;
}

/**
 * EVERY SHARED WALL IN THE PLAN, AS GEOMETRY — the seam the map designer draws through.
 *
 * `measure()` answers "how many metres of boundary are diggable"; this answers "and WHERE are
 * they", which is the question a picture asks. One entry per contiguous wall run between two
 * regions: the structural line (`axis`, `at`), the structural extent (`lo`..`hi`), the CLEAR run
 * inset 0.15 m at each end for the corner returns, and the authored dig panels that run would be
 * cut into. Summing `clear` over the returned list must equal `measure().sharedM` to floating
 * point — the designer asserts exactly that on every render and shows the result, because a tool
 * that draws a plan wrongly is worse than no tool.
 */
/**
 * 🚨 **THE ONE PLACE A WALL RUN IS COMPUTED.** `planFromRooms` calls it while building the edge
 * (so `canDoor` can ask the longest run) and `boundarySegments` reads the answer back off the edge
 * rather than working it out again. Two implementations of "where is this wall" is precisely the
 * drift the designer's whole architecture exists to prevent.
 *
 * One entry per contiguous run: two rects of the SAME region meeting the same wall line are ONE
 * run, not two, so the intervals are merged per (axis, line).
 */
function wallRuns(A, B) {
  const byLine = new Map();
  for (const ra of A.rects) for (const rb of B.rects) {
    let axis = null, at = 0, lo = 0, hi = 0;
    if (Math.abs(ra.x1 - rb.x0) < EPS || Math.abs(rb.x1 - ra.x0) < EPS) {
      axis = 'x'; at = Math.abs(ra.x1 - rb.x0) < EPS ? ra.x1 : ra.x0;
      lo = Math.max(ra.z0, rb.z0); hi = Math.min(ra.z1, rb.z1);
    } else if (Math.abs(ra.z1 - rb.z0) < EPS || Math.abs(rb.z1 - ra.z0) < EPS) {
      axis = 'z'; at = Math.abs(ra.z1 - rb.z0) < EPS ? ra.z1 : ra.z0;
      lo = Math.max(ra.x0, rb.x0); hi = Math.min(ra.x1, rb.x1);
    }
    if (!axis || hi - lo <= EPS) continue;
    const k = `${axis}:${at.toFixed(6)}`;
    if (!byLine.has(k)) byLine.set(k, { axis, at, ivs: [] });
    byLine.get(k).ivs.push([lo, hi]);
  }
  const out = [];
  // sorted by line key so the run order is a pure function of the geometry, not of Map insertion
  for (const k of [...byLine.keys()].sort()) {
    const { axis, at, ivs } = byLine.get(k);
    ivs.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const iv of ivs) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }
    for (const [lo, hi] of merged) {
      const struct = hi - lo;
      // clear run: 0.15 corner return at each end, exactly as contactS's `- WALL_T` accounts
      out.push({ axis, at, lo, hi, struct: +struct.toFixed(4), clear: +Math.max(0, struct - WALL_T).toFixed(4) });
    }
  }
  return out;
}

function boundarySegments(plan) {
  const { regions, edges } = plan;
  const out = [];
  for (const e of edges) {
    const A = regions[e.ai], B = regions[e.bi];
    const runs = e.runs || wallRuns(A, B);
    for (let i = 0; i < runs.length; i++) {
      const { axis, at, lo, hi, struct, clear } = runs[i];
      /**
       * 🚪 **THE DOOR BELONGS TO ONE RUN, NOT TO THE BOUNDARY.** A door state is one aperture in
       * one place; this used to be stamped on every run of a multi-run boundary, so ONE door was
       * painted two and three times in different parts of the house. **2,349 of 11,356 edges over
       * 512 seeds (20.7%) drew a duplicate.** `doorRun` is the longest run, which is the one
       * `canDoor` was decided on, so the aperture is drawn exactly where the plan says it fits.
       */
      const isDoorRun = i === e.doorRun;
      out.push({
        a: e.a, b: e.b, ai: e.ai, bi: e.bi, axis, at,
        lo, hi, cLo: lo + WALL_T / 2, cHi: hi - WALL_T / 2,
        struct, clear,
        diggable: e.diggable, solid: e.solid,
        door: isDoorRun ? e.door : 'none',
        edgeDoor: e.door, hunterForces: isDoorRun && !!e.hunterForces,
        canDoor: e.canDoor, run: i, nRuns: runs.length,
        band: e.band,
        spans: e.diggable ? planSpanLayout(clear) : [],
        slabs: slabLayout(clear, isDoorRun && e.door && e.door !== 'none'),
        key: edgeKey(A.type, B.type, axis, at, lo, hi),
      });
    }
  }
  return out;
}

/**
 * 🧱 **WHAT THIS WALL RUN WOULD ACTUALLY BECOME ON THE SLAB ARM — one face, or the fewest faces
 * that stay under the cap, and WHY it had to be more than one.**
 *
 * `dig.js` `SLAB`, verbatim on the one thing that is NOT solved: *"'This wall has no door in it'
 * is not 'a slab can contain a door'… A slab must still be able to CONTAIN an aperture, **or the
 * generator must emit one slab per contiguous run.**"* Splitting at the aperture is that second
 * option and it is the honest one to draw — but it is a cost, not a solution, and John's own words
 * are why: *"I want each entire wall to be one single destructive wall **without any seams**."*
 * **A door puts a seam in the wall, in the middle, where he asked for none.** The tool says so on
 * the boundary rather than pretending the wall came out whole.
 *
 * @param clear   the run's clear length, metres
 * @param hasDoor whether this run carries the boundary's aperture
 * @returns `{ pieces:[{at,len}], n, reason }` — `reason` is 'one' | 'door' | 'cap' | 'door+cap'
 */
function slabLayout(clear, hasDoor) {
  const cut = [];
  if (hasDoor && clear >= CONNECTOR_W) {
    const a = (clear - CONNECTOR_W) / 2;
    cut.push([0, a], [a + CONNECTOR_W, clear]);
  } else {
    cut.push([0, clear]);
  }
  const pieces = [];
  let capped = false;
  for (const [lo, hi] of cut) {
    const L = hi - lo;
    if (L <= EPS) continue;
    const n = Math.max(1, Math.ceil(L / SLAB_MAX - 1e-9));
    if (n > 1) capped = true;
    for (let i = 0; i < n; i++) pieces.push({ at: +(lo + (i * L) / n).toFixed(3), len: +(L / n).toFixed(3) });
  }
  const doored = hasDoor && cut.length > 1;
  return {
    pieces, n: pieces.length,
    reason: doored && capped ? 'door+cap' : doored ? 'door' : capped ? 'cap' : 'one',
  };
}

/**
 * 🕳️ **WHERE THE ONE INTERCONNECT IS — the answer to "is the orange inclusive of the cyan?".**
 *
 * `dig.js` `chooseFreeInterconnect()`, mirrored: **one per shared EDGE** (not per panel), the span
 * chosen with probability proportional to its length (*"otherwise the 2.56 m span is as good a
 * guess as the 5.72 m one and the search collapses to 'try the short walls first'"*), then a
 * seeded offset inside it, `IC_W` = 1.55 m across. Everywhere else on the face, digging bottoms
 * out at `barrier`: visible, impassable, undamageable. **So every orange metre in this tool has
 * cyan behind it except this one blob, and finding it turns the barrier off for the whole house.**
 *
 * ⚠️ It is a PER-RUN fact in the game (derived from the run seed, never baked into the build), so
 * what this draws is *a* legal placement for this plan's seed, not the one a given session will
 * roll. That is stated on the page rather than implied.
 */
function interconnectOn(seed, key, spans) {
  if (!spans || !spans.length) return null;
  const total = spans.reduce((n, s) => n + s.len, 0);
  const r = mkRng(`rrr/genspike/${seed}/ic/${key}`);
  let pick = r() * total;
  let sp = spans[spans.length - 1];
  for (const s of spans) { if (pick < s.len) { sp = s; break; } pick -= s.len; }
  const half = Math.min(IC_W, sp.len) / 2;
  const at = sp.at + half + r() * Math.max(0, sp.len - 2 * half);
  return { at: +at.toFixed(3), w: +Math.min(IC_W, sp.len).toFixed(3) };
}

// ===========================================================================================
// 7c. FLATNESS — `house-packing.md` §7.1, the failure no summary number caught
// ===========================================================================================

/**
 * 🚨 "TWO OF THE TEN SAMPLE PLANS ARE ONE ROW OF ROOMS. THEY SCORE WELL AND THEY ARE THE DULLEST
 * HOUSES IN THE SET. THE TRUE RATE IS UNKNOWN." — `house-packing.md` §7.1. This measures it.
 *
 * ⚠️ THIS THRESHOLD IS MINE AND IT IS STATED, NOT SOURCED, in the same way `W_MIN` is. What the
 * eye is catching in seeds 5 and 9 is that the house has no SECOND RANK: walk down the long axis
 * and there is never a room behind another room. So:
 *
 *   `depthMean` = the average number of rooms an observer crosses walking the SHORT axis, area-
 *   weighted along the long axis. A perfect single file of rooms is exactly 1.00. Two full ranks
 *   is 2.00.
 *
 * A plan is FLAT when `depthMean < 1.25` — a house that is a single rank for at least three
 * quarters of its length. It is SHALLOW (worth a look, not a failure) between 1.25 and 1.50.
 * The cut was chosen by ranking all 512 seeds and reading where seeds 5 and 9 sit; both land in
 * the flat band and none of the other eight sample plans do. `--flat` prints that ranking so the
 * threshold can be re-argued against the data rather than against this comment.
 *
 * The other two numbers are reported because they are what a *fix* would move:
 *   `aspect`  — envelope long/short. Flat plans are long, but so are good ones (seed 4 is 2.57
 *               and is a fine stacked plan), so aspect ALONE is not the test and must not be used
 *               as one.
 *   `rank2`   — the fraction of the long axis that has two or more rooms across it.
 */
function flatness(plan) {
  const rooms = plan.regions.filter((r) => r.kind === 'room').map((r) => r.rects[0]);
  const env = plan.env;
  const W = env.x1 - env.x0, D = env.z1 - env.z0;
  const L = Math.max(W, D), S = Math.min(W, D);

  /** for one axis: the slab profile of "how many rooms does a scanline cross here". */
  const profile = (ivs) => {
    const cuts = uniqSorted(ivs.flat());
    const slabs = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1], t = (a + b) / 2;
      let c = 0;
      for (const iv of ivs) if (iv[0] < t && iv[1] > t) c++;
      slabs.push({ a, b, c });
    }
    let wsum = 0, wlen = 0, deep = 0, max = 0;
    for (const s of slabs) {
      if (s.c === 0) continue;                   // corridor-only slab: not part of the rank count
      const dl = s.b - s.a;
      wsum += s.c * dl; wlen += dl; max = Math.max(max, s.c);
      if (s.c >= 2) deep += dl;
    }
    return { slabs, max, mean: wlen > 0 ? wsum / wlen : 0, rank2: wlen > 0 ? deep / wlen : 0 };
  };

  const px = profile(rooms.map((r) => [r.x0, r.x1]));   // slabs along X -> rooms a VERTICAL line crosses
  const pz = profile(rooms.map((r) => [r.z0, r.z1]));   // slabs along Z -> rooms a HORIZONTAL line crosses
  const longIsX = W >= D;
  const pl = longIsX ? px : pz;                         // the profile along the LONG axis

  /**
   * 🚨 `depth` IS `critic-corridor-1`'s METRIC AND IT IS THE ONE THAT CARRIES THE CONTROL.
   *
   *   depth = min(rooms crossed by a horizontal line, rooms crossed by a vertical line)
   *
   * Two hand-labelled flat plans score 2; the good ones score 3. Crucially it took the control
   * `house-packing.md` §7.1 never did: **THE AUTHORED MANSION SCORES 3.** That is the one house
   * in this project we know is good, so any flatness rule that fails it is wrong by definition —
   * `--flat` asserts it on every run and `selftest()` will not pass without it.
   *
   * ⚠️ IT REPLACES THE CONTINUOUS `depthMean < 1.25` RULE I WROTE FIRST, which had no control and
   * put the flat rate at 0.4%. Against the authored house the integer rule reads 42.4%, and 42.4%
   * is the number to plan against. `depthMean` is kept because it is what a *fix* would move
   * smoothly — an integer cannot tell you whether a scoring tweak is helping — but it is no longer
   * what decides the verdict.
   */
  const depth = Math.min(px.max, pz.max);

  return {
    depth, flat: depth <= 2, good: depth >= 3,
    crossedH: pz.max, crossedV: px.max,
    depthMean: +pl.mean.toFixed(3), depthMax: pl.max, rank2: +pl.rank2.toFixed(3),
    aspect: +(L / S).toFixed(3), envLong: +L.toFixed(1), envShort: +S.toFixed(1),
    /** kept for the strip drawing in `tools/mapdesigner/`: the long-axis slab profile. */
    slabs: pl.slabs, longIsX,
    shallow: depth >= 3 && pl.mean < 1.50,
  };
}

// ===========================================================================================
// 7d. THE CONTROL — the house that actually shipped
// ===========================================================================================

/**
 * 🚨 THE AUTHORED MANSION, PUT THROUGH THE SAME PIPE AS A GENERATED ONE.
 *
 * `house-packing.md` measured 512 generated plans and never once measured the house the game
 * ships, so every threshold in it was argued against other generated plans rather than against
 * the one layout we know is good. `critic-corridor-1` took that control and it immediately moved
 * the flat-plan rule. This function is that control, kept in the harness so it cannot rot.
 *
 * Footprints read out of `src/game/spaces.js` on 2026-08-09 (CLEAR extents, inflated to
 * structural here). Nothing in `src/` is imported — the numbers are copied and the copy is
 * checked by `selftest()` against `LIBRARY`.
 *
 * ⚠️ ONE HONEST CAVEAT. The real house is NOT a complete partition of its own bounding box: the
 * chapel is a spur off the gallery's north-west corner and the space beside it is *outside*.
 * Running it through `planFromRooms` therefore invents corridor and void where the real house has
 * garden. Flatness, room adjacency and room-to-room boundary are unaffected and are what this
 * control is for; envelope fill and corridor share are NOT meaningful for it and are not quoted.
 */
const AUTHORED = [
  // id in spaces.js       type        clear x0     x1      z0       z1     storey
  ['gallery',  'gallery',  -13.60,  13.60, -31.00, -24.30, 5.60],
  ['study_w',  'study',    -13.60,  -2.00, -24.00,  -8.60, 4.80],
  ['service',  'service',   -1.70,   1.70, -24.00,  -8.60, 4.80],
  ['study_e',  'study',      2.00,  13.60, -24.00,  -8.60, 4.80],
  ['ballroom', 'ballroom', -13.60,  13.60,  -8.30,   7.00, 9.60],
  ['chapel',   'chapel',     4.20,  11.00, -37.80, -31.30, 4.80],
];
/** `DIG_EDGES` as it stands on disk after `digcover-1`: 7 edges, 14 spans. Re-counted 2026-08-09. */
const AUTHORED_DIG = { edges: 7, spans: 14, metres: 47.72 };

function authoredMansion(opts = {}) {
  const H = WALL_T / 2;
  const rooms = AUTHORED.map(([id, type, x0, x1, z0, z1, storey]) => {
    const L = LIBRARY.find((l) => l.type === type);
    const clearW = +(x1 - x0).toFixed(2), clearD = +(z1 - z0).toFixed(2);
    return {
      id, type, storey, char: L.char,
      // rotated iff the authored footprint is the library one turned 90 degrees
      rot: Math.abs(clearW - L.w) > 0.01,
      x0: x0 - H, x1: x1 + H, z0: z0 - H, z1: z1 + H,
    };
  });
  return planFromRooms('authored', rooms, { ...opts, normalise: false });
}

/** `node harness/genspike.mjs --flat 512` — the §7.1 measurement, against the authored control. */
function flatReport(n, o) {
  const rows = [];
  for (let s = 0; s < n; s++) rows.push({ s, ...flatness(buildPlan(s, o)) });
  const nFlat = rows.filter((r) => r.flat).length;
  const out = [];
  out.push(`=== FLAT-PLAN RATE · ${n} seeds · align ${o.align} · gap ${o.gap} · waste ${o.waste} · cut ${o.cutSpan} ===`);
  out.push(`house-packing.md §7.1: "the true rate is unknown — measuring it is the first thing the`);
  out.push(`next agent should do." Metric is critic-corridor-1's:`);
  out.push(`    depth = min(rooms crossed horizontally, rooms crossed vertically);  FLAT = depth <= 2`);
  out.push('');

  // ---- THE CONTROL. Everything below is worthless if this line fails. ----------------------
  const A = flatness(authoredMansion(o));
  const ctlOK = A.depth >= 3;
  out.push(`CONTROL — THE AUTHORED MANSION (src/game/spaces.js), the one house we know is good:`);
  out.push(`   crossed horizontally ${A.crossedH} · vertically ${A.crossedV} · depth ${A.depth}`
    + `   ${ctlOK ? '✓ PASSES (>= 3, as it must)' : '✗ FAILS — THE METRIC IS WRONG, NOT THE HOUSE'}`);
  if (!ctlOK) out.push(`   🚨 DO NOT USE THE RATE BELOW. A flatness rule that calls the shipped house flat is a broken rule.`);
  out.push('');

  out.push(`FLAT  (depth <= 2, one file of rooms)   ${nFlat}/${n} = ${(100 * nFlat / n).toFixed(1)}%`);
  out.push(`OK    (depth >= 3)                      ${n - nFlat}/${n} = ${(100 * (n - nFlat) / n).toFixed(1)}%`);
  out.push('');
  const hist = {};
  for (const r of rows) hist[r.depth] = (hist[r.depth] || 0) + 1;
  out.push(`depth distribution:`);
  for (const k of Object.keys(hist).map(Number).sort((a, b) => a - b)) {
    out.push(`   depth ${k}  ${String(hist[k]).padStart(4)}  ${(100 * hist[k] / n).toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(50 * hist[k] / n))}`);
  }
  out.push('');
  const qq = (k, p) => { const a = rows.map((r) => r[k]).sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
  out.push(`depthMean (continuous, what a scoring fix would move smoothly)`);
  out.push(`            p05 ${qq('depthMean', .05).toFixed(2)}  p50 ${qq('depthMean', .5).toFixed(2)}  p95 ${qq('depthMean', .95).toFixed(2)}   authored ${A.depthMean.toFixed(2)}`);
  out.push(`aspect      p05 ${qq('aspect', .05).toFixed(2)}  p50 ${qq('aspect', .5).toFixed(2)}  p95 ${qq('aspect', .95).toFixed(2)}   authored ${A.aspect.toFixed(2)}`);
  out.push('');
  out.push(`FLATTEST 20 SEEDS (open these in MAPS.bat and look at them):`);
  out.push(`   seed  depth  H  V  depthMean  aspect   envelope`);
  const sorted = rows.slice().sort((a, b) => (a.depth - b.depth) || (a.depthMean - b.depthMean));
  for (const r of sorted.slice(0, 20)) {
    out.push(`  ${String(r.s).padStart(5)}  ${String(r.depth).padStart(5)}  ${r.crossedH}  ${r.crossedV}`
      + `  ${r.depthMean.toFixed(3).padStart(9)}  ${r.aspect.toFixed(2).padStart(6)}   ${r.envLong} x ${r.envShort} m`);
  }
  out.push('');
  out.push(`THE TEN SAMPLE PLANS IN house-packing.md §6 — it flagged 5 and 9 by eye:`);
  for (const r of rows.slice(0, 10)) {
    out.push(`  seed ${r.s}  depth ${r.depth} (H${r.crossedH}/V${r.crossedV})  depthMean ${r.depthMean.toFixed(2)}  ${r.flat ? 'FLAT' : 'ok'}`);
  }
  return out.join('\n');
}

// ===========================================================================================
// 8. SWEEP
// ===========================================================================================

const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const f2 = (x) => x.toFixed(2);

function sweep(n, o) {
  const ms = [];
  for (let s = 0; s < n; s++) ms.push(measure(buildPlan(s, o)));
  const col = (k) => ms.map((m) => m[k]);
  const pct = (k) => (100 * ms.filter((m) => m[k]).length / ms.length);
  const line = (name, k, mul = 1, dp = 2) => {
    const v = col(k).map((x) => x * mul);
    return `${name.padEnd(30)} ${f2(mean(v)).padStart(8)} ${f2(q(v, 0.05)).padStart(8)} ${f2(q(v, 0.5)).padStart(8)} ${f2(q(v, 0.95)).padStart(8)}`;
  };
  const allDeg = ms.flatMap((m) => m.deg);
  const hist = {};
  for (const d of allDeg) hist[d] = (hist[d] || 0) + 1;
  const histOf = (key) => { const a = ms.flatMap((m) => m[key]); const h = {}; for (const d of a) h[d] = (h[d] || 0) + 1; return { a, h }; };

  // variety: distinct canonical signatures
  const sigs = new Set(), gsigs = new Set();
  for (let s = 0; s < n; s++) {
    const p = buildPlan(s, o);
    const types = p.regions.filter((r) => r.kind === 'room').map((r) => `${r.type}${r.rot ? 'R' : ''}`).sort().join(',');
    const degs = measure(p).deg.slice().sort((a, b) => a - b).join('-');
    sigs.add(`${types}|${degs}|${p.regions.filter((r) => r.kind === 'corridor').length}`);
    gsigs.add(degs);
  }

  const out = [];
  out.push(`=== ${n} seeds · align ${o.align} · gap ${o.gap} · waste ${o.waste} · cut ${o.cutSpan} ===`);
  out.push(`${''.padEnd(30)} ${'mean'.padStart(8)} ${'p05'.padStart(8)} ${'p50'.padStart(8)} ${'p95'.padStart(8)}`);
  out.push(line('rooms per plan', 'nRooms'));
  out.push(line('corridors per plan', 'nCorridors'));
  out.push(line('void cells per plan', 'nVoids'));
  out.push(line('envelope area  m2', 'envArea'));
  out.push(line('room floor     m2', 'roomArea'));
  out.push(line('corridor floor m2', 'corrArea'));
  out.push(line('corridor share of floor %', 'corridorShare', 100));
  out.push(line('envelope fill  %', 'fill', 100));
  out.push('');
  out.push(line('shared wall (internal)  m', 'sharedM'));
  out.push(line('  of which diggable     m', 'diggableM'));
  out.push(line('exterior perimeter      m', 'exteriorM'));
  out.push(line('DIGGABLE / INTERNAL   %', 'fracInternal', 100));
  out.push(line('DIGGABLE / ALL BOUND. %', 'fracTotal', 100));
  out.push('');
  out.push(line('sliver boundaries (<1.20 m)', 'sliverEdges'));
  out.push(line('alcoves (<1.60 m corridor cell)', 'sliverRects'));
  out.push(line('void groups', 'nVoids'));
  out.push(line('diggable but no authored span', 'unspannableEdges'));
  out.push(line('  metres lost to that      m', 'unspannableM'));
  out.push(line('dig spans emitted per plan', 'nSpans'));
  out.push('');
  out.push(`🧱 THE SLAB ARM ON THE SAME WALLS (dig.js SLAB · cap ${SLAB_MAX} m, NO minimum):`);
  out.push(line('contiguous diggable wall runs', 'slabRuns'));
  out.push(line('  slab faces they become', 'slabFaces'));
  out.push(line('  of which ONE whole wall', 'slabWhole'));
  out.push(line('  SPLIT BY A DOOR (the blocker)', 'slabDoorSplit'));
  out.push(line(`  split by the ${SLAB_MAX} m cap`, 'slabCapSplit'));
  out.push(line('longest single wall run   m', 'longestRun'));
  out.push('');
  out.push(`🚪 DOOR GEOMETRY (the "green door clipping into the hallway" defect, now gated):`);
  out.push(line('boundaries that are >1 wall run', 'multiRunEdges'));
  out.push(line('doors on a run too short  MUST BE 0', 'doorOverhang'));
  out.push('');
  out.push(line('void floor lost m2', 'voidArea'));
  out.push(line('boundary onto void  m', 'voidFacingM'));
  out.push(line('max diggable degree', 'maxDeg'));
  out.push(line('rooms fronting a corridor %', 'roomsOnCorridorFrac', 100));
  out.push(line('spawn->exit: regions crossed', 'hopsToExit'));
  out.push(line('spawn->exit: walls to dig', 'digsToExit'));
  out.push('');
  out.push(`FLATNESS (house-packing.md §7.1 — the failure no summary number caught, now one does):`);
  out.push(line('depth = min(crossed H, crossed V)', 'depth'));
  out.push(line('rank depth (continuous)', 'depthMean'));
  out.push(line('envelope aspect long/short', 'aspect'));
  out.push(`   FLAT (depth <= 2, one file of rooms)              ${pct('isFlat').toFixed(1)}%`);
  out.push(`   control: the AUTHORED MANSION scores depth ${flatness(authoredMansion(o)).depth} — see --flat`);
  out.push('');
  out.push(`degree distribution (diggable edges per region)   ROOMS | CORRIDORS:`);
  const HR = histOf('roomDeg'), HC = histOf('corrDeg');
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    const pr = 100 * (HR.h[k] || 0) / HR.a.length, pc = 100 * (HC.h[k] || 0) / HC.a.length;
    out.push(`   deg ${String(k).padStart(2)}  room ${pr.toFixed(1).padStart(5)}% ${'#'.repeat(Math.round(pr / 2)).padEnd(26)}`
      + `corr ${pc.toFixed(1).padStart(5)}% ${'#'.repeat(Math.round(pc / 2))}`);
  }
  out.push(line('dead-end rooms (deg <= 1)', 'deadEndRooms'));
  out.push('');
  out.push(`RESIDENCY (procedural-map.md §4 — a generation constraint, not a runtime hope):`);
  out.push(line('largest corridor region   m2', 'maxCorrArea'));
  out.push(line('  its longest span        m', 'maxCorrSpan'));
  out.push(line('  rooms opening onto it', 'roomsOnBiggest'));
  out.push('');
  out.push(`GATE (percent of seeds passing):`);
  out.push(`   every region reachable from spawn (open|breach|dig)  ${pct('allReach').toFixed(1)}%`);
  out.push(`   the one exit reachable                               ${pct('exitReach').toFixed(1)}%`);
  out.push(`   hunter reaches every region (through walls)          ${pct('hunterAll').toFixed(1)}%`);
  out.push(`   every room touches a corridor (>= 1.20 m)            ${pct('roomsOnCorridor').toFixed(1)}%`);
  out.push(`   plans with a single corridor warren                  ${(100 * ms.filter((m) => m.corrNets <= 1).length / ms.length).toFixed(1)}%`);
  out.push(`   min-walk to exit (>=2 digs or >=3 regions)           ${pct('minWalk').toFixed(1)}%`);
  out.push(`   DEGENERATE: a ROOM touches every other region        ${pct('degenerate').toFixed(1)}%`);
  out.push(`   (a CORRIDOR spine touching everything — wanted)      ${pct('spineCorridor').toFixed(1)}%`);
  out.push('');
  out.push(`VARIETY: ${sigs.size}/${n} distinct (type-multiset x degree-sequence x corridor-count) signatures`);
  out.push(`         ${gsigs.size}/${n} distinct degree sequences alone`);
  return out.join('\n');
}

// ===========================================================================================
// 9. SELF TEST
// ===========================================================================================

const OPTS_T = { align: 0.35, gap: 2.2, waste: 0.04, cutSpan: 30 };
function selftest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // determinism: pure function of seed
  for (const s of [0, 7, 41, 511]) {
    const a = JSON.stringify(toJSON(buildPlan(s, OPTS_T)));
    const b = JSON.stringify(toJSON(buildPlan(s, OPTS_T)));
    ok(a === b, `seed ${s} not deterministic`);
  }
  // align is a real knob, not a no-op
  ok(JSON.stringify(toJSON(buildPlan(3, { ...OPTS_T, align: 0 }))) !== JSON.stringify(toJSON(buildPlan(3, { ...OPTS_T, align: 1 }))),
    'align has no effect');

  /**
   * 🚨 THE CONTROL, AS A GATE. `critic-corridor-1`: "whoever lands a flatness export must test it
   * against the authored mansion and require it to pass. That is the one house we know is good."
   * A flatness rule that calls the shipped house flat is a broken rule, and without this assert
   * the next person to tune the metric will discover that the expensive way.
   */
  const A = authoredMansion(OPTS_T);
  const fA = flatness(A);
  ok(fA.depth >= 3, `AUTHORED MANSION scores depth ${fA.depth} — the flatness metric is wrong, not the house`);
  ok(!fA.flat, 'AUTHORED MANSION classified FLAT — the flatness metric is wrong, not the house');
  // and the copied footprints must still be the library's, to the centimetre
  for (const R of A.regions.filter((r) => r.kind === 'room')) {
    const L = LIBRARY.find((l) => l.type === R.type);
    const r = R.rects[0];
    const got = [r.x1 - r.x0 - WALL_T, r.z1 - r.z0 - WALL_T].sort((a, b) => a - b).map((v) => +v.toFixed(2));
    const want = [L.w, L.d].sort((a, b) => a - b).map((v) => +v.toFixed(2));
    ok(got[0] === want[0] && got[1] === want[1], `AUTHORED ${R.type} footprint ${got} != spaces.js ${want}`);
  }

  for (let s = 0; s < 64; s++) {
    const p = buildPlan(s, OPTS_T);
    // COMPLETE PARTITION: cell areas sum to the envelope, no overlaps
    let sum = 0;
    const all = p.regions.flatMap((R) => R.rects);
    for (const r of all) sum += (r.x1 - r.x0) * (r.z1 - r.z0);
    const envA = (p.env.x1 - p.env.x0) * (p.env.z1 - p.env.z0);
    ok(Math.abs(sum - envA) < 1e-4, `seed ${s}: partition area ${sum.toFixed(3)} != envelope ${envA.toFixed(3)}`);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if (rectsOverlap(all[i], all[j])) { fails.push(`seed ${s}: overlapping cells`); i = all.length; break; }
    }
    // all six types present
    const types = new Set(p.regions.filter((r) => r.kind === 'room').map((r) => r.type));
    ok(types.size === LIBRARY.length, `seed ${s}: only ${types.size}/${LIBRARY.length} types`);
    ok(p.regions.filter((r) => r.kind === 'room' && r.type === 'study').length >= 2, `seed ${s}: <2 studies`);
    // exactly one exit and it exists
    ok(p.exitIdx >= 0 && p.regions[p.exitIdx].kind === 'room', `seed ${s}: no exit room`);
    // no room rect is smaller than its authored footprint
    for (const R of p.regions.filter((r) => r.kind === 'room')) {
      const L = LIBRARY.find((l) => l.type === R.type);
      const r = R.rects[0];
      const got = [r.x1 - r.x0 - WALL_T, r.z1 - r.z0 - WALL_T].sort((a, b) => a - b).map((v) => +v.toFixed(2));
      const want = [L.w, L.d].sort((a, b) => a - b).map((v) => +v.toFixed(2));
      ok(got[0] === want[0] && got[1] === want[1], `seed ${s}: ${R.type} footprint ${got} != ${want}`);
    }
  }
  /**
   * ===========================================================================================
   * 🚨 THE DOOR / SLAB / INTERCONNECT ASSERTS — AND EVERY ONE SHIPS A CONTROL THAT MUST FAIL.
   * ===========================================================================================
   *
   * HANDOFF: *"Three instruments on this project shipped green while blind."* Each block below
   * therefore runs TWICE — once on the shipped rule and once on the rule it replaced — and the
   * second arm is required to FAIL. If a control ever passes, the probe has stopped being able to
   * see the defect and the green arm above it means nothing.
   */
  const D = [];        // door-geometry evidence over 96 seeds, gathered once
  for (let s = 0; s < 96; s++) {
    const p = buildPlan(s, OPTS_T);
    for (const sg of boundarySegments(p)) D.push({ ...sg, seed: s });
  }

  // D1 — a door is only ever drawn on a run long enough to hold it.
  const shortDoors = D.filter((s) => s.door !== 'none' && s.clear < L_DOOR - 1e-6);
  ok(shortDoors.length === 0,
    `D1: ${shortDoors.length} doors on wall runs shorter than L_DOOR ${L_DOOR} — the aperture would hang out of the wall`);
  /**
   * D1-CONTROL — THE REFUTED RULE, RE-RUN. `canDoor` used to be `edge.clear >= L_DOOR`, where
   * `edge.clear` is the SUM over every touching rect pair. Re-deciding on that sum here must
   * still find short runs, or D1 above is asserting nothing.
   */
  let ctlShort = 0;
  for (let s = 0; s < 96; s++) {
    const p = buildPlan(s, OPTS_T);
    for (const e of p.edges) {
      if (e.solid || e.clear < L_DOOR) continue;                       // the OLD canDoor
      for (const r of (e.runs || [])) if (r.clear < L_DOOR - 1e-6) ctlShort++;
    }
  }
  ok(ctlShort > 0,
    `D1-CONTROL: the summed-clear rule found ZERO short runs — the probe can no longer see the defect it was written for`);

  // D2 — one door per boundary, never one per run.
  const doorPerEdge = new Map();
  for (const s of D) if (s.door !== 'none') { const k = `${s.seed}/${s.a}|${s.b}`; doorPerEdge.set(k, (doorPerEdge.get(k) || 0) + 1); }
  const dupes = [...doorPerEdge.values()].filter((n) => n > 1).length;
  ok(dupes === 0, `D2: ${dupes} boundaries draw their one door on more than one wall run`);
  /** D2-CONTROL — multi-run boundaries WITH a door must exist, or D2 is vacuous. */
  const multiWithDoor = D.filter((s) => s.nRuns > 1 && s.edgeDoor && s.edgeDoor !== 'none').length;
  ok(multiWithDoor > 0,
    'D2-CONTROL: no multi-run boundary carries a door at all — D2 would pass on an empty set');

  /**
   * D3 — `chained` is NOT what the hunter batters, and the tool must never conflate them.
   * `room.chainedDoorsOf()` filters on `p.state.isDamageable()`, and `CHAINED_DEFS[0]` is
   * `damageable: false`. So the hunter's set is exactly the BREACHABLE interior doors.
   */
  const wrongForce = D.filter((s) => s.hunterForces && s.door !== 'breachable').length;
  const missedForce = D.filter((s) => s.door === 'breachable' && !s.hunterForces).length;
  ok(wrongForce === 0, `D3: ${wrongForce} doors marked hunter-forcible that are not breachable`);
  ok(missedForce === 0, `D3: ${missedForce} breachable doors not marked hunter-forcible`);
  /** D3-CONTROL — chained doors must actually OCCUR, or D3 is asserting over an empty class. */
  const nChained = D.filter((s) => s.door === 'chained').length;
  ok(nChained > 0, 'D3-CONTROL: no chained doors in 96 seeds — the distinction cannot be tested');

  /**
   * D4 — THE SLAB CAP IS A MAXIMUM AND THERE IS NO MINIMUM. Every emitted slab must be at or
   * under `SLAB_MAX`; a slab of ANY small length is legal, which is the half that retires §7.3.
   */
  const overCap = D.flatMap((s) => s.slabs.pieces).filter((q) => q.len > SLAB_MAX + 1e-6).length;
  ok(overCap === 0, `D4: ${overCap} slab faces longer than the ${SLAB_MAX} m cap`);
  /**
   * 🚨 **D4-CONTROL IS SYNTHETIC AND THE REASON IS THE MOST USEFUL THING IN THIS BLOCK.**
   *
   * The obvious control — "some generated run must exceed the cap, or D4 is vacuous" — FAILS, and
   * it fails because it is TRUE that none does. Measured on this tree, 512 seeds at the shipping
   * dials: **the longest contiguous DIGGABLE wall run is 31.33 m, p95 27.20 m, and 0 of 13,119
   * exceed 35 m.** At `--cut 60` and `--cut Infinity` the max is 27.20 m — the gallery's own long
   * side, which is the longest edge any library footprint has.
   *
   * ⚠️ **SO THE `85.90 m` IN `_slab1-cost.mjs` IS NOT A WALL.** It is `edge.clear`, the SUM over
   * every disjoint stretch two regions share, and no single face is ever that long. The generator
   * has never asked for a slab wider than 31.33 m and the 2.61 ms measurement is of a face it
   * cannot produce. The cap is a GUARD RAIL, not a live constraint — which is worth knowing before
   * anyone spends a round optimising for it.
   *
   * The control is therefore on the FUNCTION, driven past where the generator can go: a 34.99 m
   * run must stay one face and an 85.90 m one must split. If `SLAB_MAX` were removed both would
   * come back as one and this arm would fail, which is the property a control has to have.
   */
  ok(slabLayout(34.99, false).n === 1, 'D4-CONTROL-a: a 34.99 m run did not come back as ONE slab');
  ok(slabLayout(85.90, false).n === 3 && slabLayout(85.90, false).reason === 'cap',
    `D4-CONTROL-b: an 85.90 m run came back as ${slabLayout(85.90, false).n} slab(s) / ${slabLayout(85.90, false).reason} — the cap does not bite`);
  const longestGen = D.filter((s) => s.diggable).reduce((k, s) => Math.max(k, s.clear), 0);
  ok(longestGen <= SLAB_MAX + 1e-6,
    `D4-NOTE: a generated diggable run reached ${longestGen.toFixed(2)} m — the cap now BITES in production, which it did not when this was written (max 31.33 m). Re-read the slab section.`);

  /**
   * D5 — THE DOOR BLOCKER IS DRAWN, NOT PAPERED OVER. `dig.js` `SLAB`: a slab cannot contain an
   * aperture, so a run with a door comes out as two faces with a seam between them. That must be
   * REPORTED (`reason: 'door'`), because John asked for walls *"without any seams"*.
   */
  const lied = D.filter((s) => s.diggable && s.door !== 'none' && s.clear >= CONNECTOR_W
    && s.slabs.reason === 'one').length;
  ok(lied === 0, `D5: ${lied} boundaries claim ONE slab while carrying a door`);
  const doorSplit = D.filter((s) => s.slabs.reason === 'door' || s.slabs.reason === 'door+cap').length;
  ok(doorSplit > 0, 'D5-CONTROL: no boundary is split by a door — the blocker would be invisible');

  /** D6 — the interconnect lands INSIDE a real dig span, because in the game it is on a panel. */
  let icBad = 0, icSeen = 0;
  for (let s = 0; s < 32; s++) {
    const p = buildPlan(s, OPTS_T);
    for (const sg of boundarySegments(p)) {
      if (!sg.diggable || !sg.spans.length) continue;
      const ic = interconnectOn(p.seed, sg.key, sg.spans);
      if (!ic) { icBad++; continue; }
      icSeen++;
      const inSpan = sg.spans.some((q) => ic.at - ic.w / 2 >= q.at - 1e-6 && ic.at + ic.w / 2 <= q.at + q.len + 1e-6);
      if (!inSpan) icBad++;
    }
  }
  ok(icBad === 0, `D6: ${icBad} interconnects fall outside every dig span on their wall`);
  ok(icSeen > 0, 'D6-CONTROL: no interconnect was placed at all — D6 would pass on nothing');

  console.log(fails.length ? `SELFTEST FAIL (${fails.length})\n  ` + fails.slice(0, 20).join('\n  ')
    : 'SELFTEST OK — 64 seeds: deterministic, complete partition, no overlap, all types, one exit,'
      + '\n              authored footprints; + D1..D6 doors/slabs/interconnect over 96 seeds,'
      + '\n              each with a control arm that must fail');
  return fails.length === 0;
}

// ===========================================================================================
// CLI
// ===========================================================================================

/**
 * ⚠️ THE CLI ONLY RUNS WHEN THIS FILE IS THE ENTRY POINT.
 *
 * `tools/mapdesigner/` imports this module **in the browser** so that there is exactly ONE
 * packing algorithm in the project — the tool renders and edits what this file produces and
 * never reimplements it. An unguarded `process.argv` at module scope is a `ReferenceError` in a
 * browser, and an unguarded CLI would also print a plan every time a Node probe imports it.
 * Both are fixed by the same guard, and `--selftest` / `--sweep` are unchanged when run directly.
 */
const IS_MAIN = typeof process !== 'undefined'
  && Array.isArray(process.argv)
  && typeof process.argv[1] === 'string'
  && /genspike\.mjs$/i.test(process.argv[1].replace(/\\/g, '/'));

if (IS_MAIN) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const has = (k) => argv.includes(`--${k}`);

  const OPTS = { align: Number(arg('align', 0.35)), gap: Number(arg('gap', 2.2)), waste: Number(arg('waste', 0.04)), cutSpan: Number(arg('cut', 30)) };

  if (has('selftest')) {
    process.exit(selftest() ? 0 : 1);
  } else if (has('flat')) {
    console.log(flatReport(Number(arg('flat', 512)), OPTS));
  } else if (has('sweep')) {
    console.log(sweep(Number(arg('sweep', 512)), OPTS));
  } else if (has('plans')) {
    const n = Number(arg('plans', 10));
    const from = Number(arg('from', 0));
    for (let s = from; s < from + n; s++) { console.log(ascii(buildPlan(s, OPTS))); console.log(); }
  } else {
    const s = arg('seed', '7');
    const p = buildPlan(isNaN(Number(s)) ? s : Number(s), OPTS);
    console.log(ascii(p));
    console.log();
    console.log(JSON.stringify(toJSON(p), null, 1));
  }
}

export {
  authoredMansion, AUTHORED_DIG, planSpanLayout,
  buildPlan, planFromRooms, measure, ascii, toJSON, selftest, sweep, flatReport,
  flatness, planSpans, boundarySegments, edgeKey, wallRuns, slabLayout, interconnectOn,
  LIBRARY, MANDATORY, W_MIN, W_MIN_S, L_DIG, L_DOOR, WALL_T, DIG_H, AUTHORED_SPANS,
  SLAB_MAX, IC_W, CONNECTOR_W, CONNECTOR_H,
};
