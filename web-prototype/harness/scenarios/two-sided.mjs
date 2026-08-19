/**
 * 🪞 **TWO-SIDED — DOES THE SAME DAMAGED WALL LOOK THE SAME FROM BOTH ROOMS?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/two-sided.mjs \
 *        --port 5411 --q "seed=s4" --shots
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/two-sided.mjs \
 *        --port 5411 --q "seed=s4&pair=bal_east.1" --shots      # name the wall
 *
 * Pictures land in `progress/twoside/`: `two-sided-contact.png` (both rooms, three states, the
 * numbers printed on it), `two-sided-masks-{dug,dug-more}.png` (the two damage silhouettes drawn
 * in the same wall coordinates with the disagreement coloured), and the six raw frames.
 * ⚠️ **This file writes NOTHING under `src/`.** Every arm it drives is a runtime field or a
 * uniform, so a build it measures is the build that ships.
 *
 * John, 2026-08-10, holding two screenshots of ONE wall: *"one wall without any difference in
 * damage but they look very different from each side… I want it to look like the same damaged
 * wall from each side."* Asked for the instrument by name: *"can we create a tool to test this
 * and allow the critic and builder to use to verify their work."*
 *
 * ---------------------------------------------------------------------------
 * 🎯 THE DELIVERABLE IS A NUMBER. THE PICTURES ARE THE RECEIPT.
 * ---------------------------------------------------------------------------
 * Two figures, both reported on every run, and a builder's job is to make them go DOWN:
 *
 *   **ΔGRID**  the two sides' damage GRIDS, cell for cell, u mirrored. Exact, deterministic,
 *              no camera, no lighting — `%` of cells whose depth differs by more than 0.10.
 *              This is the mechanism-level number and it cannot be argued with.
 *   **ΔSEEN**  the two sides' VISIBLE damage, compared at the same PHYSICAL points on the wall.
 *              For every sample point, does this side show a change from its own pristine
 *              picture? Then: `symmetric difference / union`, as a percentage. 0 % means both
 *              rooms show damage at exactly the same places on the wall; 100 % means the two
 *              rooms have no damaged wall in common at all.
 *
 * ---------------------------------------------------------------------------
 * 🚨 THE THREE TRAPS THIS FILE IS BUILT AROUND, EACH ONE ASSERTED RATHER THAN ASSUMED
 * ---------------------------------------------------------------------------
 * **1. THE TWO VIEWS ARE MIRROR IMAGES, so a naive pixel diff reports a permanent false
 * difference and is worthless.** The two faces of one band are built back to back — `dig.js`
 * `freePanels()` gives side `b` the opposite `rotY` — so face B's local +x runs the opposite way
 * round the wall and `wall.js` `_couple()` mirrors `u` when it copies a through-cell across.
 * **So nothing here is ever compared in SCREEN space.** Every sample is a POINT ON THE WALL, in
 * world coordinates, taken on the band's own centre plane as the midpoint of `A.pointAt(u,v)`
 * and `B.pointAt(1-u,v)` — derived from the panels, never typed — and then projected through
 * whichever camera is live at the moment of that capture. Mirroring, perspective, standoff and
 * any camera drift between the two rooms all fall out of that by construction.
 * ⚠️ **C3 runs the comparison WITH THE MIRROR TAKEN OUT as a control that must fail**, on a
 * deliberately OFF-CENTRE crater, so a future edit that flips it the wrong way round is caught.
 *
 * **2. LIGHTING AND DECORATION DIFFER BETWEEN TWO ROOMS AND ARE NOT THE BUG.** Room A and room B
 * light their own face of the wall differently and dress it with their own boiserie, so an
 * absolute colour comparison across the band measures the house, not the damage. **So each side
 * is compared to ITSELF**: `ΔSEEN` asks "is this wall point different from how this same camera
 * saw it before the dig", which cancels the lighting and the decoration exactly, and then
 * compares the two sides' ANSWERS. That is also literally John's sentence — *no difference in
 * damage, but they look very different* — asked arithmetically.
 *
 * **3. A COMPARISON BUILT ON A 4 % FLOOR IS WORTHLESS.** `harness/still.mjs` `hold()`/`release()`
 * around every capture; the floor is measured on every run (C1, two captures inside one hold) and
 * the cross-hold floor too (C2, the same camera re-parked before anything was dug). If either
 * floor is not ~0 the run says so instead of reporting a number on top of it.
 *
 * ---------------------------------------------------------------------------
 * 🚨 CONTROLS THAT MUST FAIL — ALL FOUR RUN ON EVERY RUN
 * ---------------------------------------------------------------------------
 *   C1  the still floor: two captures inside one hold must be the same picture (≤ 0.05 %).
 *   C2  the cross-hold floor: the same camera, re-parked, nothing dug in between.
 *   C3  the mirror is the right way round: on an OFF-CENTRE crater, ΔGRID computed WITHOUT the
 *       u-flip must be strictly worse than with it. If it is not, the flip is wrong or dead.
 *   C4  **THE INSTRUMENT CAN SEE A DIFFERENCE — A REINTRODUCTION, IN THE PAGE.** The twin's
 *       through-cells are filled back in over a third of the face, which is the pre-2026-08-09
 *       far side, and both headline numbers must jump; then it is undone byte-exactly and ΔGRID
 *       must come back to the digit. Sixteen recorded instruments on this project produced a
 *       result-shaped output instead of an error; this is the arm that refuses to.
 *       ⚠️ **"Dig one side further and the number must rise" was tried FIRST and it FAILS ON A
 *       GOOD TREE** — with `_couple()` working, ΔGRID is already at the two-cell floor and a
 *       bigger hole cannot raise it (`f.bal_east.1` read 0.208% -> 0.104%). It is kept as a
 *       REPORTED arm, not a gate.
 *
 * ---------------------------------------------------------------------------
 * 🚨 AND TWO MORE NUMBERS, BECAUSE JOHN NAMED TWO SYMPTOMS AND THEY MAY BE TWO BUGS
 * ---------------------------------------------------------------------------
 *   **ΔGONE**     restricted to the points BOTH grids say are gone: the fraction where only one
 *                 room shows it. The tight claim, immune to the ambient-light change a new hole
 *                 makes to the rest of a room — which saturates ΔSEEN.
 *   **FLOATERS**  detached islands of material the PAIR still draws inside its own hole, counted
 *                 per room. *"There are some floating bits"* is a different sentence from *"they
 *                 look different from each side"* and this file refuses to merge them.
 *   **WHY HIDDEN** every mesh the pair owns is flipped OFF inside the same hold, so a room that
 *                 shows no damage at a through point is told apart into **the wall pair is still
 *                 drawing something there** and **something else is in front of it**. HANDOFF's
 *                 dominant defect class, asked directly — and on `f.gal_svc.0` it is what named
 *                 the gallery portrait rather than the shader.
 *
 * ---------------------------------------------------------------------------
 * 📉 WHAT IT READ THE FIRST TIME IT RAN (`twoside-1`, 2026-08-10, seed s4, 26 blows on side A)
 * ---------------------------------------------------------------------------
 * 🚨 **THE ASSUMED CAUSE IS REFUTED. THE TWO SIDES' STATE AGREES; THE PICTURES DO NOT, AND ON
 * THE WORST WALL IN THE HOUSE 99.9% OF THAT IS SOMETHING HANGING IN FRONT OF THE HOLE.**
 *
 * | | `f.bal_east.1` ballroom/study_e | `f.gal_svc.0` service/gallery |
 * |---|---|---|
 * | ΔGRID | **0.208%** (2 cells of 960) | **0.119%** (1 cell of 840) |
 * | ΔGONE | **0.5%** | **32.7%** |
 * | the far room shows the hole at | **99.7%** of through points | **69.2%** |
 * | of the points it does NOT show, drawn by the wall pair | 19 | **2** |
 * | …drawn by SOMETHING ELSE IN FRONT | 1 | **1764** |
 * | detached islands inside the hole | A 0 · B 1 (11 pts ≈ 69 cm²) | A 1 (6 pts) · B 0 |
 *
 * 🎯 **SO `_couple()` AND `setBarrier()` ARE DOING THEIR JOB — ΔGRID IS AT THE ONE-CELL FLOOR ON
 * BOTH WALLS — AND THE WALL SHADER DRAWS THE SAME HOLE FROM BOTH ROOMS TO WITHIN HALF A PERCENT
 * WHEN NOTHING IS IN FRONT OF IT.** The 32.7% on `f.gal_svc.0` is `gallery-order.js`'s
 * **`portraits`**: one merged, one-sided, unbreakable mesh dressing both long walls end to end at
 * a fixed 2.9 m pitch, 0.11 m proud, with no knowledge of where the dig faces are. From the
 * service passage the breach is a full torn opening; from the gallery a gilt portrait hangs
 * across two thirds of it, intact, **with the wall it was fixed to gone behind it** — which is
 * both halves of John's sentence at once, the mismatch AND a floating bit.
 * ⚠️ **It is the same defect as `exterior.dress.mortar`** (HANDOFF's open list: an opaque slab
 * over 92% x 88% of an aperture, 8 mm proud) and it is `destruction.md` §10(f) promoted from a
 * look question to a measured one. **Neither file is `wall.js`, `breakmask.js` or
 * `wallinstances.js`.**
 * 🖼️ `progress/twoside/two-sided-contact.png` and `-A1/-B1.png` are the pair of frames.
 * ✅ **Two consecutive runs of `f.gal_svc.0` reproduced to the digit** — ΔGRID 0.119%, ΔGONE
 * 32.7%, ΔSEEN 33.85%, on separate processes and separate page loads.
 * ⚠️ `nameAt` answers `kit:wall` / `kit:gilt` / `kit:skirt` at 0 m because `room.js` merges the
 * dressing into `GeoBin` meshes whose AABB is the whole room — see its own note. **The
 * measurement that names the class is `whyHidden`'s meshes-off flip (1773 : 0); the photograph
 * is what names the prop.**
 *
 * 🔬 **AND TWO THINGS THIS FOUND ON THE WAY THAT ARE NOT FIXED AND ARE NOT GUESSES:**
 * 1. **`PARTIAL` IS EMPTY ON EVERY FACE MEASURED** — at `DIG_BASE` 8 one blow takes the whole
 *    brush clean through, so both grids are effectively binary and `_couple()`'s "mirror only
 *    cells past `OPEN_AT`" costs nothing. **At a lower power it would not be:** the near face
 *    would carry a graded crater and the twin a stamped binary hole. Drop `brush.base` in the
 *    drive and this tool will show it. Latent, hidden by the shipped pacing.
 * 2. **THE TEAR LATTICE IS MIRRORED BETWEEN TWINS BY CONSTRUCTION.** `breakmask.js` takes both
 *    `_rrrOrder` and `_bgPlate` at `vMapUv`, which is the FACE's own uv — and face `b`'s runs the
 *    opposite way round the wall — so at one physical wall point the two faces read different
 *    order and different plate constants and the same hole tears into two different polygons.
 *    That is a RIM-zone effect, which is why this file has a RIM zone. It did not dominate either
 *    wall measured, so it was reported rather than changed.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DELIBERATELY DOES NOT MEASURE
 * ---------------------------------------------------------------------------
 * ⚠️ **The payout is suppressed during the drive** (`onChunk` / `onBreak` nulled, restored
 * after), so no debris, dust or falling slab stands between the camera and the wall. The
 * collapse RULE still runs — it lives in `_add()` — so the hole is the shipped hole. This tool
 * is about the WALL; a slab on the floor of one room and not the other is a real asymmetry and a
 * different question.
 * ⚠️ **The player and the hunter models are hidden for the captures**, both arms alike, because
 * `ThirdPersonCamera` puts the body between the boom and the breach.
 * ⚠️ It samples from **0.25 m above the floor up**, so the skirting-height debris drift and the
 * floor itself stay out of the statistic.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hold, release } from '../still.mjs';

/** the sample lattice, in metres on the wall */
const REGION = { halfW: 1.30, v0: 0.25, v1: 2.30, step: 0.025 };
/** what counts as "this pixel changed from its own pristine picture" */
const CHANGE = { luma: 10, chan: 12 };
/** what counts as "these two cells disagree about how dug they are" */
const GRID_EPS = 0.10;

// ---------------------------------------------------------------------------------------------
// PAGE SIDE
// ---------------------------------------------------------------------------------------------
const HELPERS = () => {
  const W = window;
  const E = () => W.__rrr.engine;

  W.__ts = {
    /** every free dig face that carries a damage field AND a twin, as pairs, `a` first. */
    pairs() {
      const ps = E().room.panels.filter((p) => p.spec?.free && p.field && p.twin?.field);
      const out = [];
      for (const p of ps) {
        if (p.spec.side !== 'a') continue;
        const q = p.twin;
        if (!q || q.field.cols !== p.field.cols || q.field.rows !== p.field.rows) continue;
        out.push({
          a: p.id, b: q.id, edge: p.spec.edge, seg: p.spec.seg,
          roomA: p.spec.a, roomB: p.spec.b,
          w: +p.width.toFixed(2), h: +p.height.toFixed(2),
          cols: p.field.cols, rows: p.field.rows,
          freeCells: p.field.barrier.reduce((s, b) => s + (b ? 0 : 1), 0),
        });
      }
      return out;
    },

    /**
     * Where to dig: the centroid of this face's barrier-FREE cells if it has an interconnect,
     * otherwise the middle of the face. Returned in the face's own (u, v).
     * ⚠️ Deliberately pulled OFF CENTRE in u so C3's mirror control has something to bite on.
     */
    target(id) {
      const p = E().room.panelOf(id), g = p.field;
      let n = 0, su = 0, sv = 0;
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          if (g.barrier[g.idx(cx, cy)]) continue;
          su += (cx + 0.5) / g.cols; sv += (cy + 0.5) / g.rows; n++;
        }
      }
      const u = n ? su / n : 0.34;
      const v = n ? Math.max(0.16, Math.min(0.55, sv / n)) : 0.30;
      return { u: +u.toFixed(4), v: +v.toFixed(4), freeCells: n, offCentre: +(u - 0.5).toFixed(3) };
    },

    /**
     * The sample lattice: points on the wall band's OWN CENTRE PLANE, as the midpoint of the two
     * faces' `pointAt`. Never typed, so it cannot drift from the geometry, and it is the same
     * physical set of points for both rooms — which is the whole trick.
     */
    lattice(aId, bId, cu, region) {
      const room = E().room;
      const A = room.panelOf(aId), B = room.panelOf(bId);
      const du = region.halfW / A.width;
      const u0 = Math.max(0.005, cu - du), u1 = Math.min(0.995, cu + du);
      const stepU = region.step / A.width;
      const pts = [];
      for (let v = region.v0; v <= region.v1 + 1e-9; v += region.step) {
        const vv = v / A.height;
        if (vv <= 0.002 || vv >= 0.998) continue;
        for (let u = u0; u <= u1 + 1e-9; u += stepU) {
          const pa = A.pointAt(u, vv), pb = B.pointAt(1 - u, vv);
          pts.push({
            u: +u.toFixed(5), v: +vv.toFixed(5),
            x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2,
          });
        }
      }
      W.__ts._pts = pts;
      W.__ts._ids = { a: aId, b: bId };
      return { n: pts.length, u0: +u0.toFixed(4), u1: +u1.toFixed(4) };
    },

    /** project the lattice through whatever camera is live RIGHT NOW. */
    project() {
      const e = E();
      const cam = e.cam?.camera ?? e.camera;
      cam.updateMatrixWorld();
      const V = e.player.pos.constructor;
      const s = new V();
      const out = new Float32Array(W.__ts._pts.length * 2);
      let on = 0;
      for (let i = 0; i < W.__ts._pts.length; i++) {
        const p = W.__ts._pts[i];
        s.set(p.x, p.y, p.z).project(cam);
        const nx = (s.x + 1) / 2, ny = (1 - s.y) / 2;
        out[i * 2] = nx; out[i * 2 + 1] = ny;
        if (nx > 0.004 && nx < 0.996 && ny > 0.004 && ny < 0.996 && s.z < 1) on++;
      }
      return { xy: Array.from(out), onScreen: on };
    },

    /**
     * Stand in a panel's own room, looking at the sample region's centre. The sim must be LIVE
     * when this runs — `still.mjs` says why. `shoulder` swings the boom off the body; the body is
     * hidden anyway, and both arms get the identical treatment.
     */
    park(id, cu, cv, back = 2.9, shoulder = 0.42) {
      const e = E(), room = e.room, p = room.panelOf(id);
      const n = p.normal, c = p.pointAt(cu, cv);
      e.player.pos.set(c.x + n.x * back, room.floorY, c.z + n.z * back);
      e.player.vel.set(0, 0, 0);
      const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
      e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
      if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; e.cam.shoulder = shoulder; }
      const sp = room.spaceAt(e.player.pos);
      return {
        id, room: sp?.id ?? null, wanted: p.spec.a, back,
        at: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
        resident: room.visibleSpaces?.() ?? null,
      };
    },

    /**
     * 🔬 **EVERY MESH THE PAIR OWNS, OFF AND BACK ON — AND THIS IS THE INSTRUMENT THAT TELLS
     * "THE WALL DRAWS NOTHING THERE" FROM "SOMETHING ELSE IS IN FRONT OF IT".**
     *
     * HANDOFF's dominant defect class is *"it exists, something is in front of it"*, and a
     * before/after change mask cannot see the difference — a room that shows no change at a wall
     * point might be drawing an unbroken wall, or might be drawing a PICTURE hanging over it.
     * Flipped inside one frozen hold, so the two frames differ in exactly this and nothing else:
     * whatever moves is drawn BY THE PAIR, and whatever does not is somebody else's mesh.
     */
    showPanels(on) {
      const room = E().room;
      let n = 0;
      for (const id of [W.__ts._ids.a, W.__ts._ids.b]) {
        const p = room.panelOf(id);
        if (!p) continue;
        const parts = [...p.layers, p.reveal, p.barrier].filter(Boolean);
        for (const m of parts) {
          if (!on) { m.userData.__tsOn ??= m.visible; m.visible = false; }
          else if (m.userData.__tsOn !== undefined) { m.visible = m.userData.__tsOn; delete m.userData.__tsOn; }
          n++;
        }
      }
      return n;
    },

    /** nothing between the boom and the wall, both arms alike. */
    hideBodies(on) {
      const e = E();
      let n = 0;
      for (const o of [e.player?.root, e.hunter?.root]) {
        if (!o) continue;
        if (on) { o.userData.__tsVis ??= o.visible; o.visible = false; }
        else if (o.userData.__tsVis !== undefined) { o.visible = o.userData.__tsVis; delete o.userData.__tsVis; }
        n++;
      }
      return n;
    },

    /**
     * A competent excavation on ONE face, aimed at the least-dug cell inside the target box —
     * `dig-band`'s own policy, so this is the shape a player who can aim actually produces.
     * ⚠️ The payout is suppressed for the drive: this tool photographs the WALL.
     */
    dig(id, cu, cv, blows, halfW = 0.52, vLo = 0.30, vHi = 1.60) {
      const p = E().room.panelOf(id), g = p.field;
      const keep = { chunk: p.onChunk, brk: p.onBreak };
      p.onChunk = null; p.onBreak = null;
      const cx0 = Math.max(0, Math.floor((cu - halfW / p.width) * g.cols));
      const cx1 = Math.min(g.cols - 1, Math.ceil((cu + halfW / p.width) * g.cols));
      const cy0 = Math.max(0, Math.floor(vLo / g.cellH));
      const cy1 = Math.min(g.rows - 1, Math.ceil(vHi / g.cellH));
      let n = 0;
      for (let k = 0; k < blows; k++) {
        let bx = cx0, by = cy0, bd = 2;
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const d = g.depth[g.idx(cx, cy)];
            if (d < bd) { bd = d; bx = cx; by = cy; }
          }
        }
        p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
        n++;
      }
      p.onChunk = keep.chunk; p.onBreak = keep.brk;
      g.flush(); p.twin?.field?.flush();
      return n;
    },

    /** the state of one face, in the terms this tool argues in. */
    faceState(id) {
      const p = E().room.panelOf(id), g = p.field;
      let through = 0, barr = 0, touched = 0;
      for (let i = 0; i < g.depth.length; i++) {
        if (g.depth[i] >= 0.999) through++;
        if (g.barrier[i]) barr++;
        if (g.depth[i] > 0.02) touched++;
      }
      return {
        id, hits: g.hits.length, maxDepth: +g.maxDepth.toFixed(3),
        through, touched, barrier: barr, stage: p.state.stage,
        pristine: !!p.pristine, instanced: !!p.instanced,
        layersOn: p.layers.map((m) => (m.visible ? 1 : 0)).join(''),
        barrierOn: !!p.barrier?.visible,
        passable: !!p.openChannel().open,
      };
    },

    /**
     * 🎯 **ΔGRID — the two sides' damage grids, u mirrored.** No camera, no lighting, no
     * pixels: this is the state the renderer is drawing FROM, and if it disagrees the picture
     * cannot possibly agree. `flip` false is C3's control arm.
     */
    gridDelta(aId, bId, eps, flip = true) {
      const room = E().room;
      const f = room.panelOf(aId).field, g = room.panelOf(bId).field;
      let n = 0, bad = 0, sum = 0, aOnly = 0, bOnly = 0;
      for (let cy = 0; cy < f.rows; cy++) {
        for (let cx = 0; cx < f.cols; cx++) {
          const i = f.idx(cx, cy);
          const j = g.idx(flip ? g.cols - 1 - cx : cx, cy);
          const d = Math.abs(f.depth[i] - g.depth[j]);
          sum += d; n++;
          if (d > eps) { bad++; if (f.depth[i] > g.depth[j]) aOnly++; else bOnly++; }
        }
      }
      return {
        cells: n, disagree: +(100 * bad / n).toFixed(3), meanAbs: +(sum / n).toFixed(4),
        aDeeper: aOnly, bDeeper: bOnly,
      };
    },

    /**
     * 🔬 **THE GRID'S OWN ANSWER AT EVERY SAMPLE POINT, so the picture can be cross-tabbed
     * against the truth.** Without this the headline number cannot tell "the two rooms disagree
     * about the HOLE" from "one room repainted its whole WALL" — and those are different bugs
     * with different fixes. `b` is read at the mirrored `u`, for `_couple()`'s reason.
     */
    depthsAt() {
      const room = E().room;
      const A = room.panelOf(W.__ts._ids.a), B = room.panelOf(W.__ts._ids.b);
      const f = A.field, g = B.field;
      const out = [];
      for (const p of W.__ts._pts) {
        const cx = Math.min(f.cols - 1, Math.max(0, Math.floor(p.u * f.cols)));
        const cy = Math.min(f.rows - 1, Math.max(0, Math.floor(p.v * f.rows)));
        out.push([
          f.depth[f.idx(cx, cy)],
          g.depth[g.idx(g.cols - 1 - cx, cy)],
        ]);
      }
      return out;
    },

    /**
     * 🚨 **THE REINTRODUCTION ARM — PUT THE OLD DEFECT BACK, IN THE PAGE, AND MAKE THE
     * INSTRUMENT PROVE IT CAN SEE IT.**
     *
     * `unblock-1`/`seethrough-1` fixed a far side whose grid never learned about the near side's
     * hole. This fills a rectangular third of the twin's through-cells back in — the same state
     * the pre-2026-08-09 build was in — and both headline numbers must jump. It is state
     * independent, which "dig one side further" is not: once `_couple()` is working ΔGRID sits
     * at the two-cell floor and digging more cannot raise a number that is already zero. That
     * arm was tried first and it FAILED on a good tree for exactly that reason.
     *
     * ⚠️ Byte-exact undo: the two arrays are copied, not recomputed.
     */
    desync(on, frac = 0.34) {
      const p = E().room.panelOf(W.__ts._ids.b), g = p.field;
      if (on) {
        W.__ts._keep = { depth: g.depth.slice(0), data: g.data.slice(0), max: g._maxDepth };
        const y1 = Math.floor(g.rows * frac);
        let n = 0;
        for (let cy = 0; cy < y1; cy++) {
          for (let cx = 0; cx < g.cols; cx++) {
            const i = g.idx(cx, cy);
            if (g.depth[i] <= 0.001) continue;
            g.depth[i] = 0; g.data[i * 4] = 0; g.data[i * 4 + 2] = 0; n++;
          }
        }
        g.dirty = true; g._touch(); g.flush(); p._solidBoxes = null; p._sightBoxes = null; p._apply();
        return { filled: n, rows: y1 };
      }
      if (!W.__ts._keep) return { restored: 0 };
      g.depth.set(W.__ts._keep.depth); g.data.set(W.__ts._keep.data); g._maxDepth = W.__ts._keep.max;
      g.dirty = true; g._touch(); g.flush(); p._solidBoxes = null; p._sightBoxes = null; p._apply();
      W.__ts._keep = null;
      return { restored: 1 };
    },

    /**
     * 🚨 **NAME THE MESH THAT IS IN FRONT OF THE HOLE.** `whyHidden` counts them; this says what
     * they are. Every hit in depth order, not the nearest one — `aperture-1`'s note that *"a
     * single nearest-hit answer cannot tell 'nothing draws here' from 'something black draws
     * here'"*, and the pair's own meshes are labelled rather than dropped so the ordering reads.
     * 🚨 **AND IT ANSWERS WITH A BIN, NOT A PROP, WHICH IS A LIMITATION AND IS STATED AS ONE.**
     * `room.js` merges a room's dressing into a handful of `GeoBin` meshes by material key, so
     * the whole gallery comes back as `kit:wall` / `kit:gilt` / `kit:skirt` at **0 m** — one
     * merged AABB spanning the room. That is enough to say *the occluder is this room's DRESSING
     * and not the wall pair*, which is the question, and it is not enough to name the prop.
     * To name the prop, hide one bin at a time in the same frozen hold and re-read `whyHidden`.
     * ⚠️ It is an identification aid, not the measurement — `whyHidden`'s meshes-off flip is.
     */
    nameAt(i) {
      const e = E();
      const p = W.__ts._pts[i];
      if (!p) return null;
      const cam = e.cam?.camera ?? e.camera;
      const V = e.player.pos.constructor;
      const to = new V(p.x, p.y, p.z);
      const from = cam.getWorldPosition(new V());
      const dir = to.clone().sub(from);
      const dist = dir.length();
      if (dist < 1e-4) return null;
      dir.multiplyScalar(1 / dist);
      const own = new Set([W.__ts._ids.a, W.__ts._ids.b]);
      const corner = new V();
      const out = [];
      // ⚠️ WORLD AABB, NOT A TRIANGLE INTERSECTION. `THREE` is not reachable from the page, so
      // there is no `Raycaster` here; a slab test against each mesh's own transformed bounding
      // box is coarse, and it is stated as coarse. It is enough to NAME what stands between a
      // camera and a hole — which is all this is for — and it walks only VISIBLE meshes, so it
      // does not repeat `--pick`'s "reports geometry the GPU threw away".
      e.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        for (let g = o; g; g = g.parent) if (g.visible === false) return;
        if (!o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        if (!bb) return;
        o.updateWorldMatrix(true, false);
        let lo = null, hi = null;
        for (let k = 0; k < 8; k++) {
          corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(o.matrixWorld);
          if (!lo) { lo = corner.clone(); hi = corner.clone(); continue; }
          lo.min ? lo.min(corner) : 0;
          for (const ax of ['x', 'y', 'z']) {
            if (corner[ax] < lo[ax]) lo[ax] = corner[ax];
            if (corner[ax] > hi[ax]) hi[ax] = corner[ax];
          }
        }
        let t0 = 0, t1 = dist;
        for (const ax of ['x', 'y', 'z']) {
          const d = dir[ax];
          if (Math.abs(d) < 1e-9) { if (from[ax] < lo[ax] || from[ax] > hi[ax]) return; continue; }
          let a = (lo[ax] - from[ax]) / d, b = (hi[ax] - from[ax]) / d;
          if (a > b) { const s = a; a = b; b = s; }
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
          if (t0 > t1) return;
        }
        let owner = '';
        for (let g = o; g; g = g.parent) if (g.name) { owner = g.name; break; }
        const mine = [...own].some((id) => (o.name || '').includes(id) || owner.includes(id));
        out.push({
          d: +t0.toFixed(3), name: o.name || '(unnamed)', owner,
          mat: o.material?.name || o.material?.type || '?', mine,
        });
      });
      out.sort((a, b) => a.d - b.d);
      return { u: p.u, v: p.v, dist: +dist.toFixed(2), hits: out.slice(0, 6) };
    },

    /** the interconnect region is a per-run fact; say which faces carry one. */
    census() {
      const e = E();
      return {
        mode: e.room.digCensus?.().mode ?? '?', seed: String(e.run?.seed ?? ''),
        spaces: e.room.visibleSpaces?.() ?? null,
      };
    },
  };
  return true;
};

/**
 * Sample two PNGs at the SAME recorded screen points and report, per point, whether the pixel
 * changed. Decoding happens in the page because that is where a canvas lives — the same trick
 * `_st1-remain.mjs` uses, and it keeps this file free of an image dependency.
 */
async function changeMask(page, beforePng, afterPng, xyBefore, xyAfter, cfg) {
  return page.evaluate(async ([b64a, b64b, xa, xb, c]) => {
    const load = async (d) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${d}`; });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      return { d: cx.getImageData(0, 0, img.width, img.height), w: img.width, h: img.height };
    };
    const A = await load(b64a), B = await load(b64b);
    const n = xa.length / 2;
    const changed = new Uint8Array(n);
    const valid = new Uint8Array(n);
    let vN = 0, cN = 0, sumD = 0;
    for (let i = 0; i < n; i++) {
      const ax = Math.round(xa[i * 2] * A.w), ay = Math.round(xa[i * 2 + 1] * A.h);
      const bx = Math.round(xb[i * 2] * B.w), by = Math.round(xb[i * 2 + 1] * B.h);
      if (ax < 1 || ay < 1 || ax >= A.w - 1 || ay >= A.h - 1) continue;
      if (bx < 1 || by < 1 || bx >= B.w - 1 || by >= B.h - 1) continue;
      valid[i] = 1; vN++;
      const oa = (ay * A.w + ax) * 4, ob = (by * B.w + bx) * 4;
      const dr = Math.abs(A.d.data[oa] - B.d.data[ob]);
      const dg = Math.abs(A.d.data[oa + 1] - B.d.data[ob + 1]);
      const db = Math.abs(A.d.data[oa + 2] - B.d.data[ob + 2]);
      const la = 0.2126 * A.d.data[oa] + 0.7152 * A.d.data[oa + 1] + 0.0722 * A.d.data[oa + 2];
      const lb = 0.2126 * B.d.data[ob] + 0.7152 * B.d.data[ob + 1] + 0.0722 * B.d.data[ob + 2];
      const dl = Math.abs(la - lb);
      sumD += dl;
      if (dl > c.luma || Math.max(dr, dg, db) > c.chan) { changed[i] = 1; cN++; }
    }
    return {
      changed: Array.from(changed), valid: Array.from(valid),
      validN: vN, changedN: cN, changedPct: vN ? +(100 * cN / vN).toFixed(3) : null,
      meanAbsLuma: vN ? +(sumD / vN).toFixed(3) : null,
    };
  }, [beforePng.toString('base64'), afterPng.toString('base64'), xyBefore, xyAfter, cfg]);
}

/**
 * 🎯 **ΔSEEN.** Two per-point boolean masks, taken in the two rooms at the SAME physical wall
 * points, combined as symmetric difference over union. This is the headline number.
 */
function seenDelta(mA, mB) {
  let both = 0, aOnly = 0, bOnly = 0, n = 0;
  for (let i = 0; i < mA.changed.length; i++) {
    if (!mA.valid[i] || !mB.valid[i]) continue;
    n++;
    const a = mA.changed[i], b = mB.changed[i];
    if (a && b) both++; else if (a) aOnly++; else if (b) bOnly++;
  }
  const union = both + aOnly + bOnly;
  return {
    samples: n, union, both, aOnly, bOnly,
    delta: union ? +(100 * (aOnly + bOnly) / union).toFixed(2) : null,
    aPct: n ? +(100 * (both + aOnly) / n).toFixed(2) : null,
    bPct: n ? +(100 * (both + bOnly) / n).toFixed(2) : null,
  };
}

/**
 * 🔬 **WHERE THE DISAGREEMENT IS, AGAINST THE GRID.** Three zones per sample point, read off the
 * two depth grids: `GONE` (both sides' grids say the material is out), `INTACT` (neither side has
 * touched it), `PARTIAL` (everything between). Then: what fraction of each zone does each room
 * SHOW as changed?
 *
 * 🎯 **THIS IS THE LINE THAT NAMES THE BUG.** Two rooms disagreeing inside `GONE` is a hole that
 * draws differently from each side. A room showing change over `INTACT` is a face that repainted
 * itself — a different defect, in a different file, and merging the two into one story is exactly
 * what this project's confession log says costs a round.
 */
function zoneTable(pts, depths, mA, mB) {
  /**
   * 🎯 **AND THE RIM IS ITS OWN ZONE, BECAUSE IT IS THE ONLY ONE THE COMPLAINT IS ABOUT.**
   * `damagefield.js` `_smooth()` spreads the brush's one-cell cliff with a ~11 cm sigma and
   * `DAMAGE_BANDS` slices that ramp into four concentric rings, so the torn shell, the lip and
   * the cyan-in-section all live in a band roughly 35 cm OUTSIDE the through-cells. A statistic
   * that pools that band with the whole rest of the face dilutes it into nothing — `f.bal_east.1`
   * reads 0.5% over GONE while the two outlines are visibly different polygons.
   * ⚠️ At the shipped `DIG_BASE` of 8 one blow goes clean through, so PARTIAL is EMPTY on every
   * face measured. The rim is a render fact, not a grid fact, and has to be defined off distance.
   */
  const RIM_M = 0.35;
  const us = [...new Set(pts.map((p) => p.u))].sort((a, b) => a - b);
  const vs = [...new Set(pts.map((p) => p.v))].sort((a, b) => a - b);
  const ui = new Map(us.map((u, i) => [u, i])), vi = new Map(vs.map((v, i) => [v, i]));
  const W = us.length, H = vs.length;
  const R = Math.max(1, Math.round(RIM_M / REGION.step));
  const gone = new Uint8Array(W * H);
  const at = new Int32Array(W * H).fill(-1);
  for (let i = 0; i < pts.length; i++) {
    const k = vi.get(pts[i].v) * W + ui.get(pts[i].u);
    at[k] = i;
    if (depths[i][0] >= 0.999 && depths[i][1] >= 0.999) gone[k] = 1;
  }
  const nearGone = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!gone[y * W + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          if (dx * dx + dy * dy <= R * R) nearGone[yy * W + xx] = 1;
        }
      }
    }
  }
  const isRim = new Uint8Array(depths.length);
  for (let k = 0; k < W * H; k++) if (nearGone[k] && !gone[k] && at[k] >= 0) isRim[at[k]] = 1;

  const Z = { GONE: 0, RIM: 1, PARTIAL: 2, INTACT: 3 };
  const rows = [0, 1, 2, 3].map(() => ({ n: 0, a: 0, b: 0, dis: 0 }));
  for (let i = 0; i < depths.length; i++) {
    if (!mA.valid[i] || !mB.valid[i]) continue;
    const da = depths[i][0], db = depths[i][1];
    const z = (da >= 0.999 && db >= 0.999) ? Z.GONE
      : (da <= 0.05 && db <= 0.05) ? (isRim[i] ? Z.RIM : Z.INTACT) : Z.PARTIAL;
    const r = rows[z];
    r.n++;
    if (mA.changed[i]) r.a++;
    if (mB.changed[i]) r.b++;
    if (!!mA.changed[i] !== !!mB.changed[i]) r.dis++;
  }
  const pct = (x, n) => (n ? +(100 * x / n).toFixed(1) : null);
  return ['GONE', 'RIM', 'PARTIAL', 'INTACT'].map((name, i) => ({
    zone: name, n: rows[i].n,
    aShows: pct(rows[i].a, rows[i].n), bShows: pct(rows[i].b, rows[i].n),
    disagree: pct(rows[i].dis, rows[i].n), disagreeN: rows[i].dis,
  }));
}

/**
 * 🪶 **FLOATING BITS, COUNTED — and it is deliberately a SEPARATE number from the mismatch.**
 *
 * John named two symptoms and they may be two bugs: *"they look very different from each side"*
 * and *"there are some floating bits"*. This one asks: inside the region BOTH grids say is gone,
 * how much material does the wall pair still draw, and how many DETACHED islands of it are there?
 * `drawn` comes from the meshes-off flip, so it is what the PAIR draws and cannot be confused
 * with a picture frame, a pilaster or the room beyond.
 *
 * An island is a 4-connected component of drawn samples every one of whose points is in the GONE
 * zone — i.e. a piece of wall with no standing wall anywhere in it. Components touching the
 * region's border are dropped: those are the crater rim arriving from outside the sample box.
 */
function floaters(pts, depths, drawn) {
  const us = [...new Set(pts.map((p) => p.u))].sort((a, b) => a - b);
  const vs = [...new Set(pts.map((p) => p.v))].sort((a, b) => a - b);
  const ui = new Map(us.map((u, i) => [u, i])), vi = new Map(vs.map((v, i) => [v, i]));
  const W = us.length, H = vs.length;
  const gone = new Uint8Array(W * H), hit = new Uint8Array(W * H), ok = new Uint8Array(W * H);
  for (let i = 0; i < pts.length; i++) {
    const k = vi.get(pts[i].v) * W + ui.get(pts[i].u);
    ok[k] = 1;
    if (depths[i][0] >= 0.999 && depths[i][1] >= 0.999) gone[k] = 1;
    if (drawn.valid[i] && drawn.changed[i]) hit[k] = 1;
  }
  let inGone = 0, drawnInGone = 0;
  for (let k = 0; k < W * H; k++) { if (gone[k]) { inGone++; if (hit[k]) drawnInGone++; } }
  const seenAt = new Uint8Array(W * H);
  const islands = [];
  const stack = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (seenAt[k] || !hit[k] || !gone[k]) continue;
      stack.length = 0; stack.push(k); seenAt[k] = 1;
      let n = 0, edge = false;
      while (stack.length) {
        const c = stack.pop(); n++;
        const cx = c % W, cy = (c / W) | 0;
        if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) edge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (seenAt[nk] || !ok[nk] || !hit[nk] || !gone[nk]) continue;
          seenAt[nk] = 1; stack.push(nk);
        }
      }
      if (!edge && n >= 4) islands.push(n);
    }
  }
  islands.sort((a, b) => b - a);
  return {
    goneSamples: inGone,
    drawnInGonePct: inGone ? +(100 * drawnInGone / inGone).toFixed(2) : null,
    islands: islands.length, biggest: islands[0] ?? 0, islandSamples: islands.reduce((s, v) => s + v, 0),
  };
}

/**
 * 🚨 **WHY A ROOM SHOWS NO DAMAGE AT A POINT — the two answers, told apart.** For every sample
 * the grid says is GONE on both sides but this room does not show as changed: is the pair still
 * drawing something there (a wall that did not break) or is it drawing NOTHING and some other
 * mesh is in front (a picture, a pilaster, a mortar patch)? The meshes-off flip is the only
 * thing that can separate them, and `aperture-1` lost a round to not having it.
 */
function whyHidden(depths, seenMask, drawnMask) {
  let n = 0, panel = 0, other = 0;
  const samples = [];
  for (let i = 0; i < depths.length; i++) {
    if (!seenMask.valid[i] || !drawnMask.valid[i]) continue;
    if (!(depths[i][0] >= 0.999 && depths[i][1] >= 0.999)) continue;
    if (seenMask.changed[i]) continue;          // this room DOES show the damage
    n++;
    if (drawnMask.changed[i]) panel++; else { other++; samples.push(i); }
  }
  // three spread through the run, so one stray texel cannot be the whole identification
  const pick = samples.length
    ? [0.25, 0.5, 0.75].map((f) => samples[Math.floor(samples.length * f)])
    : [];
  return { hidden: n, byThePair: panel, bySomethingElse: other, pick };
}

/** the money picture: both sides' damage silhouettes drawn in the SAME wall coordinates. */
async function maskSheet(page, pts, mA, mB, label) {
  return page.evaluate(([p, a, b, lab]) => {
    const us = [...new Set(p.map((q) => q.u))].sort((x, y) => x - y);
    const vs = [...new Set(p.map((q) => q.v))].sort((x, y) => y - x);
    const ui = new Map(us.map((u, i) => [u, i])), vi = new Map(vs.map((v, i) => [v, i]));
    const px = 4, W = us.length * px, H = vs.length * px;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H * 3 + 66;
    const g = cv.getContext('2d');
    g.fillStyle = '#101216'; g.fillRect(0, 0, cv.width, cv.height);
    const draw = (mask, y0, colour) => {
      g.fillStyle = colour;
      for (let i = 0; i < p.length; i++) {
        if (!mask.valid[i] || !mask.changed[i]) continue;
        g.fillRect(ui.get(p[i].u) * px, y0 + vi.get(p[i].v) * px, px, px);
      }
    };
    g.font = '13px monospace'; g.fillStyle = '#cfd6e0';
    g.fillText(`${lab}  ·  side A (near room), damage it SHOWS`, 6, 14);
    draw(a, 22, '#e8e2d2');
    g.fillStyle = '#cfd6e0';
    g.fillText('side B (far room), damage it SHOWS — same wall points, u mirrored', 6, H + 40);
    draw(b, H + 48, '#e8e2d2');
    g.fillStyle = '#cfd6e0';
    g.fillText('DISAGREEMENT — orange: only A shows it · blue: only B shows it', 6, H * 2 + 66);
    for (let i = 0; i < p.length; i++) {
      if (!a.valid[i] || !b.valid[i]) continue;
      const x = ui.get(p[i].u) * px, y = H * 2 + 74 + vi.get(p[i].v) * px;
      if (a.changed[i] && b.changed[i]) { g.fillStyle = '#2c3a2c'; g.fillRect(x, y, px, px); }
      else if (a.changed[i]) { g.fillStyle = '#ff8a2b'; g.fillRect(x, y, px, px); }
      else if (b.changed[i]) { g.fillStyle = '#3aa0ff'; g.fillRect(x, y, px, px); }
    }
    return cv.toDataURL('image/png');
  }, [pts, mA, mB, label]);
}

// ---------------------------------------------------------------------------------------------
// NODE SIDE
// ---------------------------------------------------------------------------------------------
export default async function twoSided({ page, note, pass, fail, skip, shot, snap, SHOTDIR }) {
  const OUT = path.join(SHOTDIR, '..', 'twoside');
  await mkdir(OUT, { recursive: true });
  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };
  const writePng = async (name, dataUrl) =>
    writeFile(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await wait(8);
  await page.evaluate(HELPERS);

  // freeze the hunter so nothing walks into a capture
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    e.hunter.update = () => {};
    if (e.room?.spawn?.hunter) e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
  });

  const cen = await page.evaluate(() => window.__ts.census());
  note(`build: dig mode "${cen.mode}" · seed "${cen.seed}"`);
  if (cen.mode !== 'free') { fail('a free-dig build', `dig mode is "${cen.mode}"`); return; }

  // ------------------------------------------------------------------ pick the pair
  const pairs = await page.evaluate(() => window.__ts.pairs());
  if (!pairs.length) { fail('a twinned free face pair exists', 'none found'); return; }
  for (const p of pairs) {
    note(`   pair ${p.a} | ${p.b}  rooms ${p.roomA}/${p.roomB}  ${p.w}x${p.h} m  `
      + `grid ${p.cols}x${p.rows}  barrier-free cells ${p.freeCells}`);
  }
  /**
   * ⚠️ **THE PAIR IS SELECTABLE AND THAT IS NOT A CONVENIENCE — `--q "pair=gal_svc.0"`.**
   * The first run of this file auto-picked `f.gal_svc.0` (most barrier-free cells) and the
   * gallery side of that wall has a **framed portrait hanging over the dig face**, which reads
   * as a solid rectangular block of "this room shows no damage" and has nothing to do with how
   * the wall renders. A critic comparing two builds must be able to name the wall.
   */
  const want = await page.evaluate(() => new URLSearchParams(location.search).get('pair'));
  const P = want
    ? pairs.find((p) => `${p.edge}.${p.seg}` === want || p.a === want)
    : [...pairs].sort((x, y) => (y.freeCells - x.freeCells) || (y.w - x.w))[0];
  if (!P) { fail('the requested pair exists', `--q "pair=${want}" matched none of the 14`); return; }
  pass('a twinned free face pair exists',
    `${pairs.length} pairs; using ${P.a} | ${P.b}${want ? ' (asked for by --q pair=)' : ' (auto: most barrier-free cells)'}`);

  const T = await page.evaluate((id) => window.__ts.target(id), P.a);
  note(`target on ${P.a}: u ${T.u} v ${T.v} (${T.offCentre >= 0 ? '+' : ''}${T.offCentre} off centre) · `
    + `${T.freeCells} barrier-free cells`);
  if (Math.abs(T.offCentre) < 0.02) {
    note('⚠️ the crater is within 2% of the face centre — C3 (the mirror control) is weak on this seed');
  }

  const lat = await page.evaluate(([a, b, cu, r]) => window.__ts.lattice(a, b, cu, r),
    [P.a, P.b, T.u, REGION]);
  const pts = await page.evaluate(() => window.__ts._pts.map((p) => ({ u: p.u, v: p.v })));
  note(`lattice: ${lat.n} points on the band's centre plane, u ${lat.u0}..${lat.u1}, `
    + `v ${REGION.v0}..${REGION.v1} m, ${REGION.step * 100} cm pitch`);

  await page.evaluate(() => window.__ts.hideBodies(true));

  // ------------------------------------------------------------------ one arm's capture block
  /** park (live) → settle → hold → project → two frames → release. `still.mjs`'s order. */
  /**
   * 🚨 **THE CAMERA'S `u` MUST BE MIRRORED FOR THE `b` FACE, AND THIS FILE DID NOT DO IT — FOUND
   * BY `slab-1`, 2026-08-10, ON A 15.40 m FACE.**
   *
   * `park()` calls `p.pointAt(cu, cv)` on the panel it is given, and the two faces of one band run
   * in OPPOSITE directions — which this file's own header states, and which the sample lattice
   * already obeys (`B.pointAt(1 - u, vv)` at the `lattice` call). Passing face A's `u` to face B
   * therefore parks the B camera at the MIRROR of the crater along the wall: the error is
   * `|1 − 2u| × faceWidth`, and it points at the wrong part of the same wall.
   *
   * ⚠️ **IT IS INVISIBLE ON EVERY SPAN THIS FILE WAS WRITTEN AGAINST AND FATAL ON A SLAB.** On
   * `f.svc_w.0` at its authored 2.96 m the two cameras landed at z −23.19 and −21.85 — 1.34 m
   * apart, and at a 2.9 m standoff the region is still in frame, so it read as a slightly worse
   * cross-hold floor and nothing else. On the same id at 15.40 m they land at −22.87 and −9.73,
   * **13.14 m apart, and side B framed 0 of 7885 sample points** — every downstream number went
   * `null` and the file correctly refused to report. The bug scales with face width, so it was
   * always going to surface the first time somebody made a face long.
   *
   * 🎯 **The two arms still get identical treatment**, which is the property the A/B rests on:
   * both cameras now stand on the same physical point of the wall, from their own rooms.
   */
  const camU = (faceId) => (faceId === P.b ? 1 - T.u : T.u);
  const capture = async (faceId, tag, settle = 45) => {
    const parked = await page.evaluate(([id, cu, cv]) => window.__ts.park(id, cu, cv),
      [faceId, camU(faceId), T.v]);
    await wait(settle);
    const pinned = await hold(page);
    await wait(6);
    const xy = await page.evaluate(() => window.__ts.project());
    const one = await snap(`${tag}-1`);
    await wait(8);
    const two = await snap(`${tag}-2`);
    // the pair's own meshes off, in the SAME hold — see `showPanels`
    await page.evaluate(() => window.__ts.showPanels(false));
    await wait(5);
    const off = await snap(`${tag}-off`);
    await page.evaluate(() => window.__ts.showPanels(true));
    await release(page);
    note(`   ${tag}: in ${parked.room} (wanted ${parked.wanted}) at ${parked.at.join(',')} · `
      + `${xy.onScreen}/${lat.n} points on screen · scale ${pinned.pinned?.renderScale}`);
    return { one, two, off, xy: xy.xy, parked, onScreen: xy.onScreen };
  };

  // ------------------------------------------------------------------ 1. pristine, both rooms
  const A0 = await capture(P.a, '2side-A-pristine');
  const B0 = await capture(P.b, '2side-B-pristine');
  if (!A0.one || !A0.two || !B0.one || !B0.two) {
    fail('captures came back', 'a screenshot was null'); return;
  }
  if (A0.onScreen < lat.n * 0.9 || B0.onScreen < lat.n * 0.9) {
    fail('the framing holds the whole sample region',
      `A ${A0.onScreen}/${lat.n} · B ${B0.onScreen}/${lat.n} on screen`);
  } else pass('the framing holds the whole sample region', `A ${A0.onScreen} · B ${B0.onScreen} of ${lat.n}`);

  // ---- C1: the still floor, inside one hold ----------------------------------------------
  const floorA = await changeMask(page, A0.one, A0.two, A0.xy, A0.xy, CHANGE);
  const floorB = await changeMask(page, B0.one, B0.two, B0.xy, B0.xy, CHANGE);
  note(`C1 still floor: A ${floorA.changedPct}% (|Δluma| ${floorA.meanAbsLuma}) · `
    + `B ${floorB.changedPct}% (${floorB.meanAbsLuma})`);
  const FLOOR = Math.max(floorA.changedPct ?? 99, floorB.changedPct ?? 99);
  if (FLOOR <= 0.05) pass('C1 the still floor is zero', `worst ${FLOOR}% of sampled points`);
  else fail('C1 the still floor is zero',
    `worst ${FLOOR}% — every number below is sitting on that, so none of them mean anything`);

  // ---- C2: the CROSS-HOLD floor — the same camera, re-parked, nothing dug ------------------
  const A0b = await capture(P.a, '2side-A-pristine-again');
  const xhold = await changeMask(page, A0.one, A0b.one, A0.xy, A0b.xy, CHANGE);
  note(`C2 cross-hold floor: ${xhold.changedPct}% (|Δluma| ${xhold.meanAbsLuma})`);
  const XFLOOR = xhold.changedPct ?? 99;
  if (XFLOOR <= 1.0) pass('C2 the cross-hold floor is small', `${XFLOOR}% re-parking the same camera`);
  else fail('C2 the cross-hold floor is small',
    `${XFLOOR}% — the before/after pairs below span two holds, so this is their real floor`);

  // ------------------------------------------------------------------ 2. dig ONE side
  const before = {
    a: await page.evaluate((id) => window.__ts.faceState(id), P.a),
    b: await page.evaluate((id) => window.__ts.faceState(id), P.b),
  };
  note(`before: A ${JSON.stringify(before.a)}`);
  note(`before: B ${JSON.stringify(before.b)}`);

  const BLOWS = 26;
  const dug = await page.evaluate(([id, cu, cv, n]) => window.__ts.dig(id, cu, cv, n),
    [P.a, T.u, T.v, BLOWS]);
  await wait(10);
  const mid = {
    a: await page.evaluate((id) => window.__ts.faceState(id), P.a),
    b: await page.evaluate((id) => window.__ts.faceState(id), P.b),
  };
  note(`after ${dug} blows on ${P.a} ONLY:`);
  note(`   A ${JSON.stringify(mid.a)}`);
  note(`   B ${JSON.stringify(mid.b)}`);

  const A1 = await capture(P.a, '2side-A-dug');
  const B1 = await capture(P.b, '2side-B-dug');

  const mA = await changeMask(page, A0.one, A1.one, A0.xy, A1.xy, CHANGE);
  const mB = await changeMask(page, B0.one, B1.one, B0.xy, B1.xy, CHANGE);
  const seen = seenDelta(mA, mB);
  const grid = await page.evaluate(([a, b, e]) => window.__ts.gridDelta(a, b, e), [P.a, P.b, GRID_EPS]);
  const gridNoFlip = await page.evaluate(([a, b, e]) => window.__ts.gridDelta(a, b, e, false),
    [P.a, P.b, GRID_EPS]);

  note('');
  note(`🎯 ΔGRID  ${grid.disagree}%  of ${grid.cells} cells differ by > ${GRID_EPS} depth `
    + `(mean |Δ| ${grid.meanAbs}) — A deeper on ${grid.aDeeper}, B deeper on ${grid.bDeeper}`);
  note(`🎯 ΔSEEN  ${seen.delta}%  of the damage either room shows is shown by only ONE of them `
    + `(A only ${seen.aOnly}, B only ${seen.bOnly}, both ${seen.both}, of ${seen.samples} points)`);
  note(`   side A shows damage at ${mA.changedPct}% of sampled wall points; side B at ${mB.changedPct}%`);
  const depths = await page.evaluate(() => window.__ts.depthsAt());
  const zones = zoneTable(pts, depths, mA, mB);
  const G0 = zones[0];
  // what the PAIR itself draws, from each room — the meshes-off flip taken inside the same hold
  const dA = await changeMask(page, A1.one, A1.off, A1.xy, A1.xy, CHANGE);
  const dB = await changeMask(page, B1.one, B1.off, B1.xy, B1.xy, CHANGE);
  const fA = floaters(pts, depths, dA), fB = floaters(pts, depths, dB);
  const wA = whyHidden(depths, mA, dA), wB = whyHidden(depths, mB, dB);
  for (const z of zones) {
    note(`   zone ${z.zone.padEnd(7)} ${String(z.n).padStart(5)} pts · A shows ${z.aShows}% · `
      + `B shows ${z.bShows}% · they disagree on ${z.disagree}% (${z.disagreeN} pts)`);
  }
  note(`🪶 FLOATERS  A: the pair draws material at ${fA.drawnInGonePct}% of its ${fA.goneSamples} `
    + `through points, in ${fA.islands} DETACHED islands (biggest ${fA.biggest} pts)`);
  note(`🪶 FLOATERS  B: the pair draws material at ${fB.drawnInGonePct}% of its ${fB.goneSamples} `
    + `through points, in ${fB.islands} DETACHED islands (biggest ${fB.biggest} pts)`);
  note(`🚨 WHY HIDDEN  A: ${wA.hidden} through points ${P.roomA} does not show as damaged — `
    + `${wA.byThePair} still drawn BY THE WALL PAIR, ${wA.bySomethingElse} by SOMETHING ELSE IN FRONT`);
  note(`🚨 WHY HIDDEN  B: ${wB.hidden} through points ${P.roomB} does not show as damaged — `
    + `${wB.byThePair} still drawn BY THE WALL PAIR, ${wB.bySomethingElse} by SOMETHING ELSE IN FRONT`);
  // 🚨 …and NAME it. A count of "something else is in front" that cannot say what is in front is
  // half an answer, and this project files that defect class more than any other.
  for (const [side, w, faceId] of [['A', wA, P.a], ['B', wB, P.b]]) {
    if (!w.pick.length) continue;
    // same mirror as `capture()` — see `camU`.
    await page.evaluate(([id, cu, cv]) => window.__ts.park(id, cu, cv), [faceId, camU(faceId), T.v]);
    await wait(25);
    for (const i of w.pick) {
      const r = await page.evaluate((k) => window.__ts.nameAt(k), i);
      if (!r?.hits) continue;
      const line = r.hits.slice(0, 4)
        .map((h) => `${h.d}m ${h.owner || h.name}${h.mine ? ' [the pair]' : ''} (${h.mat})`)
        .join('  ·  ');
      note(`   in front of ${side} at u ${r.u} v ${r.v}: ${line}`);
    }
  }
  note('');

  if (seen.delta == null || grid.disagree == null) {
    fail('the two sides can be compared', 'no overlapping valid samples');
  } else {
    pass('the two sides can be compared',
      `ΔGRID ${grid.disagree}% · ΔSEEN ${seen.delta}% · floors ${FLOOR}%/${XFLOOR}%`);
  }

  // ---- C3: the mirror is the right way round ---------------------------------------------
  note(`C3 mirror control: ΔGRID with the u-flip ${grid.disagree}% · WITHOUT it ${gridNoFlip.disagree}%`);
  if (gridNoFlip.disagree > grid.disagree + 0.05) {
    pass('C3 the u-mirror is the right way round',
      `unmirrored reads ${gridNoFlip.disagree}% against ${grid.disagree}%`);
  } else {
    fail('C3 the u-mirror is the right way round',
      `unmirrored reads ${gridNoFlip.disagree}% against ${grid.disagree}% — the flip is doing nothing, `
      + `so either it is dead or the crater is too symmetric for this control to bite`);
  }

  await writePng('two-sided-masks-dug.png',
    await maskSheet(page, pts, mA, mB, `${P.a} | ${P.b} — ${dug} blows on A only`));

  // ------------------------------------------------------------------ 3. C4 — THE DESYNC ARM
  //
  // 🚨 THE CONTROL THAT MUST FAIL, AND IT IS A REINTRODUCTION RATHER THAN A NUDGE. See
  // `__ts.desync`: the pre-2026-08-09 far side is put back for two frames and both numbers have
  // to jump. If they do not, this file is a result-shaped output.
  const ds = await page.evaluate(() => window.__ts.desync(true));
  const Bx = await capture(P.b, '2side-B-DESYNC-control');
  const gridX = await page.evaluate(([a, b, e]) => window.__ts.gridDelta(a, b, e), [P.a, P.b, GRID_EPS]);
  const mBx = await changeMask(page, B0.one, Bx.one, B0.xy, Bx.xy, CHANGE);
  const depthsX = await page.evaluate(() => window.__ts.depthsAt());
  const zonesX = zoneTable(pts, depthsX, mA, mBx);
  await page.evaluate(() => window.__ts.desync(false));
  await wait(6);
  const gridBack = await page.evaluate(([a, b, e]) => window.__ts.gridDelta(a, b, e), [P.a, P.b, GRID_EPS]);
  note(`C4 desync control: refilled ${ds.filled} through cells on ${P.b} (rows 0..${ds.rows}) · `
    + `ΔGRID ${grid.disagree}% -> ${gridX.disagree}% -> ${gridBack.disagree}% (restored) · `
    + `ΔSEEN ${seen.delta}% -> ${seenDelta(mA, mBx).delta}%`);
  const zX = zonesX[0];
  note(`   under the desync, ${P.roomB} shows the hole at ${zX.bShows}% of ${zX.n} through points `
    + `(was ${G0.bShows}%)`);
  const sawIt = gridX.disagree > grid.disagree + 1.0 && (zX.bShows ?? 100) < (G0.bShows ?? 0) - 1.0;
  if (sawIt) {
    pass('C4 the instrument can see a difference',
      `putting the pre-fix far side back took ΔGRID ${grid.disagree}->${gridX.disagree}% and `
      + `${P.roomB}'s view of the hole ${G0.bShows}->${zX.bShows}%`);
  } else {
    fail('C4 the instrument can see a difference',
      `ΔGRID ${grid.disagree}->${gridX.disagree}% and ${P.roomB} showed ${G0.bShows}->${zX.bShows}% — `
      + `the reintroduced defect did not move either number, so neither number is measuring it`);
  }
  if (Math.abs(gridBack.disagree - grid.disagree) > 1e-6) {
    fail('C4 undoes itself exactly', `ΔGRID came back at ${gridBack.disagree}%, not ${grid.disagree}%`);
  } else pass('C4 undoes itself exactly', `ΔGRID back to ${gridBack.disagree}%`);

  // ------------------------------------------------------------------ 4. dig A FURTHER
  const MORE = 22;
  const dug2 = await page.evaluate(([id, cu, cv, n]) => window.__ts.dig(id, cu, cv, n, 0.95, 0.30, 2.20),
    [P.a, T.u, T.v, MORE]);
  await wait(10);
  const A2 = await capture(P.a, '2side-A-dug-more');
  const B2 = await capture(P.b, '2side-B-dug-more');
  const mA2 = await changeMask(page, A0.one, A2.one, A0.xy, A2.xy, CHANGE);
  const mB2 = await changeMask(page, B0.one, B2.one, B0.xy, B2.xy, CHANGE);
  const seen2 = seenDelta(mA2, mB2);
  const grid2 = await page.evaluate(([a, b, e]) => window.__ts.gridDelta(a, b, e), [P.a, P.b, GRID_EPS]);
  const late = {
    a: await page.evaluate((id) => window.__ts.faceState(id), P.a),
    b: await page.evaluate((id) => window.__ts.faceState(id), P.b),
  };
  note(`C4 after ${dug2} MORE blows on ${P.a} only:`);
  note(`   A ${JSON.stringify(late.a)}`);
  note(`   B ${JSON.stringify(late.b)}`);
  note(`   ΔGRID ${grid.disagree}% -> ${grid2.disagree}%  ·  ΔSEEN ${seen.delta}% -> ${seen2.delta}%`);
  const depths2 = await page.evaluate(() => window.__ts.depthsAt());
  for (const z of zoneTable(pts, depths2, mA2, mB2)) {
    note(`   zone ${z.zone.padEnd(7)} ${String(z.n).padStart(5)} pts · A shows ${z.aShows}% · `
      + `B shows ${z.bShows}% · they disagree on ${z.disagree}% (${z.disagreeN} pts)`);
  }
  for (const [n, buf] of [['A0', A0.one], ['B0', B0.one], ['A1', A1.one], ['B1', B1.one],
    ['A2', A2.one], ['B2', B2.one]]) {
    if (buf) await writeFile(path.join(OUT, `two-sided-${n}.png`), buf);
  }

  /**
   * ⚠️ **REPORTED, NOT GATED, AND THE REASON IS A CONTROL THAT FAILED ON A GOOD TREE.** This arm
   * was C4's first form — "dig one side further and the number must rise". On a wall where
   * `_couple()` is doing its job ΔGRID sits at the two-cell floor and a bigger hole cannot raise
   * it: `f.bal_east.1` read **0.208% -> 0.104%**, i.e. the control failed for being right. The
   * gate is the desync above, which is state independent; this is here because it is the shape
   * of the state John plays in and because the captures are the deliverable.
   */
  const grew = grid2.disagree - grid.disagree;
  note(`   (reported, not gated) ΔGRID moved ${grew >= 0 ? '+' : ''}${grew.toFixed(3)} pp on a `
    + `${dug2}-blow widening; ΔSEEN ${seen.delta}% -> ${seen2.delta}%`);

  await writePng('two-sided-masks-dug-more.png',
    await maskSheet(page, pts, mA2, mB2, `${P.a} | ${P.b} — ${dug + dug2} blows on A only`));

  // ------------------------------------------------------------------ 4. the contact sheet
  const sheet = await page.evaluate(async ([shots, lines]) => {
    const load = async (d) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${d}`; });
      return img;
    };
    const imgs = [];
    for (const s of shots) imgs.push({ label: s.label, img: await load(s.png) });
    const cw = 480, ch = Math.round(480 * 720 / 1280);
    const cols = 2, rows = Math.ceil(imgs.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * cw + 12; cv.height = rows * (ch + 22) + 26 + lines.length * 16;
    const g = cv.getContext('2d');
    g.fillStyle = '#0d0f13'; g.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((it, i) => {
      const x = (i % cols) * cw + 6, y = Math.floor(i / cols) * (ch + 22) + 20;
      g.drawImage(it.img, x, y, cw, ch);
      g.fillStyle = '#cfd6e0'; g.font = '13px monospace';
      g.fillText(it.label, x + 2, y - 5);
    });
    g.font = '14px monospace';
    lines.forEach((l, i) => {
      g.fillStyle = l.startsWith('ΔG') || l.startsWith('ΔS') ? '#ffd479' : '#cfd6e0';
      g.fillText(l, 8, rows * (ch + 22) + 40 + i * 16);
    });
    return cv.toDataURL('image/png');
  }, [[
    { label: 'A · near room · pristine', png: A0.one.toString('base64') },
    { label: 'B · far room · pristine', png: B0.one.toString('base64') },
    { label: `A · after ${dug} blows`, png: A1.one.toString('base64') },
    { label: 'B · the SAME wall, other room', png: B1.one.toString('base64') },
    { label: `A · after ${dug + dug2} blows`, png: A2.one.toString('base64') },
    { label: 'B · the SAME wall, other room', png: B2.one.toString('base64') },
  ], [
    `${P.a}  |  ${P.b}      rooms ${P.roomA} / ${P.roomB}      seed ${cen.seed}`,
    `ΔGRID  ${grid.disagree}%  ->  ${grid2.disagree}%   (cells differing by > ${GRID_EPS} depth, u mirrored)`,
    `ΔSEEN  ${seen.delta}%  ->  ${seen2.delta}%   (damage shown by only one of the two rooms)`,
    `floors: still ${FLOOR}%   cross-hold ${XFLOOR}%   ·  every blow landed on side A only`,
  ]]);
  await writePng('two-sided-contact.png', sheet);
  note(`contact sheet + masks -> ${OUT}`);

  await page.evaluate(() => window.__ts.hideBodies(false));

  // ------------------------------------------------------------------ 5. the standing claim
  //
  // Not a control — the REPORTED BAR. A critic reads this line; a builder has to move it.
  const BAR = { grid: 5.0, seen: 20.0 };
  if (grid.disagree <= BAR.grid) pass('the two sides agree on the GRID', `ΔGRID ${grid.disagree}% ≤ ${BAR.grid}%`);
  else fail('the two sides agree on the GRID', `ΔGRID ${grid.disagree}% > ${BAR.grid}% — `
    + `${grid.aDeeper} cells are deeper on A than on B and ${grid.bDeeper} the other way`);

  if (seen.delta <= BAR.seen) pass('the two sides SHOW the same damage', `ΔSEEN ${seen.delta}% ≤ ${BAR.seen}%`);
  else fail('the two sides SHOW the same damage', `ΔSEEN ${seen.delta}% > ${BAR.seen}% — `
    + `${seen.aOnly} wall points show damage only from ${P.roomA}, ${seen.bOnly} only from ${P.roomB}`);

  /**
   * 🎯 **THE TIGHTEST CLAIM IN THE FILE, AND THE ONE A BUILDER SHOULD DRIVE.** Restricted to the
   * points where BOTH grids say the material is gone: a room that does not show a change there is
   * drawing wall that is not there. It is immune to the ambient-light change a new hole makes to
   * the rest of the room, which saturates the whole-region figure above.
   */
  /**
   * 🪶 **A SEPARATE GATE FOR A SEPARATE SYMPTOM.** ⚠️ Do not merge this into the mismatch: a
   * detached island can exist with the two sides in perfect agreement, and the two sides can
   * disagree with no island anywhere. 12 samples at the 2.5 cm lattice is ~75 cm² of wall
   * standing in mid-air with nothing holding it — visible, and not a stray texel.
   */
  const worstIsland = Math.max(fA.biggest, fB.biggest);
  if (worstIsland < 12) pass('no detached island of wall stands inside the hole',
    `A ${fA.islands} islands (biggest ${fA.biggest}) · B ${fB.islands} (biggest ${fB.biggest})`);
  else fail('no detached island of wall stands inside the hole',
    `biggest island ${worstIsland} samples ≈ ${(worstIsland * REGION.step * REGION.step * 1e4).toFixed(0)} cm² `
    + `of wall drawn where BOTH grids say the material is gone — A ${fA.islands} islands, B ${fB.islands}`);

  const G = G0;
  if (G.n < 200) skip('both rooms SHOW the hole they both have', `only ${G.n} through points sampled`);
  else if (G.disagree <= 10) pass('both rooms SHOW the hole they both have',
    `ΔGONE ${G.disagree}% (A shows ${G.aShows}%, B shows ${G.bShows}% of ${G.n} through points)`);
  else fail('both rooms SHOW the hole they both have',
    `ΔGONE ${G.disagree}% of ${G.n} points the grid says are GONE on BOTH sides — `
    + `${P.roomA} shows damage at ${G.aShows}% of them and ${P.roomB} at only ${G.bShows}%`);
}
