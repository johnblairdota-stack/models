import * as THREE from 'three';
import {
  windowBay, pilaster, cofferedCeiling, dadoProfile, corniceProfile, extrudeProfile,
} from './kit.js';
import { portraitWall, urnOnPedestal, consoleTable } from './props.js';

/**
 * THE LONG GALLERY'S ARCHITECTURAL ORDER — ONE SOURCE OF TRUTH.
 *
 * John, 2026-08-08: *"I just want the game to progress from the assets we made for the 3 rooms
 * we had in the art and that way its set up to reach for the art bar instead of progressing in
 * the original slice rooms."*
 *
 * `estate-spike-1` verified the complaint in code and priced the fix: `views/game.js` imported
 * none of the three showcase room modules, `src/game/room.js` used exactly one symbol from the
 * whole estate kit (`GeoBin`), and every art score on the board — including `room.ballroom`
 * PASS 85 — is for a frame no player ever sees. This file is the half of the fix that makes
 * the ARCHITECTURE shared: the clerestory order, the string course, the pilaster rhythm, the
 * transverse arch, the coffered ceiling, the portraits and the dressing, authored ONCE and
 * emitted into whichever `GeoBin` the caller owns.
 *
 * ⚠️ **THE SPIKE'S `geo` ARM WAS ADDITIVE AND THIS IS NOT.** The spike hung its own group off
 * the scene with its own bin, which is why it cost +14 draw calls and why its pictures show
 * the expected clash (clerestory heads through the cornice, frames proud of the wall). It was
 * a price probe. Here the geometry goes into the CALLER'S bin under the CALLER'S keys, so the
 * shared buckets merge with the walls that are already there and the marginal draw-call cost
 * is the number of genuinely NEW material keys — which for the game is four.
 *
 * ---------------------------------------------------------------------------
 * HOW IT STAYS BIT-IDENTICAL FOR `views/room-gallery.js` (score 75, must not regress)
 *
 * Every dimension is a PARAMETER, in the caller's own coordinates, and the showcase passes the
 * literals it already had. `x0/x1/z0/z1/h` are absolute in the caller's frame; `base` and
 * `remap` are both optional and both default to the identity behaviour. With `base = null` and
 * `remap = null` the proxy below is a pass-through and every expression in this file reduces,
 * term for term, to the expression `room-gallery.js` used to evaluate inline:
 *
 *     showcase        x0 = -G.w/2   x1 = G.w/2   z0 = Z0   z1 = Z1   h = G.h (6.4)
 *     game            x0 = -WID/2   x1 = WID/2   z0 = -LEN/2  z1 = LEN/2  h = 5.60, base = the
 *                     group transform (rotY + centre), because the game's gallery runs down X
 *
 * ⚠️ **THE CLERESTORY SET IS PASSED IN, NOT DERIVED, WHEN THE CALLER HAS ONE.** Deriving it
 * from the storey height would have moved the showcase's `sill 4.00 / spring 4.72 / head 5.53`
 * by a few millimetres of float, and "a few millimetres" is exactly the size of a change that
 * a grade gate notices and nobody can explain a round later. The game has no such history, so
 * it takes the derived form — which solves the clerestory against the CORNICE it has to clear
 * rather than scaling a number that was solved against a different one.
 */

// ---------------------------------------------------------------------------
// The proxy: one place that applies the caller's frame and the caller's key names.
// ---------------------------------------------------------------------------

/**
 * A `GeoBin`-shaped wrapper that pre-multiplies `base` and renames keys through `remap`
 * before forwarding to the real bin.
 *
 * ⚠️ **WHY A PROXY AND NOT A `base` ARGUMENT ON EVERY BUILDER.** `windowBay`, `pilaster`,
 * `cofferedCeiling`, `portraitWall`, `urnOnPedestal` and `consoleTable` all take `x/y/z/rotY`
 * and compose their own matrix internally, and four of them are shared with pieces this slice
 * must not touch. Threading a frame through six signatures means six chances to regress
 * `room.ballroom`, `light.shaft` and `room.study`. Wrapping the SINK instead touches nothing.
 *
 * ⚠️ **`uv` IS APPLIED AFTER THE MATRIX AND THAT IS DELIBERATE.** `GeoBin.add` world-projects
 * UVs at the given scale after the transform, so under `base` the projection happens in the
 * caller's WORLD space — which is what `room.js` already does for every wall in the house, so
 * a mitred moulding lands at the same texture scale as the wall it sits on. With `base = null`
 * nothing moves and the showcase's UVs are unchanged.
 */
export class FramedBin {
  constructor(bin, base = null, remap = null) {
    this.bin = bin;
    this.base = base ? base.clone() : null;
    this.remap = remap;
    // `room.js` reads `bin.bins` to record the vertex range of a trackable box; nothing in
    // this file is trackable, but the field is forwarded so the shape stays honest.
    this.bins = bin.bins;
  }

  get tris() { return this.bin.tris; }

  key(k) { return this.remap?.[k] ?? k; }

  add(key, geo, m = null, uv = null) {
    let mm = m;
    if (this.base) {
      mm = m instanceof THREE.Matrix4 ? this.base.clone().multiply(m) : this.base.clone();
    }
    this.bin.add(this.key(key), geo, mm, uv);
    return this;
  }

  box(key, w, h, d, x, y, z, uv = 1, rot = null) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
    m.setPosition(x, y, z);
    this.add(key, g, m, uv);
    g.dispose();
    return this;
  }
}

// ---------------------------------------------------------------------------
// The plan: every number the order needs, with no THREE in it.
// ---------------------------------------------------------------------------

/**
 * Resolve the gallery's dimensions into the set of positions the order stands on.
 *
 * Separated from the geometry because `room.js` needs the clerestory's x positions BEFORE it
 * builds a wall (they are holes in it), and `views/game.js` needs the sconce and picture-light
 * anchors AFTER, to hang the fixtures on. Two consumers, one arithmetic.
 *
 * @param o.x0,o.x1   the SHORT axis (room width) in the caller's frame
 * @param o.z0,o.z1   the LONG axis (27 m in both rooms)
 * @param o.h         storey height
 * @param o.cl        explicit clerestory set — the showcase passes its own; omit to derive
 * @param o.fieldTop  explicit head of the panelled storey; omit to derive from `cl.sill`
 * @param o.corniceH  the cornice the clerestory has to clear (the game's is 0.46)
 */
export function galleryPlan(o = {}) {
  const x0 = o.x0 ?? -3.6, x1 = o.x1 ?? 3.6;
  const z0 = o.z0 ?? -20, z1 = o.z1 ?? 7;
  const h = o.h ?? 6.4;
  const len = z1 - z0;
  const wid = x1 - x0;

  /**
   * ⚠️ **THE DERIVED CLERESTORY IS SOLVED AGAINST THE CORNICE, NOT SCALED FROM THE SHOWCASE.**
   *
   * `estate-spike-1` scaled the showcase's set by `5.60/6.40` and its own capture shows the
   * result: the arch heads run into the game's cornice band. The spike said so itself — that
   * arm was a price probe, not the refactor. The arithmetic that actually has to hold is
   *
   *     archivolt top = spring + w/2 + 0.16   must clear   h - corniceH   by a real margin
   *
   * so `spring` is solved from the cornice and the sill follows the showcase's own
   * sill:spring PROPORTION (4.00 : 4.72 = 0.847), which is the part that makes the band read
   * as a second storey rather than as a row of holes.
   */
  const corniceH = o.corniceH ?? 0.46;
  const clW = o.clW ?? 1.62;
  let cl = o.cl;
  if (!cl) {
    const spring = (h - corniceH) - 0.28 - clW / 2 - 0.12;
    const sill = spring * (4.00 / 4.72);
    cl = {
      w: clW, sill, spring, head: spring + clW / 2,
      pitch: o.clPitch ?? 3.7, n: o.clN ?? 7, z0: z1 - 2.0,
    };
  }
  const fieldTop = o.fieldTop ?? (cl.sill - 0.05);

  const clZ = [];
  for (let i = 0; i < cl.n; i++) clZ.push(cl.z0 - i * cl.pitch);

  // the pilaster rhythm: 10 piers over the run, i.e. 9 bays — the showcase's own number, and
  // the reason it reads at 3.02 m against the clerestory's 3.7
  const pilasterZ = [];
  for (let i = 0; i <= (o.bays ?? 9); i++) pilasterZ.push(z1 - (i * len) / (o.bays ?? 9));

  /**
   * The transverse arch: the one large-scale event that divides a 27 m corridor into two
   * unequal rooms. The showcase puts it at -8.6 in ITS frame, which is 0.578 of the run from
   * the entrance end; the ratio travels, the literal does not.
   */
  const archZ = o.archZ ?? (z1 - len * 0.578);

  // portraits: `n` a side, at the showcase's 2.9 m pitch, starting 2.6 m in from the entrance
  /**
   * ⚠️ **SCALED BY THE STOREY, AND THE FIRST BUILD OF THIS DID NOT SCALE THEM.** The showcase's
   * largest portrait tops out at 2.60 + 2.10/2 = 3.65 under a string course at 3.95 — a 0.30 m
   * clearance. Dropped straight into a 5.60 m storey whose string course lands at 3.28, the same
   * frame stands 0.37 m THROUGH the clerestory sill, and the first capture of this port shows
   * exactly that. The RATIO travels; the literal does not. `fieldTop / 3.95` is 1.0 for the
   * showcase, so its frames are unchanged to the last bit.
   */
  const ps = o.portraitScale ?? (fieldTop / 3.95);
  const nPort = o.portraits ?? 6;
  const portraits = [];
  for (let i = 0; i < nPort; i++) {
    const z = z1 - 2.6 - i * 2.9;
    const big = i % 3 === 1;
    portraits.push({
      x: z, y: (big ? 2.60 : 2.40) * ps, w: (big ? 1.60 : 1.18) * ps,
      h: (big ? 2.10 : 1.58) * ps, cell: i % 8,
    });
  }

  // sconces: 5 pairs at 2.9 m, offset half a pitch from the portraits so the two rhythms
  // interleave rather than stack
  const nScon = o.sconces ?? 5;
  const sconceZ = [];
  for (let i = 0; i < nScon; i++) sconceZ.push(z1 - 4.0 - i * 2.9);

  return {
    x0, x1, z0, z1, h, len, wid, cl, clZ, fieldTop, corniceH,
    pilasterZ, archZ, portraits, sconceZ,
    urnZ: o.urnZ ?? [-2.0, -7.6],
    consoleZ: o.consoleZ ?? 2.0,
    /**
     * The openings the CALLER has to cut in its own wall, as `{u, w, y0, y1}` in the long
     * axis. `room.js` feeds these straight into `buildWall`'s band.
     */
    openings: clZ.map((z) => ({ u: z, w: cl.w, y0: cl.sill, y1: cl.head + 0.04 })),
  };
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

/**
 * Emit the gallery order into `bin`.
 *
 * @param o.plan    a `galleryPlan()` result (or the arguments for one)
 * @param o.base    THREE.Matrix4 applied to everything, or null for "already in this frame"
 * @param o.remap   { kitKey: callerKey } bucket renaming, or null
 * @param o.material  { portrait } — the only material this file needs by reference, because
 *                    the portrait canvases are one merged mesh rather than a bin bucket
 * @param o.parts   which pieces to emit; every one defaults ON
 * @returns { meshes: THREE.Mesh[] } — objects the caller must parent itself
 */
export function galleryOrder(bin, o = {}) {
  const P = o.plan ?? galleryPlan(o);
  const B = new FramedBin(bin, o.base ?? null, o.remap ?? null);
  const parts = { clerestory: true, stringCourse: true, pilasters: true, arch: true,
    ceiling: true, portraits: true, dressing: true, ...(o.parts ?? {}) };
  const { x0, x1, z0, z1, h, len, wid, cl, clZ, fieldTop } = P;
  const meshes = [];

  // ---- the clerestory order: fourteen lights, seven a side -----------------
  // The piece's second architectural rhythm (3.7 m against the pilasters' 3.02) and the thing
  // that carries the top of its luminance range. `medallion: 0` on the material is what
  // `estate-owner-9` fixed; nothing here re-authors it.
  if (parts.clerestory) {
    /**
     * 🚨 **`t` IS THE WALL THE BAY IS SET INTO, AND GETTING IT WRONG BURIES THE GLASS.**
     *
     * `windowBay` places its glass sheet at `-t * 0.55` — i.e. 55% of the way THROUGH the
     * masonry — and defaults `t` to `WALL_T` (0.30). The showcase's walls are 0.30 and it is
     * right there. The game's gallery/study boundary is a 0.15 SKIN (each space draws its own
     * half of a shared 0.30 band), so a 0.30-deep bay puts the glazing 0.165 m back: past the
     * far face of the skin, behind the neighbour's own skin, invisible. The first capture of
     * this port shows exactly that — arched openings with a dead dark pane in them, on a
     * material whose whole job is to be the brightest thing in the room.
     *
     * That is HANDOFF's dominant defect class, and it is worth restating why it is dominant:
     * the geometry was correct, the material was correct, the light was correct, and the thing
     * still did not reach the screen.
     */
    const t = o.wallT ?? undefined;
    for (const z of clZ) {
      for (const [wx, wry] of [[x0 + 0.005, Math.PI / 2], [x1 - 0.005, -Math.PI / 2]]) {
        windowBay(B, {
          x: wx, y: 0, z, rotY: wry, t,
          w: cl.w, h: cl.head - cl.sill, sill: cl.sill, spring: cl.spring, spandrelSteps: 6,
          keys: { reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'clere', lead: 'wood' },
          mullions: 1, transoms: 2,
        });
      }
    }
  }

  // ---- the string course the clerestory stands on -------------------------
  // What makes the two rhythms read as two STOREYS rather than as one wall with holes in it.
  if (parts.stringCourse) {
    const dadoBand = dadoProfile(0.30, 0.13);
    for (const [sx, sry] of [[x0 + 0.02, Math.PI / 2], [x1 - 0.02, -Math.PI / 2]]) {
      const m = new THREE.Matrix4().makeTranslation(sx, fieldTop, sry > 0 ? z1 : z0)
        .multiply(new THREE.Matrix4().makeRotationY(sry));
      B.add('stone', extrudeProfile(dadoBand, len, { x0: 0 }), m);
    }
  }

  // ---- fluted pilasters at the bay rhythm, both long walls -----------------
  if (parts.pilasters) {
    for (const z of P.pilasterZ) {
      for (const [px, pry] of [[x0 + 0.13, Math.PI / 2], [x1 - 0.13, -Math.PI / 2]]) {
        pilaster(B, {
          x: px, y: 0.34, z, rotY: pry, h: fieldTop - 0.40, w: 0.50, proj: 0.13, flutes: 5,
          keys: { shaft: 'wall', cap: 'gilt' },
        });
      }
    }
  }

  // ---- the transverse arch ------------------------------------------------
  if (parts.arch) {
    const cz = P.archZ;
    for (const s of [-1, 1]) {
      pilaster(B, {
        x: s > 0 ? x1 - 0.26 : x0 + 0.26, y: 0.34, z: cz,
        rotY: s > 0 ? -Math.PI / 2 : Math.PI / 2,
        h: fieldTop + 0.55, w: 0.78, proj: 0.30, flutes: 3, keys: { shaft: 'stone', cap: 'gilt' },
      });
    }
    // ⚠️ EMISSION ORDER IS THE SHOWCASE'S, TERM FOR TERM. `GeoBin` merges a bucket in insertion
    // order, so keeping the order keeps the merged buffer layout as well as the picture — which
    // is what makes "the showcase render did not change" checkable rather than asserted.
    B.box('stone', wid, 0.62, 0.44, (x0 + x1) / 2, h - 1.30, cz, 1.0);
    B.add('gilt', extrudeProfile(corniceProfile(0.34, 0.20), wid, { x0 }),
      new THREE.Matrix4().makeTranslation(0, h - 1.60, cz + 0.24));
    B.add('gilt', extrudeProfile(corniceProfile(0.34, 0.20), wid, { x0 }),
      new THREE.Matrix4().makeScale(1, 1, -1)
        .premultiply(new THREE.Matrix4().makeTranslation(0, h - 1.60, cz - 0.24)));
    for (const s of [-1, 1]) {
      B.box('stone', 0.70, h - 1.62, 0.44, s > 0 ? x1 - 0.36 : x0 + 0.36, (h - 1.62) / 2, cz, 1.0);
    }
  }

  // ---- the coffered ceiling -----------------------------------------------
  // The whole top third of the showcase frame. `beam: 'wood'`, not gilt — the coffer grid runs
  // the length of the frame's top third and gilt there is a ceiling of gold; gilt stays on the
  // BOSSES, where it is an accent of a few hundred pixels.
  if (parts.ceiling) {
    cofferedCeiling(B, {
      w: wid - 0.9, d: len - 1.0, cellsX: 2, cellsZ: 9,
      y: o.ceilingY ?? h, beam: 0.26, drop: 0.28,
      x: (x0 + x1) / 2, z: (z0 + z1) / 2,
      keys: { pan: 'ceil', beam: 'wood', boss: 'gilt' },
    });
  }

  // ---- the portraits: one merged mesh into an eight-cell atlas -------------
  // Twelve sitters for one draw call. This is the motif the room is named for.
  if (parts.portraits) {
    const items = P.portraits;
    const lp = portraitWall(B, {
      x: x0 + 0.11, y: 0, z: 0, rotY: Math.PI / 2, material: o.material?.portrait,
      items, keys: { frame: 'gilt' },
    });
    if (lp) meshes.push(lp);
    const rp = portraitWall(B, {
      x: x1 - 0.11, y: 0, z: 0, rotY: -Math.PI / 2, material: o.material?.portrait,
      items: items.map((it, i) => ({ ...it, x: it.x + 1.45, cell: (i + 3) % 8 })),
      keys: { frame: 'gilt' },
    });
    if (rp) meshes.push(rp);
  }

  // ---- dressing: the "compositional emptiness" answer ----------------------
  if (parts.dressing) {
    for (const z of P.urnZ) {
      urnOnPedestal(B, { x: x0 + 0.62, y: 0, z, h: 1.25, keys: { stone: 'stone', gilt: 'gilt' } });
      urnOnPedestal(B, { x: x1 - 0.62, y: 0, z: z - 2.8, h: 1.25, keys: { stone: 'stone', gilt: 'gilt' } });
    }
    consoleTable(B, {
      x: x1 - 0.42, y: 0, z: P.consoleZ, rotY: -Math.PI / 2,
      keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' },
    });
  }

  // ⚠️ The portrait canvases are built in the builder's own frame and returned as a Mesh, not
  // put in the bin — so `base` has to be applied here or twelve paintings hang in the middle
  // of the ballroom. It is the one thing the proxy cannot catch, which is why it is stated.
  if (o.base) for (const m of meshes) m.applyMatrix4(o.base);

  return { plan: P, meshes };
}
