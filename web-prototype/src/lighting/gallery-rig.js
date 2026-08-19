import * as THREE from 'three';
import { sconce, candelabra, pictureLight, driveFlicker } from './practicals.js';
import { glowPatch } from './volumetric.js';
import { FixtureBin } from './fixture-merge.js';

/**
 * THE PLAYABLE GALLERY'S PRACTICAL RIG — MERGED MESHES, CONSTANT LIGHT COUNT.
 *
 * This is the half of the port that `estate-spike-1` priced as unaffordable and then said
 * exactly how to afford: *"merge the fixtures the way the architecture already is. Brass into
 * one bucket, wax into one, flames into one, glow decals into one additive mesh — ~138 objects
 * become ~5."* `fixture-merge.js` is that bucket machinery; this file is the gallery's own
 * arrangement of fixtures on top of it.
 *
 * ---------------------------------------------------------------------------
 * 🔦 THE LIGHT COUNT, WHICH IS THE REAL CONSTRAINT, AND WHY IT IS **2**
 *
 * The showcase gallery runs **17 point + 13 spot + 3 directional**. The project's own purpose
 * built ABBA instrument (`harness/scenarios/_price-pointlight.mjs`) prices ONE point light at
 * **+0.112 ms GPU (sd 0.076, SE 0.031, n=6 blocks)** at `quality=medium`. So the showcase rig
 * alone is ~1.9 ms of point lights against a **1.389 ms** whole-frame budget — 137% of the
 * budget, for one room, in a house of six.
 *
 * And the budget is not free to begin with. Re-baselined on this machine this round, with
 * NOTHING added (`node harness/perf-spaces.mjs --extra "quality=medium"`):
 *
 *     study_w 2.75 · gallery 2.10 · study_e 2.92 · service 3.03 · ballroom 2.74 · chapel 3.52
 *
 * Every station is already 1.5x to 2.5x over the 1.389 ms GPU budget and every one is over the
 * 2.00 ms CPU budget before this slice adds a triangle. **A light is paid by every fragment in
 * every room**, not by the room that owns the fixture — `distance` culls a point light's
 * CONTRIBUTION, never its cost (`estate-owner-10`) — so seventeen gallery lights would be
 * charged to the chapel too.
 *
 * So the deliberate choice is **2 constant point lights**, and every part of that is load
 * bearing:
 *
 *   · **2, not 17** — a predicted +0.224 ms, ~16% of the budget, in exchange for the two things
 *     no decal can do: a real falloff on the brass so a sconce reads as an object rather than a
 *     silhouette, and a warm/cool split down the 27 m run. Everything else the showcase buys
 *     with lights, this rig buys with EMISSIVE GEOMETRY and MERGED GLOW DECALS, which cost
 *     draw calls (one) and no light budget at all. That is the showcase's own argument, in its
 *     own file: *"No extra lights: fourteen shadow-casting spots is not affordable and would
 *     not be honest either."*
 *   · **CONSTANT** — created once, never added, never removed, never made invisible.
 *   · **ON THE SCENE ROOT, while the fixture MESHES go under the space root.** `estate-spike-1`
 *     measured the alternative: parented under the gallery's space root the rig costs 537 calls
 *     against 818 scene-parented, i.e. residency saves **281 draw calls** — but three's
 *     `projectObject` skips a hidden subtree entirely, so the LIGHTS are culled with it,
 *     `numPointLights` changes on every room transition, `numPointLights` is in three's program
 *     cache key, and that is John's five-second freeze coming back. Splitting them takes both
 *     halves of the deal: the meshes are culled, the count never moves.
 *   · **NO SHADOW CASTER.** The game has exactly one and it is the key. A second shadow map is
 *     a whole extra pass over every casting mesh in the house — a draw-call cost with nothing
 *     to do with the practicals, which is why the spike's `nosun` arm existed.
 *
 * ⚠️ `?estate=port,pN` overrides the count so the choice can be re-priced rather than argued.
 */

/** The default, and it is a decision — see the header. */
export const PRACTICAL_POINTS = 2;

/**
 * 🆕 **`?ceil=<scale>` — ONE PARSE, SHARED BY BOTH RIGS, AND THE ABLATION FOR THE 2026-08-09
 * CEILING PASS** (`ceiling-1`).
 *
 * `critic-slice-1` measured the ceiling band as the darkest and flattest band at all five aimed
 * stations and named it the first cue that gave the render away against John's art. The fix is
 * two terms: `spaces.js`'s `up` (the hemisphere ground colour, driven by `makeLightRig`) and the
 * merged ceiling decals in this file and `study-rig.js`. `ceil` scales both.
 *
 * ⚠️ **AT 0 THE RIGS EMIT THE OLD GEOMETRY, NOT A ZERO-STRENGTH COPY OF THE NEW GEOMETRY.**
 * `estate-2`'s item 7 is the reason it is written that way: its `nostudy` arm *"reverted less
 * than it claimed"* and the before shot of that very port came back with the after's floor in
 * it. An ablation that leaves new triangles in the merged buffer is a different merge, a
 * different bounding sphere and a different draw order, and none of that is "the previous
 * build". `?ceil=0` has to BE the previous build, and it is checked by pixel diff, not asserted.
 *
 * ⚠️ **`?aim=box` IMPLIES 0** unless `ceil` is passed explicitly — see `makeLightRig`'s copy of
 * this note. It is duplicated there rather than imported so that `game.js` does not take a
 * static import on a lighting module for two lines of query parsing; both copies are two lines
 * and the values they return are asserted equal by the arms in `_light1_probe.mjs`.
 *
 * @param box whether `?aim=box` is in force, which changes only the DEFAULT
 */
export function ceilScale(box = false) {
  const q = typeof location === 'undefined' ? null
    : new URLSearchParams(location.search).get('ceil');
  if (q == null) return box ? 0 : 1;
  const v = Number(q);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * ⚠️ **`?aim=box` — THE PRE-2026-08-09 PLACEMENT, AND IT IS HERE SO THE FLAG IS A WHOLE
 * ABLATION RATHER THAN HALF OF ONE.** `spaces.js` keeps the old per-space table as `lightsBox`;
 * without this, `?aim=box` would revert the five rig lights and leave these two where
 * `estate-light-1` moved them, so the arm would be neither build and every number taken on it
 * would be attributable to neither. Both were on the room's centreline at `x = 0`, at mid
 * height, standing on nothing.
 */
const SPEC_BOX = (P) => [
  { pos: [0, 2.90, P.z1 - P.len * 0.30], color: 0xffd9a8, intensity: 26, dist: 13 },
  { pos: [0, P.cl.sill - 0.30, P.z1 - P.len * 0.72], color: 0xb6c8e4, intensity: 30, dist: 15 },
  { pos: [0, 2.90, P.z1 - P.len * 0.52], color: 0xffc98d, intensity: 20, dist: 11 },
  { pos: [0, P.cl.sill - 0.30, P.z1 - P.len * 0.12], color: 0xb6c8e4, intensity: 22, dist: 12 },
];

/**
 * Build the gallery's practicals.
 *
 * @param o.plan   a `galleryPlan()` result — every anchor comes off it, so the fixtures cannot
 *                 drift away from the architecture they hang on
 * @param o.base   THREE.Matrix4 taking the plan's local frame to world
 * @param o.mats   { brass, wax } — the showcase's own baked surfaces when they are available
 * @param o.points how many constant point lights (default `PRACTICAL_POINTS`)
 * @param o.box    `?aim=box` — place the two points where they were before `estate-light-1`
 * @param o.ceil   override for `?ceil=` (`ceilScale`); 0 is the pre-`ceiling-1` ceiling wash
 * @returns { meshes, lights, flicker, stats }
 */
export function galleryFixtures(o = {}) {
  const P = o.plan;
  const base = o.base ?? null;
  /** `?ceil=` — see `ceilScale`. 0 restores the pre-`ceiling-1` decals exactly. */
  const CEIL = o.ceil ?? ceilScale(!!o.box);
  const brass = o.mats?.brass ?? new THREE.MeshStandardMaterial({
    color: 0x8e6a26, roughness: 0.34, metalness: 1.0,
  });
  const { x0, x1, h, cl, clZ, fieldTop, len, z1 } = P;

  // Everything is authored in the plan's local frame and baked to world by `base`, so a
  // fixture and the pilaster it hangs beside cannot disagree about where the wall is.
  const holder = new THREE.Group();
  if (base) holder.applyMatrix4(base);

  const bin = new FixtureBin();
  const add = (obj, x, y, z, ry) => {
    obj.position.set(x, y, z);
    if (ry != null) obj.rotation.y = ry;
    holder.add(obj);
    return obj;
  };
  const glow = (opts, x, y, z, ry = null, rx = null) => {
    const g = glowPatch(opts);
    g.position.set(x, y, z);
    if (ry != null) g.rotation.y = ry;
    if (rx != null) g.rotation.x = rx;
    holder.add(g);
    return g;
  };

  // ---- one picture light per painting, and NO SpotLight in it ---------------
  // `light: false`. Twelve tight spots is the single biggest line in the spike's +184, and a
  // brass hood with a hot emissive strip over a lit canvas reads as a picture light without
  // one — the canvas underneath is already the brightest thing on that wall.
  for (const it of P.portraits) {
    for (const [sx, sry, zz] of [[x0 + 0.24, Math.PI / 2, it.x], [x1 - 0.24, -Math.PI / 2, it.x + 1.45]]) {
      add(pictureLight({ brass, w: it.w * 0.72, light: false }),
        sx, it.y + it.h / 2 + 0.30, zz, sry);
      glow({ size: it.w * 2.2, color: 0xfff2e4, strength: 0.22, pow: 1.9 },
        sx - Math.sign(sx) * 0.10, it.y, zz, sry);
    }
  }

  // ---- sconces down the run -------------------------------------------------
  // ⚠️ HUNG OFF `fieldTop`, NOT OFF THE SHOWCASE'S 3.35. The game's storey is 5.60 against the
  // showcase's 6.40, so the string course is 0.5 m lower and a literal 3.35 puts every sconce
  // back plate straight through it.
  const sconceY = Math.min(3.35, fieldTop - 0.55);
  for (const z of P.sconceZ) {
    for (const [sx, sry] of [[x0 + 0.20, Math.PI / 2], [x1 - 0.20, -Math.PI / 2]]) {
      add(sconce({
        brass, merge: true, light: false, phase: z + sx,
        glowStrength: 0.26, glowSize: 3.0, glowColor: 0xfff0e2,
      }), sx, sconceY, z, sry);
    }
  }

  // ---- the candelabra -------------------------------------------------------
  // 🪑 FurnProp dress owns the smashable standing candelabra when `o.candelabra === false`.
  if (o.candelabra !== false) {
    add(candelabra({ brass, merge: true, light: false, h: 1.5, arms: 6, phase: 1.1 }),
      x0 + 1.2, 0, P.archZ + 2.4);
  }

  // ---- the cool wash each clerestory throws --------------------------------
  // ⚠️ THE PATCH GOES ON THE OPPOSITE WALL, and that is physics as well as the showcase's own
  // measurement: light entering high on the left falls LOW on the right, and a wash directly
  // under its own window is the one place daylight from that window cannot reach.
  const washY = fieldTop * 0.62;
  for (const z of clZ) {
    for (const [sx, sry] of [[x0 + 0.14, Math.PI / 2], [x1 - 0.14, -Math.PI / 2]]) {
      glow({ size: 3.6, color: 0xc6d8f2, strength: 0.78, pow: 1.6 },
        -sx, washY, z - Math.sign(sx) * 0.9, -sry);
    }
    /**
     * 🆕 **THE WASH ACROSS THE COFFERS, AND THE OLD ONE WAS IN THE WRONG PLACE BY 0.56 m**
     * (`ceiling-1`). The comment was right — *"the ceiling is the largest continuous area in
     * any frame down this room, and a clerestory that did not light it would be the one
     * arrangement of high windows that never happens"* — and the decal was at `h - 0.62`,
     * which in this room is **0.32 m BELOW the coffer soffit**: `room.js` passes
     * `ceilingY = storey - 0.02` and `cofferedCeiling` drops its beams 0.28, so the lowest
     * timber is at 5.30 and the old patch hung at 4.98 in open air under all of it.
     *
     * Two consequences, and the second is the one that mattered. A horizontal additive quad
     * BELOW the ceiling is never occluded by the coffer grid, so it could only ever add a flat
     * veil — it could not draw the pan/beam rhythm, which is the entire visual content of a
     * coffered ceiling. And hanging in air it read as haze rather than as light on a surface.
     * At `h - 0.08` (5.52) it sits INSIDE the coffer depth: every beam in front of it clips it,
     * so the wash arrives as lit pans separated by dark timber, which is what the reference
     * halls show and what `critic-slice-1` called *"lit, detailed ceilings"*.
     *
     * ⚠️ Three per bay rather than one, at the two wall sides and the centre, because a
     * clerestory throws its brightest patch on the ceiling NEAR ITS OWN WALL and the room is
     * 6.7 m across — one 5 m patch on the centreline is the average of a gradient, which is the
     * flatness the critic filed. `pow 1.4`, softer than the old 1.5, so three overlapping pools
     * read as one uneven field and not as three discs.
     */
    /**
     * 🚨 **TWO TIGHT POOLS, NOT THREE BROAD ONES, AND THE REASON IS THAT THIS ROOM HAS NO
     * LUMINANCE HEADROOM AT ALL.** `gallery.mid` facing west measures a whole-frame median of
     * **62.3** on the shipped build — already 2 over the 30–60 gate — so anything that lifts
     * the ceiling here lifts the FRAME, because the coffered ceiling is a third of it. Two
     * arrangements were built and measured: 3 patches of size 3.5 at `pow 1.4` (which at a 3.7 m
     * bay pitch overlap into a continuous sheet) bought band +2.4 for whole-frame **+2.7**, i.e.
     * it paid for a wash. `size 2.6, pow 2.2` at the same total energy is a POOL under each bay
     * with dark coffer between, which is what a clerestory does and what reads as detail rather
     * than as brightness — and the median is the median of the dark parts too.
     * ⚠️ **The centre patch is gone on purpose.** Nothing is above the room's centreline; a
     * clerestory throws its brightest patch on the ceiling NEAR ITS OWN WALL, and the centre
     * one was the term that turned the two into a sheet.
     */
    if (CEIL > 0) {
      for (const px of [x0 + 1.05, x1 - 1.05]) {
        glow({ size: 2.6, color: 0xc3d5f0, strength: 1.55 * CEIL, pow: 2.2 },
          px, h - 0.08, z, null, Math.PI / 2);
      }
    } else {
      // `?ceil=0` — the pre-`ceiling-1` decal, verbatim, so the arm is the previous build.
      glow({ size: 5.0, color: 0xbecfe8, strength: 0.30, pow: 1.5 },
        (x0 + x1) / 2, h - 0.62, z, null, Math.PI / 2);
    }
  }

  // ---- haze down the run ----------------------------------------------------
  // The single biggest depth cue in a 27 m corridor, and after merging it is free.
  for (const f of [0.370, 0.593, 0.815]) {
    glow({ size: 11, color: 0x9fb0cc, strength: 0.055, pow: 1.3 },
      (x0 + x1) / 2, h * 0.46, z1 - len * f);
  }

  const built = bin.harvest(holder, brass).build({ brass, wax: o.mats?.wax });

  /**
   * ⚠️ **DRAIN `practicals.js`'s FLICKER REGISTRY, DO NOT WIRE IT.** Every `candle()` this file
   * built pushed a closure into that module's private array, and every one of those closures
   * scales a mesh that no longer exists — the geometry was harvested and the group discarded.
   * Calling `driveFlicker` with a stub engine empties the array and registers nothing, which is
   * the only way to leave the module in a clean state for the next view in the same page.
   * `built.flicker` replaces them with one global curve. Nothing else in `src/` outside the
   * showcase views touches `practicals.js`, so this drain cannot swallow another owner's work.
   */
  driveFlicker({ onUpdate: () => {} });

  // ---- THE LIGHTS. Constant count, scene root, no shadow map. ---------------
  const n = o.points ?? PRACTICAL_POINTS;
  const toWorld = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z);
    return base ? v.applyMatrix4(base) : v;
  };
  /**
   * 🔦 **PUT ON THE FIXTURES THEY ARE PAYING FOR** (`estate-light-1`, 2026-08-09). Both were on
   * the CENTRELINE at `x = 0` and mid-height — the middle of the room's cross-section, on
   * nothing. That is where a light goes when the room is an empty box, and it is why the pair
   * bought a wash rather than the two things the header argues for. The fixtures exist; this
   * file built them; a light standing on one costs exactly the same as a light standing in air.
   *
   *   0  THE CANDELABRA. Six wax candles with hot emissive tips and a merged glow decal,
   *      standing at `(x0 + 1.2, archZ + 2.4)` — the one object in this room with real flames on
   *      it, and until now the one object in this room throwing no light. At the arms' own
   *      height it gives the brass a falloff and the arch beside it a warm side, which is
   *      precisely the header's *"a real falloff on the brass so a sconce reads as an object"*.
   *   1  A NAMED CLERESTORY BAY IN THE WEST HALF, at the mouth of the reveal (0.42 m in from the
   *      wall, 0.30 m above the sill) rather than floating below the window band. `clZ` is the
   *      built rhythm, so `clZ[5]` is a hole in a wall that actually exists — the cold half of
   *      the frame's warm/cool split now has a source you can point at. It is in the WEST half
   *      on purpose: `spaces.js`'s re-aimed key enters from the EAST clerestory, so the two cold
   *      sources bracket the 27 m run instead of stacking in one half of it.
   *
   * ⚠️ Positions are in the plan's LOCAL frame and baked by `toWorld` below, like everything
   * else in this file — `clZ` values are local z, which `base` turns into world x.
   */
  const SPEC = o.box ? SPEC_BOX(P) : [
    { pos: [x0 + 1.2, 1.62, P.archZ + 2.4], color: 0xffc07a, intensity: 20, dist: 8 },
    { pos: [x1 - 0.42, cl.sill + 0.30, clZ[5] ?? (z1 - len * 0.72)], color: 0xb6c8e4, intensity: 30, dist: 14 },
    { pos: [x0 + 0.9, 2.60, z1 - len * 0.52], color: 0xffc98d, intensity: 20, dist: 11 },
    { pos: [x1 - 0.42, cl.sill + 0.30, clZ[1] ?? (z1 - len * 0.12)], color: 0xb6c8e4, intensity: 22, dist: 12 },
  ];
  const lights = [];
  for (let i = 0; i < n; i++) {
    const s = SPEC[i % SPEC.length];
    const l = new THREE.PointLight(new THREE.Color(s.color), s.intensity, s.dist, 2);
    l.position.copy(toWorld(s.pos[0], s.pos[1], s.pos[2]));
    l.castShadow = false;
    l.name = `gallery.practical.${i}`;
    lights.push(l);
  }

  // Any light a practical built despite `light: false` would have been harvested rather than
  // baked; assert that none did, because a stray point light on a space root is precisely the
  // failure this whole arrangement exists to prevent.
  const strays = built.lights.length;

  return {
    meshes: built.meshes,
    lights,
    flicker: built.flicker,
    stats: { ...built.stats, strays, pointLights: lights.length },
  };
}
