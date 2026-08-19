#!/usr/bin/env node
/**
 * _genslab1-dig.mjs — **CAN YOU DIG YOUR WAY OUT OF A GENERATED HOUSE?**
 *
 * `genslab-1`, 2026-08-11. Read-only against `src/`. The sibling `harness/scenarios/_plangen1-boot.mjs`
 * gates B1–B6 — spawn, reachability, exits, overlap — and **not one of its checks asks whether
 * anything in the generated house is diggable**, which is exactly why `dig.js`'s
 * `digEdges() { return GEN ? [] : … }` shipped unnoticed. This is that half.
 *
 *   node harness/scenarios/_genslab1-dig.mjs                    16 seeds + 3 controls
 *   node harness/scenarios/_genslab1-dig.mjs --worker --seed 7 [--nodig] [--unflagged]
 *
 * The machinery (the `node:module` load hook, `stubRenderer()`, `globalThis.location` set BEFORE
 * the first `src/` import, one subprocess per seed because `GEN` and `digEdges()` are frozen at
 * module scope) is **re-stated, not imported** — `harness/_ap3-build.mjs` and
 * `harness/scenarios/_plangen1-boot.mjs` both do the same thing and both belong to other agents.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN
 * ---------------------------------------------------------------------------------------------
 * Each meter below reports a clean number when the house is right — and would report the SAME
 * clean number pointed at the wrong plane, an empty collider list or a face that does not exist.
 * That is HANDOFF's "result-shaped output instead of an error", the mechanism behind sixteen
 * recorded instrument failures. So every meter is BRACKETED: one place it must be silent and one
 * place it must be loud, in the same run, on the same house.
 *
 *   G3a/**C1** the masonry meter reads 0.000 m inside every doorway **and ≥ 0.10 m at the jamb
 *              beside it** — the same meter, the same face, 20 cm apart. A blind meter fails C1.
 *   G3b/**C2** the damage grid reads `depth 1 · barrier 0` at every doorway cell **and
 *              `depth 0 · barrier 1` at a wall cell on the same face**. A probe reading the wrong
 *              array, or an all-zero array, cannot pass both halves.
 *   **C3**     the whole dig table forced empty (`digEdges()` reverted to slice 1's `[]`, by an
 *              in-memory patch on the verbatim source line): **G1 must go RED**. Without it,
 *              "this house is diggable" is indistinguishable from "my panel filter matched
 *              everything". It doubles as the draw-call A/B arm — same seed, same stations.
 *   **C4**     no flag at all: `digEdges()` must be the authored 7-row `DIG_EDGES` array, by
 *              `Object.is`. If the generated mode ever leaks into the unflagged arm, `escape`,
 *              `mechanics`, `dig-free` and `sledge-check` are all lying.
 *   G5/**C5**  the only check here that swings a hammer. 25 blows over the interconnect must turn
 *              a face that was SHUT into a body-passable channel; the same 25 blows at the far
 *              end of a DIFFERENT face, where the barrier stands, must leave it shut. Both arms
 *              use faces with no doorway in them, because a face with a doorway is already open
 *              and would pass G5 without a blow landing.
 *
 * ⚠️ **NOTHING HERE RE-DERIVES `dig.js`.** Every number comes off the house `buildTestRoom` really
 * built: `sp.colliders` (what you bump into), `panel.field.depth`/`.barrier` (what the shader and
 * every gameplay query read), `room.pathPortals` (the graph), and
 * `room.panelInstances.census()` (the meshes). The one thing read off the table is the doorway
 * RECTANGLE the meters are pointed at — a meter has to be aimed at something, and it is aimed at
 * the claim, then bracketed by C1/C2 so a wrong aim cannot read clean.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ KNOWN-RED AND NOT THIS SLICE'S — NAMED SO IT IS NOT ADOPTED OR HIDDEN
 * ---------------------------------------------------------------------------------------------
 * **Seeds 3, 5, 7, 12 and 14 of the first sixteen carry an unreachable pocket** — `genplan.js`'s
 * own header traces it to a corridor rect 0.05–0.10 m wide (thinner than one wall band) left by
 * `coverFree()`'s decomposition, which cannot become a `SPACES` row. `_plangen1-boot.mjs` B4
 * reads 11/16 for that reason and this file inherits it: G4's walk to the exit is reported
 * `--` on a seed whose spawn cannot reach the exit room at all. It is NOT counted as a pass.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚪 G4 AND THE BRIEF'S "min-walk ≥ 1 dig" — A STATED FACT THAT IS WRONG, CORRECTED HERE
 * ---------------------------------------------------------------------------------------------
 * The brief asks this file to assert *"at least one route out requires a dig"*. **That is not
 * reachable in slice 1 and it is not this slice's to change**: `task-plangen-1.md` §3 Change 4
 * makes EVERY generated door an OPEN portal on purpose (*"He must be able to walk the whole house
 * before the dig works. Slice 2 restores `breachable`/`chained`"*), and `_plangen1-boot.mjs` B4
 * gates that every space is reachable by walking. A route that required a dig would be a B4
 * failure. `genspike.mjs`'s own gate is `minWalk = digsToExit >= 2 || hopsToExit >= 3`, and with
 * every door open the first disjunct is 0 by construction, so the second is the live one.
 *
 * So G4 asserts the three things that ARE true and load-bearing, and reports the fourth:
 *   G4a the exit site's room is reachable from spawn (you can get to the way out)
 *   G4b `hopsToExit >= 3` — genspike's own surviving disjunct, and `maplabel-1`'s ONE feature
 *       that clears the family-wise shuffle null against John's 40 labels (AUC 0.831)
 *   G4c **the dig opens at least one space pair the walk cannot** — an adjacent pair with a
 *       diggable wall and no portal between them. That is what makes the hammer a route rather
 *       than scenery, and it is the honest slice-1 form of the brief's sentence.
 */

import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = new URL('.', import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const SRC = new URL('../../src/', HERE);
const s = (p) => new URL(p, SRC).href;

const N_SEEDS = 16;
const MIN_W = 0.68;          // twice the player's 0.34 m collision radius — `player.js`
const EPS = 1e-4;            // 0.1 mm: two boxes that merely touch do not overlap
const JAMB_PROBE = 0.20;     // how far past a doorway edge C1 points the meter — `GEN_JAMB_MIN`

function stubRenderer() {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    // `MaterialBaker.bake` reads four texels back and throws if all four are black — a real guard.
    readRenderTargetPixels: (rt, x, y, w, h, buf) => {
      buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255;
    },
  };
}

/**
 * 🚨 **C3's PATCH — the dig table forced back to what slice 1 shipped.** The anchor is the
 * verbatim body of `digEdges()`; if the source drifts under it this THROWS rather than quietly
 * measuring an unpatched build as the ablated one.
 */
const C3_OLD = '  return GEN ? genDigTable().edges : (SLAB ? SLAB_EDGES : DIG_EDGES);';
const C3_NEW = '  return GEN ? [] : (SLAB ? SLAB_EDGES : DIG_EDGES);';

function patchNoDig() {
  const url = s('game/dig.js');
  let applied = false;
  registerHooks({
    load(u, ctx, next) {
      const r = next(u, ctx);
      if (u !== url) return r;
      const src = r.source.toString();
      if (!src.includes(C3_OLD)) {
        throw new Error('_genslab1-dig: C3 anchor not found verbatim in dig.js — the source drifted under this control');
      }
      applied = true;
      return { ...r, source: src.replace(C3_OLD, C3_NEW) };
    },
  });
  process.on('exit', () => {
    if (!applied) {
      console.error('_genslab1-dig: C3 patch was set and dig.js never loaded through the hook');
      process.exitCode = 1;
    }
  });
}

// ---------------------------------------------------------------------------------------------
// the meters
// ---------------------------------------------------------------------------------------------
const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

function unionLen(spans) {
  const arr = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0, cur = null;
  for (const [a, b] of arr) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; }
    else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/**
 * METRES OF SOLID MASONRY STANDING INSIDE A RECTANGLE OF ONE WALL — `_ap3-geom.mjs`'s meter,
 * re-stated (that file is another agent's). `boxes` is a flat list of `[x0,y0,z0,x1,y1,z1]`.
 * @param rect {axis,lo,hi,y0,y1,n0,n1} in world metres; `axis` is the axis the wall RUNS along.
 */
function masonryIn(boxes, rect) {
  const hit = [];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const uMin = rect.axis === 'x' ? x0 : z0, uMax = rect.axis === 'x' ? x1 : z1;
    const nMin = rect.axis === 'x' ? z0 : x0, nMax = rect.axis === 'x' ? z1 : x1;
    if (ov(nMin, nMax, rect.n0, rect.n1) <= EPS) continue;
    if (ov(y0, y1, rect.y0, rect.y1) <= EPS) continue;
    if (ov(uMin, uMax, rect.lo, rect.hi) <= EPS) continue;
    hit.push([Math.max(uMin, rect.lo), Math.min(uMax, rect.hi)]);
  }
  return unionLen(hit);
}

/** The damage grid's own answer at one face-local point: what every gameplay query reads. */
function gridAt(field, u, v) {
  const cx = Math.min(field.cols - 1, Math.max(0, Math.floor(u * field.cols)));
  const cy = Math.min(field.rows - 1, Math.max(0, Math.floor(v * field.rows)));
  const i = field.idx(cx, cy);
  return { depth: field.depth[i], barrier: field.barrier[i] };
}

// ---------------------------------------------------------------------------------------------
// one house
// ---------------------------------------------------------------------------------------------
async function runOnce({ seed, nodig, unflagged }) {
  if (nodig) patchNoDig();
  if (!unflagged) globalThis.location = { search: `?plan=gen&planseed=${seed}` };

  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

  const out = { seed, nodig: !!nodig, unflagged: !!unflagged, threw: false };
  try {
    const { initBaker } = await import(s('materials/baker.js'));
    initBaker(stubRenderer());
    const SP = await import(s('game/spaces.js'));
    const DG = await import(s('game/dig.js'));
    const RM = await import(s('game/room.js'));

    // ---- C4: the unflagged arm must be the authored array, by identity ----------------------
    out.edgesIsAuthored = Object.is(DG.digEdges(), DG.DIG_EDGES);
    out.edgeCount = DG.digEdges().length;
    if (unflagged) { console.warn = realWarn; out.warnCount = 0; return out; }

    out.stats = SP.GEN ? { ...DG.genDigTable().stats } : null;

    const room = await RM.buildTestRoom({ work: (p) => p }, {});
    console.warn = realWarn;
    // ⚠️ report the FILTERED list, not the raw one: `warns.slice(0,4)` was four `THREE.Texture`
    // lines while the count came off a filter that excludes them — an UNCLEAN row that printed
    // only the noise it had already discounted, and named nothing.
    const real = warns.filter((w) => !/Unable to serialize/.test(w));
    out.warnCount = real.length;
    out.warns = real.slice(0, 6);
    /**
     * ⚠️ **ONE NAMED WARNING IS CLASSIFIED OUT OF THE GATE AND REPORTED INSTEAD, BECAUSE IT
     * BELONGS TO ANOTHER FILE.** `src/game/skin.js` refuses to erode a skin triangle whose
     * vertices are inside a `room.js` `tracked()` range — a dig lintel's handle — and summarises
     * the refusals in one line. It is silent on the authored house and fires on **1 of 16
     * generated seeds, on 6 triangles**. `skin.js` is `skin-1`'s and is out of this slice's scope;
     * counted and named here so it is neither adopted as green nor blamed on the dig table.
     */
    out.warnSkin = real.filter((w) => /^\[skin\] \d+ claimed triangles refused/.test(w)).length;
    out.warnMine = out.warnCount - out.warnSkin;
    out.spacesLen = room.spaces.length;

    // ---- the built colliders, once ---------------------------------------------------------
    const boxes = [];
    for (const sp of room.spaces) {
      for (const b of sp.colliders) boxes.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    }
    out.colliders = boxes.length;

    // ---- G1: the built house has diggable faces ---------------------------------------------
    const faces = room.panels.filter((p) => p.spec?.free);
    out.faces = faces.length;
    out.g1 = faces.length > 0 && DG.digEdges().length > 0;

    // ---- G2: every built face is inside the slab cap and over the dig minimum ----------------
    const ws = faces.map((p) => p.width);
    out.faceWMin = ws.length ? Math.min(...ws) : null;
    out.faceWMax = ws.length ? Math.max(...ws) : null;
    out.diggableM = +ws.reduce((n, w) => n + w, 0).toFixed(1);
    out.g2 = ws.length > 0 && out.faceWMax <= DG.GEN_SLAB_MAX + 1e-6 && out.faceWMin >= DG.GEN_L_DIG - 1e-6;

    // ---- G3 + C1 + C2: every doorway is a real hole, in the geometry AND in the grid ---------
    let nDoor = 0, geoOk = 0, gridOk = 0, c1Loud = 0, c1Total = 0, c2Solid = 0, c2Total = 0, headOk = 0;
    let worstDoorM = 0, weakestJambM = Infinity;
    for (const p of faces) {
      const spec = p.spec;
      const aps = spec.apertures;
      const axis = spec.rotY === 0 || Math.abs(spec.rotY - Math.PI) < 1e-9 ? 'x' : 'z';
      const u0w = (axis === 'x' ? spec.x : spec.z) - spec.w / 2;   // the face's own world span
      const plane = axis === 'x' ? spec.z : spec.x;
      const bandN = [Math.min(plane, plane + (spec.side === 'a' ? -0.15 : 0.15)),
        Math.max(plane, plane + (spec.side === 'a' ? -0.15 : 0.15))];
      const wallY = [0, spec.h];
      // ⚠️ the face's `u` axis runs the same way as world `u` only on one side; the aperture
      // rects are face-local, so map them back through the face's own world span in BOTH
      // directions and take the one that lands inside the span. `side === 'a'` on a z-normal
      // wall is +u, `side === 'b'` is mirrored — `dig.js` `faceU` is the authority and this is
      // its inverse, so a mirrored rect is measured where it really is.
      const flip = (axis === 'x') ? (spec.side === 'b') : (spec.side === 'a');
      const toWorld = (t) => u0w + (flip ? (1 - t) : t) * spec.w;
      if (aps) {
        for (const r of aps) {
          nDoor++;
          const a = toWorld(r.u0), b = toWorld(r.u1);
          const lo = Math.min(a, b), hi = Math.max(a, b);
          const y0 = r.v0 * spec.h, y1 = r.v1 * spec.h;
          // --- G3a: nothing solid inside the doorway, room masonry or face collider alike ---
          const inner = [];
          for (const bx of p.solidBoxes()) {
            inner.push([bx.min.x, bx.min.y, bx.min.z, bx.max.x, bx.max.y, bx.max.z]);
          }
          /**
           * ⚠️ **ONE DAMAGE-GRID CELL IS INSET AT EVERY EDGE OF THE DOORWAY, AND IT IS THE
           * RESOLUTION THE HOLE IS CUT AT, NOT SLACK.** `DamageField.setApertures` samples cell
           * CENTRES, so the hole's real boundary lands within one cell of the stated rectangle and
           * the panel's own collider is quantised to the same lattice. Measured on seed 0 the
           * error runs ±5 mm against a 95 mm cell. Without the inset this meter reports the
           * **0.08 m of head above a 2.72 m doorway in a 2.80 m band** — which is masonry that is
           * SUPPOSED to be there — as a defect, and `_ap3-geom.mjs`'s A5 exists because that head
           * is the tightest dimension in the whole aperture design.
           */
          const cw = p.field ? spec.w / p.field.cols : 0;
          const ch = p.field ? spec.h / p.field.rows : 0;
          const rect = { axis, lo: lo + cw, hi: hi - cw, y0: y0 + EPS, y1: y1 - ch, n0: bandN[0], n1: bandN[1] };
          const m = masonryIn(boxes, rect) + masonryIn(inner, rect);
          if (m > worstDoorM) worstDoorM = m;
          if (m <= 1e-3) geoOk++;
          // --- C1: the SAME meter, 20 cm outside the doorway, must find the jamb ------------
          const side = (hi + JAMB_PROBE <= u0w + spec.w) ? [hi, hi + JAMB_PROBE] : [lo - JAMB_PROBE, lo];
          const jm = masonryIn(boxes, { axis, lo: side[0], hi: side[1], y0: 0.2, y1: 1.0, n0: bandN[0], n1: bandN[1] })
            + masonryIn(inner, { axis, lo: side[0], hi: side[1], y0: 0.2, y1: 1.0, n0: bandN[0], n1: bandN[1] });
          /**
           * 🚪 **AND THE SECOND HALF OF C1: THE 0.08 m OF HEAD ABOVE THE DOORWAY MUST BE THERE.**
           * `DOORWAY_H` 2.72 in a `DIG_H` 2.80 band. If this reads 0 the aperture is running to
           * the top of the band — the doorway has silently lost its head, which is exactly what
           * `apertureRects`' clamp on `v1` does to a doorway taller than its band and what the
           * inset above would otherwise hide.
           */
          const hm = masonryIn(inner, { axis, lo: lo + cw, hi: hi - cw, y0: y1, y1: spec.h, n0: bandN[0], n1: bandN[1] });
          if (hm > 0.10) headOk++;
          c1Total++;
          if (jm >= 0.10) c1Loud++;
          if (jm < weakestJambM) weakestJambM = jm;
          // --- G3b: the grid says doorway; C2: the same grid says wall 20 cm away ------------
          if (p.field) {
            const uMid = (r.u0 + r.u1) / 2, vMid = (r.v0 + r.v1) / 2;
            const g = gridAt(p.field, uMid, vMid);
            if (g.depth >= 1 && g.barrier === 0) gridOk++;
            const uJ = r.u1 + JAMB_PROBE / spec.w / 2 <= 1 ? r.u1 + JAMB_PROBE / spec.w / 2
              : r.u0 - JAMB_PROBE / spec.w / 2;
            if (uJ >= 0 && uJ <= 1) {
              const gj = gridAt(p.field, uJ, vMid);
              c2Total++;
              if (gj.depth === 0 && gj.barrier === 1) c2Solid++;
            }
          } else { /* no field: G3b cannot pass */ }
        }
      }
    }
    out.doorways = nDoor;
    out.g3aOk = geoOk; out.g3bOk = gridOk; out.headOk = headOk;
    out.worstDoorM = +worstDoorM.toFixed(4);
    out.c1Loud = c1Loud; out.c1Total = c1Total;
    out.weakestJambM = Number.isFinite(weakestJambM) ? +weakestJambM.toFixed(4) : null;
    out.c2Solid = c2Solid; out.c2Total = c2Total;
    out.g3 = nDoor > 0 && geoOk === nDoor && gridOk === nDoor;

    /**
     * ---- G4: the way out -------------------------------------------------------------------
     * ⚠️ **EVERY exit site in the pool, not `EXIT_SITES[0]`.** `run.js` `chooseExit()` promotes
     * exactly ONE of them per run and demotes the rest to `CHAINED`, seeded — so which one is live
     * is a property of the RUN and not of the house, and a probe that took the first row would be
     * asserting on table order. The house-level claim is therefore "every site in the pool is
     * reachable from spawn", which is true of whichever one this run picks.
     */
    const spawnSpace = room.spaceAt(room.spawn.player[0]);
    const sites = SP.EXIT_SITES;
    out.exitSites = sites.length;
    const hopsList = [];
    let reached = 0;
    for (const site of sites) {
      if (!spawnSpace) { hopsList.push(-1); continue; }
      if (spawnSpace.id === site.a) { hopsList.push(0); reached++; continue; }
      const path = room.pathPortals(spawnSpace.id, site.a, MIN_W, 0);
      hopsList.push(path.length ? path.length : -1);
      if (path.length) reached++;
    }
    out.spawnSpaceId = spawnSpace?.id ?? null;
    out.exitRooms = sites.map((q) => q.a);
    out.hopsList = hopsList;
    out.exitsReached = reached;
    out.g4aReach = sites.length > 0 && reached === sites.length;
    out.hopsToExit = hopsList.length ? Math.max(...hopsList) : -1;
    out.g4bHops = out.hopsToExit >= 3;
    // pairs a dig opens that no portal does — read off the BUILT connector list
    const portalPair = new Set();
    for (const c of room.connectors) {
      if (c.dig || !c.a || !c.b || c.a === c.b) continue;
      portalPair.add([c.a, c.b].sort().join('|'));
    }
    const digPair = new Set();
    for (const p of faces) digPair.add([p.spec.a, p.spec.b].sort().join('|'));
    out.digOnlyPairs = [...digPair].filter((k) => !portalPair.has(k)).length;
    out.digPairs = digPair.size;
    out.g4c = out.digOnlyPairs >= 1;

    // ---- draw calls: a scene-graph census, per parked station, deterministic -----------------
    const inst = room.panelInstances;
    if (inst) {
      let worst = 0, worstAt = null;
      const per = [];
      const THREE = (await import('three'));
      for (const sp of room.spaces) {
        const pos = new THREE.Vector3((sp.x0 + sp.x1) / 2, 1.7, (sp.z0 + sp.z1) / 2);
        /**
         * 🚨 **TWICE, WITH A HUGE `dt`, AND THE FIRST VERSION OF THIS LINE WAS WRONG IN EXACTLY
         * THE WAY HANDOFF WARNS ABOUT.** `setViewpoints` gives a space that has just left
         * residency a `HOLD` grace period and decays it by `dt` — so walking eighteen stations at
         * the default 0.016 s never expires anything and the eighteenth station reports the WHOLE
         * HOUSE resident. It read 52 calls at one station where the settled answer is far lower.
         * *"A parked reading is not stable across a walk — flip in place at ONE station."* Two
         * calls at a huge `dt` are what makes each station independent of the ones before it: the
         * first sets residency and drives every hold negative, the second hides them.
         */
        room.setViewpoints([{ pos }], 1e6);
        room.setViewpoints([{ pos }], 1e6);
        const d = inst.census().drawing;
        per.push(d);
        if (d > worst) { worst = d; worstAt = sp.id; }
      }
      const c = inst.census();
      out.instGroups = c.groups; out.instFaceGroups = c.faceGroups; out.instMeshes = c.meshes;
      out.worstStationCalls = worst; out.worstStation = worstAt;
      out.medStationCalls = per.sort((a, b) => a - b)[Math.floor(per.length / 2)] ?? 0;
    }

    /**
     * ---- G5 + C5: **YOU CAN ACTUALLY DIG THROUGH IT** -----------------------------------------
     * Every check above is about SHAPE. This one swings a hammer. `p.applyHit(p.pointAt(u,v), 1)`
     * is the entry point `sledge.js` itself calls, and `openChannel()` is the same query the
     * collider and the BFS are made of — `dig-band.mjs`'s method, not a second one.
     *
     * 🚨 **THE INTERCONNECT IS FOUND BY ASKING THE FIELD, NOT BY CALLING
     * `chooseFreeInterconnect` AGAIN.** A probe that re-rolled the seed would agree with the
     * picker by construction and would still agree if `setDigPlan` had never reached the panel.
     * So this reads `field.barrier` off the built house: the interconnect is the one patch of a
     * face with **no barrier behind it and no doorway in front of it** (`depth === 0` rules the
     * aperture cells out, since `setApertures` writes `depth = 1` there).
     *
     * **C5 is the arm that must fail**: the same blows, the same count, on a face the plan did
     * NOT choose, must leave it shut. Without it "the wall opened" is indistinguishable from
     * "`openChannel()` returns open for everything", which is exactly what a face carrying a
     * DOORWAY does — which is why both arms are restricted to faces with no aperture, and why
     * G5 asserts the interconnect face was **shut before the first blow**.
     */
    room.setDigPlan({ seed: `genslab-${seed}` });
    const plain = faces.filter((p) => p.field && !p.spec.apertures);
    const icOf = (p) => {
      const f = p.field;
      let n = 0, su = 0, sv = 0, u0 = 1, u1 = 0, v0 = 1, v1 = 0;
      for (let cy = 0; cy < f.rows; cy++) {
        for (let cx = 0; cx < f.cols; cx++) {
          const i = f.idx(cx, cy);
          if (f.barrier[i] || f.depth[i] > 0) continue;      // barrier stands, or it is a doorway
          const u = (cx + 0.5) / f.cols, v = (cy + 0.5) / f.rows;
          n++; su += u; sv += v;
          u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        }
      }
      return n ? { n, u: su / n, v: sv / n, u0, u1, v0, v1 } : null;
    };
    const withIC = [], withoutIC = [];
    for (const p of plain) (icOf(p) ? withIC : withoutIC).push(p);
    out.icFaces = withIC.length; out.plainFaces = plain.length;
    const swing = (p, u0, u1, v0, v1) => {
      let blows = 0;
      for (let j = 0; j <= 4; j++) {
        for (let i = 0; i <= 4; i++) {
          p.applyHit(p.pointAt(u0 + (u1 - u0) * (i / 4), v0 + (v1 - v0) * (j / 4)), 1);
          blows++;
        }
      }
      return blows;
    };
    /**
     * ⚠️ **C5 RUNS FIRST AND ON A DIFFERENT EDGE, AND BOTH HALVES OF THAT WERE BUGS THIS FILE
     * ACTUALLY HIT.** A breakthrough couples depth to the twin face (`wall.js` `_couple`) and
     * drops every barrier in the house (`unlockBarrier`) — so a control taken AFTER G5, or on
     * G5's own twin, is measuring a wall the test itself already opened. It crashed rather than
     * lying, which is luck, not design.
     */
    const g5Face = withIC[0] ?? null;
    const c5Face = withIC.find((p) => p.spec.edge !== g5Face?.spec.edge) ?? null;
    if (c5Face) {
      const ic = icOf(c5Face);
      const far = ic.u > 0.5 ? 0.02 : 0.98;                 // the far end of the same face
      const w = Math.min(0.28, Math.abs(far - ic.u) / 2);
      out.c5Face = c5Face.id;
      out.c5ShutBefore = !c5Face.openChannel().open;
      out.c5Blows = swing(c5Face, Math.max(0, far - w), Math.min(1, far + w), 0.1, 0.9);
      out.c5StillShut = !c5Face.openChannel().open;
    }
    if (g5Face) {
      const ic = icOf(g5Face);
      out.g5Face = g5Face.id;
      out.g5ShutBefore = !g5Face.openChannel().open;
      out.g5Blows = swing(g5Face, ic.u0, ic.u1, ic.v0, ic.v1);
      const ch = g5Face.openChannel();
      out.g5ChannelW = +(ch.width ?? 0).toFixed(2);
      out.g5 = out.g5ShutBefore && !!ch.open;
    }
    /**
     * 🚨 **C5, AND THE FIRST VERSION OF IT WAS UNRUNNABLE — WHICH IS ITSELF THE FINDING.** It
     * looked for a face the plan did NOT choose, and on every seed there is none:
     * `chooseFreeInterconnect` puts **one region on every EDGE** and a generated house has 17–36
     * edges, so **every aperture-free face carries a way through** (28 of 28 on seed 0). That is
     * `dig.md`'s *"adding an edge to a room makes it FASTER to dig out of"* at its limit and it is
     * reported, not worked around.
     *
     * So the control moves to the same claim on a different patch: the same 25 blows, on a
     * DIFFERENT face, at the `u` furthest from that face's own interconnect — where the barrier
     * still stands. If that opens too, `openChannel()` is answering "open" for anything.
     */
  } catch (e) {
    console.warn = realWarn;
    out.threw = true;
    out.error = String(e.message || e);
    out.stack = String(e.stack || '').split('\n').slice(0, 4).join(' | ');
  }
  return out;
}

// =================================================================================================

const argv = process.argv.slice(2);
if (argv.includes('--worker')) {
  const i = argv.indexOf('--seed');
  const out = await runOnce({
    seed: i >= 0 ? Number(argv[i + 1]) : 0,
    nodig: argv.includes('--nodig'),
    unflagged: argv.includes('--unflagged'),
  });
  console.log(JSON.stringify(out));
  process.exit(0);
}

function worker(args) {
  const r = spawnSync(process.execPath, [SELF, '--worker', ...args],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const line = (r.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(line); }
  catch { return { threw: true, error: `worker produced no JSON — stderr: ${(r.stderr || '').slice(0, 400)}` }; }
}

console.log(`\n_genslab1-dig — ${N_SEEDS} seeds · does a generated house have walls you can dig?\n`);

let g1 = 0, g2 = 0, g3 = 0, g4a = 0, g4b = 0, g4c = 0, g5 = 0, c1 = 0, c2 = 0, c5 = 0, clean = 0;
const rows = [];
for (let seed = 0; seed < N_SEEDS; seed++) {
  const r = worker(['--seed', String(seed)]);
  rows.push(r);
  const okClean = !r.threw && r.warnMine === 0;
  const okC1 = r.c1Total > 0 && r.c1Loud === r.c1Total && r.headOk === r.doorways;
  const okC2 = r.c2Total > 0 && r.c2Solid === r.c2Total;
  if (okClean) clean++;
  if (r.g1) g1++;
  if (r.g2) g2++;
  if (r.g3) g3++;
  if (r.g4aReach) g4a++;
  if (r.g4bHops) g4b++;
  if (r.g4c) g4c++;
  if (okC1) c1++;
  if (okC2) c2++;
  if (r.g5) g5++;
  if (r.c5ShutBefore && r.c5StillShut) c5++;
  console.log(`  seed ${String(seed).padStart(2)}  edges ${String(r.stats?.edges ?? '-').padStart(3)}`
    + `  faces ${String(r.faces ?? '-').padStart(3)}  dig-m ${String(r.diggableM ?? '-').padStart(6)}`
    + `  w ${r.faceWMin != null ? r.faceWMin.toFixed(2) + '..' + r.faceWMax.toFixed(2) : '-'}`
    + `  doors ${String(r.doorways ?? '-').padStart(3)}`
    + `  G1${r.g1 ? 1 : 0} G2${r.g2 ? 1 : 0} G3 ${r.g3aOk ?? '-'}/${r.g3bOk ?? '-'}/${r.doorways ?? '-'}`
    + `  hops ${r.g4aReach ? r.hopsToExit : '--'} digOnly ${r.digOnlyPairs ?? '-'}`
    + `  G5${r.g5 ? 1 : 0}(${r.g5ChannelW ?? '-'}m)`
    + `  calls ${r.worstStationCalls ?? '-'}@${r.worstStation ?? '-'}`
    + `${okClean ? '' : '  UNCLEAN'}${r.threw ? '  THREW: ' + r.error + '  ' + (r.stack ?? '') : ''}`
    + `${r.warnSkin ? '  [skin] x' + r.warnSkin + ' (skin.js\'s own line — see the header)' : ''}`
    + `${r.warnMine ? '  warns: ' + (r.warns || []).join(' | ') : ''}`);
}

const nums = (f) => rows.map(f).filter((v) => typeof v === 'number');
const max = (a) => (a.length ? Math.max(...a) : NaN);
const min = (a) => (a.length ? Math.min(...a) : NaN);

console.log(`\n  totals over ${N_SEEDS} seeds:`);
console.log(`  --  no throw, no warning        ${clean}/${N_SEEDS}`
  + `   (+ ${rows.filter((r) => r.warnSkin).length} seed(s) carrying skin.js's own tracked-handle line — reported, not gated)`);
console.log(`  G1  the house is diggable       ${g1}/${N_SEEDS}`);
console.log(`  G2  slab in [${(rows[0]?.faceWMin != null ? '' : '')}L_DIG, SLAB_MAX]      ${g2}/${N_SEEDS}`
  + `   (longest face ${max(nums((r) => r.faceWMax)).toFixed(2)} m of a 35.00 m cap)`);
console.log(`  G3  every doorway is a hole     ${g3}/${N_SEEDS}`
  + `   (worst masonry inside a doorway ${max(nums((r) => r.worstDoorM)).toFixed(4)} m)`);
/**
 * ⚠️ **G4a AND G4b ARE REPORTED, NOT GATED, AND THE SEEDS THAT FAIL THEM ARE NAMED.** Every G4a
 * failure is a seed whose spawn cannot reach part of its own house — `_plangen1-boot.mjs` B4 reads
 * 11/16 for the same reason and `genplan.js`'s header traces it to a sub-wall-thickness sliver in
 * `coverFree()`'s decomposition. It is a `plangen-1` defect, it predates this table, and adopting
 * it as a red here would either hide it or blame the dig for it.
 */
const failed = (f) => rows.map((r, i) => [i, r]).filter(([, r]) => !f(r)).map(([i]) => i);
console.log(`  G4a every exit site reachable   ${g4a}/${N_SEEDS}   (reported — seeds `
  + `${failed((r) => r.g4aReach).join(',') || 'none'} are `
  + `_plangen1-boot B4's known unreachable pocket, NOT this table's)`);
console.log(`  G4b hopsToExit >= 3             ${g4b}/${N_SEEDS}`
  + `   (reported — genspike's own minWalk disjunct: ${nums((r) => r.hopsToExit).join(',')})`);
console.log(`  G4c a dig opens a pair no door does  ${g4c}/${N_SEEDS}`);
console.log(`  G5  25 blows at the interconnect open a shut wall  ${g5}/${N_SEEDS}`
  + `   (channel ${min(nums((r) => r.g5ChannelW)).toFixed(2)}–${max(nums((r) => r.g5ChannelW)).toFixed(2)} m)`);
console.log(`\n  diggable metres per plan ${min(nums((r) => r.diggableM)).toFixed(1)}–${max(nums((r) => r.diggableM)).toFixed(1)}`
  + ` · faces ${min(nums((r) => r.faces))}–${max(nums((r) => r.faces))}`
  + ` · instanced groups ${min(nums((r) => r.instGroups))}–${max(nums((r) => r.instGroups))}`
  + ` · worst parked station ${max(nums((r) => r.worstStationCalls))} instanced wall calls`);
const tot = (k) => rows.reduce((n, r) => n + (r.stats?.[k] ?? 0), 0);
console.log(`  refused by the table: tooShort ${tot('tooShort')} · trimmed past a jamb ${tot('trimmed')}`
  + ` · thin pier ${tot('thinPier')} · over the cap ${tot('overCap')} · cap-split ${tot('capSplit')}`
  + ` · doorway taller than the band ${tot('overTall')}`);

// ---- the controls, every run --------------------------------------------------------------------
console.log(`\n  CONTROLS\n`);

console.log(`  C1  the masonry meter is LOUD at the jamb 0.20 m from each doorway,`
  + ` AND at the 0.08 m head above it   ${c1}/${N_SEEDS}`
  + `   (weakest jamb ${min(nums((r) => r.weakestJambM)).toFixed(3)} m; a blind meter reads 0)`);
console.log(`  C2  the same damage grid reads WALL 0.20 m from each doorway         ${c2}/${N_SEEDS}`
  + `   (depth 0 · barrier 1)`);
console.log(`  C5  the same 25 blows AWAY from an interconnect leave the wall shut  ${c5}/${N_SEEDS}`);

const c3 = worker(['--seed', '0', '--nodig']);
const c3Red = c3.threw === false && c3.g1 === false && c3.faces === 0;
console.log(`  C3  dig table forced to [] on seed 0: faces ${c3.faces} · G1 ${c3.g1 ? 'green' : 'RED'} — `
  + `${c3Red ? 'PASS (went red, as required)' : 'FAIL — G1 survived an empty dig table: the probe is not observing the dig'}`
  + `${c3.threw ? '  THREW: ' + c3.error : ''}`);

const c4 = worker(['--unflagged']);
const c4Ok = c4.edgesIsAuthored === true && c4.edgeCount === 7;
console.log(`  C4  no flag: digEdges() Object.is DIG_EDGES = ${c4.edgesIsAuthored}, ${c4.edgeCount} rows — `
  + `${c4Ok ? 'PASS (the authored seven, same array object)' : 'FAIL — the generated mode is leaking into the authored arm'}`);

// ---- the draw-call A/B, off C3's arm: same seed, same stations, one feature apart ---------------
const a0 = rows[0];
if (a0 && c3.worstStationCalls != null && a0.worstStationCalls != null) {
  console.log(`\n  DRAW CALLS (scene-graph census, not a renderer sample — deterministic)`);
  console.log(`  seed 0, every space parked in place (never walked): worst station`
    + ` dig OFF ${c3.worstStationCalls} → dig ON ${a0.worstStationCalls}`
    + `  Δ +${a0.worstStationCalls - c3.worstStationCalls} instanced wall draw calls`
    + `  · median station ${c3.medStationCalls} → ${a0.medStationCalls}`
    + `  · constructed groups ${c3.instGroups} → ${a0.instGroups}, meshes ${c3.instMeshes} → ${a0.instMeshes}`);
}

console.log(`\n  🕳️ EVERY aperture-free face carries an interconnect on every seed`
  + ` (${rows.map((r) => `${r.icFaces}/${r.plainFaces}`).join(' ')})`
  + ` — one region per EDGE against 17–36 edges. Reported: it is dig.md's own per-edge rule at`
  + ` its limit, and it makes the SEARCH nearly free in a generated house.`);

const gatesOk = clean === N_SEEDS && g1 === N_SEEDS && g2 === N_SEEDS && g3 === N_SEEDS
  && g4c === N_SEEDS && g5 === N_SEEDS;
const controlsOk = c3Red && c4Ok && c1 === N_SEEDS && c2 === N_SEEDS && c5 === N_SEEDS;
console.log(`\n  ${gatesOk ? 'GATED: clean/G1/G2/G3/G4c/G5 all 16/16' : 'GATED: one or more of clean/G1/G2/G3/G4c/G5 is not 16/16 — see the rows above'}`
  + ` · REPORTED: G4a ${g4a}/${N_SEEDS}, G4b ${g4b}/${N_SEEDS} (see the header)`
  + ` · controls ${controlsOk ? 'OK' : 'FAILED — do not trust the tally above'}\n`);

process.exit(controlsOk ? 0 : 1);
